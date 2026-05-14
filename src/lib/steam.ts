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

    const games: SteamGameData[] = all
      .filter((g) => g.rtime_last_played && g.rtime_last_played > 0)
      .sort((a, b) => (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0))
      .slice(0, 3)
      .map((g) => ({
        appid: g.appid,
        name: g.name,
        playtimeHours: Math.round((g.playtime_forever / 60) * 10) / 10,
        lastPlayed: formatLastPlayed(g.rtime_last_played ?? 0),
        lastPlayedTimestamp: g.rtime_last_played ?? 0,
        imageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
        iconUrl: g.img_icon_url
          ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
          : undefined,
      }));

    return { games, totalPlaytime: totalPlaytimeHours };
  } catch (e) {
    console.error("[steam] Failed:", e);
    return { games: [], totalPlaytime: 0 };
  }
}