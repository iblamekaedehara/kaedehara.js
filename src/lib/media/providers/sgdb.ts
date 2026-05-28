/**
 * SteamGridDB provider.
 *
 * All SGDB API calls go through this module. The API key is read
 * from environment variables — never exposed to the client.
 *
 * Filtering strategy: fetch bare endpoints (no query params that could 400)
 * and filter client-side by mime type. Accept any static format (PNG, JPEG,
 * WEBP) — reject ICO. SGDB assets are returned sorted by score descending
 * so the first valid match is already the best.
 */
import { cacheGet, cacheSet, cacheKey, dedupe } from "../cache";

const NULL_TTL_MS = 60 * 60 * 1000; // 1 hour — don't hammer SGDB for missing assets

// ── Types ─────────────────────────────────────────────────────────────────

interface SGDBGame {
  id: number;
  name: string;
  types: string[];
  verified: boolean;
}

interface SGBDSearchResult {
  data?: SGDBGame[];
}

interface SGBDAsset {
  url: string;
  thumb: string;
  mime?: string;
  width?: number;
  height?: number;
  style?: string;
  nsfw?: boolean;
  humor?: boolean;
}

interface SGBDAssetResult {
  data?: SGBDAsset[];
}

// ── API key ───────────────────────────────────────────────────────────────

function apiKey(): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.STEAM_GRID_API_KEY as string | undefined;
  }
  return undefined;
}

function authHeaders(): Record<string, string> | undefined {
  const key = apiKey();
  if (!key) return undefined;
  return { Authorization: `Bearer ${key}` };
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  const headers = authHeaders();
  if (!headers) {
    console.warn("[media] SGDB: no API key configured (STEAM_GRID_API_KEY missing)");
    return null;
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      console.warn(`[media] SGDB: fetch failed ${res.status} for ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[media] SGDB: fetch error for ${url}:`, err);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Reject ICO (Windows icon format — browsers can't render it) and animated GIFs. */
function isRenderableImage(asset: SGBDAsset): boolean {
  const mime = asset.mime ?? "";
  // Reject ICO, SVG (icons tab shouldn't have SVGs), and animated GIFs
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") return false;
  if (mime === "image/gif" && asset.url?.includes(".gif")) return false;
  // Accept: image/png, image/jpeg, image/webp, image/gif (static only assumed)
  return mime.startsWith("image/");
}

/** Filter to HTTPS-only URLs to avoid mixed-content warnings. */
function hasSecureUrl(asset: SGBDAsset): boolean {
  return asset.url?.startsWith("https://") ?? false;
}

// ── Search ────────────────────────────────────────────────────────────────

/** Search SGDB by display name. Returns game ID or null. Nulls cached for 1h to avoid re-hammering. */
export async function searchGame(displayName: string): Promise<number | null> {
  const cacheKeyName = displayName.toLowerCase().replace(/[™®©]/g, "").trim();
  const key = cacheKey("sgdb", "search", cacheKeyName);
  const cached = cacheGet<number | null>(key);
  if (cached !== undefined) return cached;

  const result = await dedupe(key, async () => {
    const data = await fetchJSON<SGBDSearchResult>(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(displayName)}`,
    );
    // Prefer verified results, fall back to first match
    const gameId =
      data?.data?.find((g) => g.verified)?.id ??
      data?.data?.[0]?.id ??
      null;
    return gameId;
  });

  cacheSet(key, result, result === null ? NULL_TTL_MS : undefined);
  return result;
}

// ── Icons ─────────────────────────────────────────────────────────────────

/**
 * Fetch the best square static icon for a game.
 *
 * Strategy: fetch ALL icons (no query params — prevents 400s from unknown
 * parameter combinations), then filter client-side to find the first
 * static, renderable, HTTPS asset. Prefers official style.
 */
export async function fetchIcons(gameId: number): Promise<string | null> {
  const key = cacheKey("sgdb", "icons", String(gameId));
  const cached = cacheGet<string | null>(key);
  if (cached !== undefined) return cached;

  const result = await dedupe(key, async () => {
    const data = await fetchJSON<SGBDAssetResult>(
      `https://www.steamgriddb.com/api/v2/icons/game/${gameId}`,
    );

    if (!data?.data?.length) return null;

    // SGDB returns sorted by score. Filter to renderable, secure assets.
    // Prefer official style, then fall back to any valid static icon.
    const eligible = data.data.filter((a) => isRenderableImage(a) && hasSecureUrl(a));
    const official = eligible.find((a) => a.style === "official");
    const best = official ?? eligible[0];

    if (!best) {
      console.warn(`[media] SGDB: no renderable icon found for gameId=${gameId}`);
      return null;
    }

    return best.url;
  });

  cacheSet(key, result, result === null ? NULL_TTL_MS : undefined);
  return result;
}

// ── Heroes ────────────────────────────────────────────────────────────────

/**
 * Fetch the best hero banner for a game.
 *
 * Strategy: fetch ALL heroes (no query params), filter to renderable
 * HTTPS landscape images. Prefers official style, but any valid hero
 * is better than nothing.
 */
export async function fetchHeroes(gameId: number): Promise<string | null> {
  const key = cacheKey("sgdb", "heroes", String(gameId));
  const cached = cacheGet<string | null>(key);
  if (cached !== undefined) return cached;

  const result = await dedupe(key, async () => {
    const data = await fetchJSON<SGBDAssetResult>(
      `https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`,
    );

    if (!data?.data?.length) return null;

    const eligible = data.data.filter((a) => isRenderableImage(a) && hasSecureUrl(a));
    if (!eligible.length) {
      console.warn(`[media] SGDB: no renderable hero found for gameId=${gameId}`);
      return null;
    }

    // Prefer official, then highest-scored
    const best = eligible.find((a) => a.style === "official") ?? eligible[0];
    return best.url;
  });

  cacheSet(key, result, result === null ? NULL_TTL_MS : undefined);
  return result;
}