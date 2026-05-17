/**
 * Unified Artwork Resolution Layer
 *
 * Architecture principle: presence detection, identity resolution, artwork resolution,
 * and caching are independent systems. Sources provide identity + metadata; this layer
 * owns visuals, caching, normalization, and fallback handling.
 *
 * Pipeline: AppID + Game Name → Normalize → Check Cache → Try Steam CDN → Try SteamGridDB → Cache
 */

import { normalizeGameName } from "./normalize-name";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ResolvedArtwork {
  hero: string | null;
  capsule: string | null;
  logo: string | null;
  source: "steam-cdn" | "steamgriddb";
  resolvedAt: number;
}

export interface ArtworkCacheEntry {
  steamAppid: number;
  normalizedName: string;
  artwork: ResolvedArtwork;
  /** timestamp of when this was resolved, used for TTL */
  resolvedAt: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────

const artworkCache = new Map<string, ArtworkCacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Steam CDN candidates ──────────────────────────────────────────────────

/**
 * Build candidate Steam CDN URLs for an appid.
 * Order: header → capsule → library_hero → hero_capsule → store header (shared CDN)
 */
function getSteamCandidateUrls(appid: number): string[] {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/hero_capsule.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  ];
}

// ── Steam CDN validation ──────────────────────────────────────────────────

/**
 * Validate a Steam CDN URL by fetching it with GET (NOT HEAD).
 * Steam CDN behaves inconsistently with HEAD; many valid images fail HEAD.
 * We check: response ok AND content-type starts with "image/".
 */
async function validateSteamImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type");
    return ct !== null && ct.startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * Try all Steam CDN candidate URLs in parallel and return the first valid one.
 * Parallelizes all fetches so failures don't accumulate serial latency.
 */
async function trySteamCDN(appid: number): Promise<string | null> {
  const candidates = getSteamCandidateUrls(appid);
  try {
    const result = await Promise.any(
      candidates.map(async (url) => {
        const valid = await validateSteamImage(url);
        if (valid) return url;
        throw new Error("invalid");
      }),
    );
    return result;
  } catch {
    // All candidates failed
    return null;
  }
}

// ── SteamGridDB provider ──────────────────────────────────────────────────

interface SteamGridDBSearchResult {
  data?: { id: number; name: string; types: string[] }[];
}

interface SteamGridDBGridResult {
  data?: { url: string; thumb: string }[];
}

function getSteamGridDBApiKey(): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.STEAM_GRID_API_KEY as string | undefined;
  }
  return undefined;
}

/**
 * Search SteamGridDB for a game by normalized name.
 */
async function searchSteamGridDB(normalizedName: string): Promise<number | null> {
  const apiKey = getSteamGridDBApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(normalizedName)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as SteamGridDBSearchResult;
    const gameId = data?.data?.[0]?.id;
    return gameId ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch grids (heroes, capsules) from SteamGridDB for a given game ID.
 * Prefer 460x215 or 920x430 for landscape card formats.
 */
async function fetchSteamGridDBGrids(
  gameId: number,
): Promise<{ hero: string | null; capsule: string | null }> {
  const apiKey = getSteamGridDBApiKey();
  if (!apiKey) return { hero: null, capsule: null };

  try {
    const res = await fetch(
      `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=460x215,920x430`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return { hero: null, capsule: null };
    const data = (await res.json()) as SteamGridDBGridResult;
    const grids = data?.data ?? [];
    const hero = grids.find((g) => g.url)?.url ?? null;
    return { hero, capsule: hero }; // same best grid for both hero and capsule
  } catch {
    return { hero: null, capsule: null };
  }
}

// ── Main resolution function ──────────────────────────────────────────────

/**
 * Resolve artwork for a game given its appid and display name.
 *
 * Returns cached results immediately if available and within TTL.
 * Otherwise runs the full pipeline: Steam CDN → SteamGridDB → cache.
 *
 * @param appid - Steam app ID (or resolved appid for non-Steam games)
 * @param gameName - Display name from presence data
 */
export async function resolveGameArtwork(
  appid: number,
  gameName: string,
): Promise<ResolvedArtwork> {
  const normalizedName = normalizeGameName(gameName);

  // Check cache
  const cacheKey = `${appid}:${normalizedName}`;
  const cached = artworkCache.get(cacheKey);
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
    return cached.artwork;
  }

  let resolved: ResolvedArtwork | null = null;

  // Step 1: Try Steam CDN
  const steamCdnUrl = await trySteamCDN(appid);
  if (steamCdnUrl) {
    resolved = {
      hero: steamCdnUrl,
      capsule: steamCdnUrl,
      logo: null,
      source: "steam-cdn",
      resolvedAt: Date.now(),
    };
  }

  // Step 2: Fall back to SteamGridDB
  if (!resolved || !resolved.hero) {
    const gameId = await searchSteamGridDB(normalizedName);
    if (gameId) {
      const { hero, capsule } = await fetchSteamGridDBGrids(gameId);
      if (hero || capsule) {
        resolved = {
          hero,
          capsule,
          logo: null,
          source: "steamgriddb",
          resolvedAt: Date.now(),
        };
      }
    }
  }

  // If nothing worked, cache the null result to avoid repeated lookups
  if (!resolved) {
    resolved = {
      hero: null,
      capsule: null,
      logo: null,
      source: "steamgriddb",
      resolvedAt: Date.now(),
    };
  }

  // Persist to cache
  artworkCache.set(cacheKey, {
    steamAppid: appid,
    normalizedName,
    artwork: resolved,
    resolvedAt: resolved.resolvedAt,
  });

  return resolved;
}

/**
 * Quick resolve: just get the best image URL (hero) for a game.
 * Used by API routes and inline resolution paths.
 */
export async function resolveBestArtworkUrl(
  appid: number,
  gameName: string,
): Promise<string | null> {
  const artwork = await resolveGameArtwork(appid, gameName);
  return artwork.hero ?? artwork.capsule ?? artwork.logo;
}

/**
 * Resolve artwork using ONLY game name (no appid). Tries SteamGridDB directly.
 * Used when no appid is available (e.g., Discord RPC from non-Steam apps).
 */
export async function resolveArtworkByName(gameName: string): Promise<string | null> {
  const normalizedName = normalizeGameName(gameName);

  // Check cache by name only
  const cacheKey = `name:${normalizedName}`;
  const cached = artworkCache.get(cacheKey);
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
    return cached.artwork.hero ?? cached.artwork.capsule ?? cached.artwork.logo;
  }

  const apiKey = getSteamGridDBApiKey();
  if (!apiKey) return null;

  const gameId = await searchSteamGridDB(normalizedName);
  if (!gameId) return null;

  const { hero, capsule } = await fetchSteamGridDBGrids(gameId);
  const best = hero ?? capsule ?? null;

  const artwork: ResolvedArtwork = {
    hero: best,
    capsule: best,
    logo: null,
    source: "steamgriddb",
    resolvedAt: Date.now(),
  };

  artworkCache.set(cacheKey, {
    steamAppid: 0,
    normalizedName,
    artwork,
    resolvedAt: artwork.resolvedAt,
  });

  return best;
}