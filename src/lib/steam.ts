import { resolveBestArtworkUrl } from "./artwork-resolver";

export interface SteamGameData {
  appid: number;
  name: string;
  playtimeHours: number;
  playtimeTwoWeeks?: number;
  lastPlayed: string;
  lastPlayedTimestamp: number;
  imageUrl: string;
  iconUrl?: string;
}

export interface SteamResult {
  games: SteamGameData[];
  totalPlaytime: number;
}

interface SteamGameRaw {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
  img_icon_url?: string;
  img_logo_url?: string;
}

interface SteamResponse {
  response?: { game_count?: number; games?: SteamGameRaw[] };
}

interface SteamStoreSearchResult {
  items?: { id: number; name: string; tiny_image: string }[];
}

function formatLastPlayed(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Non-Steam games (locally added) get synthetic appids >= 2^31
const NON_STEAM_THRESHOLD = 2_000_000_000;

// Cache of resolved real appids for non-Steam game names
const _resolvedAppIdCache = new Map<string, number | null>();
const RESOLVED_CACHE_TTL_MS = 24 * 3600_000; // 24 hours
let _cacheLastPurged = Date.now();

/**
 * For non-Steam shortcuts, search the public Steam store API by name
 * to find the real Steam appid (and therefore real CDN artwork).
 * Returns the real appid, or null if no match found.
 */
async function resolveNonSteamAppId(name: string): Promise<number | null> {
  // Purge cache once per day
  if (Date.now() - _cacheLastPurged > RESOLVED_CACHE_TTL_MS) {
    _resolvedAppIdCache.clear();
    _cacheLastPurged = Date.now();
  }

  const cached = _resolvedAppIdCache.get(name);
  if (cached !== undefined) return cached;

  try {
    const searchUrl = new URL("https://store.steampowered.com/api/storesearch/");
    searchUrl.searchParams.set("term", name);
    searchUrl.searchParams.set("l", "en");
    searchUrl.searchParams.set("cc", "us");

    const res = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      _resolvedAppIdCache.set(name, null);
      return null;
    }

    const data: SteamStoreSearchResult = await res.json();
    const items = data?.items ?? [];

    // Find the closest name match (Steam store search is fuzzy)
    const lower = name.toLowerCase();
    const match = items.find((item) => item.name.toLowerCase() === lower)
      ?? items[0]; // fallback to first result

    if (match?.id) {
      _resolvedAppIdCache.set(name, match.id);
      return match.id;
    }

    _resolvedAppIdCache.set(name, null);
    return null;
  } catch {
    _resolvedAppIdCache.set(name, null);
    return null;
  }
}

let _steamCache: { data: SteamResult; ts: number } | null = null;
const STEAM_CACHE_TTL_MS = 3600_000; // 1 hour

export async function fetchSteamData(): Promise<SteamResult> {
  if (_steamCache && Date.now() - _steamCache.ts < STEAM_CACHE_TTL_MS) return _steamCache.data;

  const apiKey = import.meta.env.STEAM_WEB_API;
  const steamId = import.meta.env.STEAM_USER_ID || "76561199405350051";

  if (!apiKey) {
    console.warn("[steam] No STEAM_WEB_API key found");
    return { games: [], totalPlaytime: 0 };
  }

  try {
    const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("steamid", steamId);
    url.searchParams.set("format", "json");
    url.searchParams.set("include_appinfo", "1");
    url.searchParams.set("include_played_free_games", "1");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    const data: SteamResponse = await res.json();

    if (!data?.response?.games) return { games: [], totalPlaytime: 0 };

    const all = data.response.games;

    const totalPlaytimeMinutes = all.reduce((s, g) => s + (g.playtime_forever || 0), 0);
    const totalPlaytimeHours = Math.round(totalPlaytimeMinutes / 60);

    const raw = all
      .filter((g) => g.rtime_last_played && g.rtime_last_played > 0)
      .sort((a, b) => (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0))
      .slice(0, 3);

    // Resolve real appids for non-Steam games, then resolve artwork for all games
    const resolved = await Promise.all(
      raw.map(async (g) => {
        let effectiveAppId = g.appid;
        let isNonSteam = false;

        if (g.appid >= NON_STEAM_THRESHOLD) {
          isNonSteam = true;
          const realAppId = await resolveNonSteamAppId(g.name);
          if (realAppId) effectiveAppId = realAppId;
        }

        // Resolve artwork through the unified pipeline for known appids
        let imageUrl = "";
        if (!isNonSteam || effectiveAppId !== g.appid) {
          // Real Steam appid — use the unified resolver (Steam CDN → SteamGridDB)
          const resolvedUrl = await resolveBestArtworkUrl(effectiveAppId, g.name);
          imageUrl = resolvedUrl ?? "";
        }
        // For unresolved non-Steam games, imageUrl stays empty — triggers onerror fallback in SteamCard

        return {
          appid: effectiveAppId,
          name: g.name,
          playtimeHours: Math.round((g.playtime_forever / 60) * 10) / 10,
          lastPlayed: formatLastPlayed(g.rtime_last_played ?? 0),
          lastPlayedTimestamp: g.rtime_last_played ?? 0,
          imageUrl,
          iconUrl:
            (effectiveAppId < NON_STEAM_THRESHOLD) && g.img_icon_url
              ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${effectiveAppId}/${g.img_icon_url}.jpg`
              : undefined,
        };
      }),
    );

    const games: SteamGameData[] = resolved.map((g) => ({
      appid: g.appid,
      name: g.name,
      playtimeHours: g.playtimeHours,
      lastPlayed: g.lastPlayed,
      lastPlayedTimestamp: g.lastPlayedTimestamp,
      imageUrl: g.imageUrl,
      iconUrl: g.iconUrl,
    }));

    return { games, totalPlaytime: totalPlaytimeHours };
  } catch (e) {
    console.error("[steam] Failed:", e);
    return { games: [], totalPlaytime: 0 };
  }
}