/**
 * Resolve a landscape hero/banner for the Steam activity section.
 *
 * Priority:
 *  1. SteamGridDB heroes (best quality, landscape)
 *  2. Steam CDN (deterministic URL, no network probe)
 */
import * as SGDB from "../providers/sgdb";
import { fetchSteamHero as fetchCDNHero } from "../providers/steam-cdn";
import type { SteamHeroMedia } from "../contracts";

export async function resolveSteamHero(
  appid: number,
  gameName: string,
): Promise<SteamHeroMedia> {
  // Step 1: SteamGridDB heroes — pass raw display name for autocomplete
  const gameId = await SGDB.searchGame(gameName);
  if (gameId) {
    const heroUrl = await SGDB.fetchHeroes(gameId);
    if (heroUrl) {
      return {
        role: "steam-hero",
        provider: "sgdb-hero",
        url: heroUrl,
        aspectRatio: "landscape",
      };
    }
  }

  // Step 2: Steam CDN deterministic URL (always returns a value)
  console.warn(`[media] Steam hero: falling back to Steam CDN for appid=${appid} name="${gameName}"`);
  const cdnUrl = fetchCDNHero(appid);
  return {
    role: "steam-hero",
    provider: "steam-cdn",
    url: cdnUrl,
    aspectRatio: "landscape",
  };
}
