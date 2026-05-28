/**
 * Resolve a square activity icon for presence cards.
 *
 * Uses ONLY the SteamGridDB icons tab. No fallback to grids,
 * Steam CDN, or store search. Returns a finalized ActivityIconMedia
 * object — never a raw URL.
 */
import * as SGDB from "../providers/sgdb";
import type { ActivityIconMedia } from "../contracts";
import { FALLBACK_PLACEHOLDER } from "../contracts";

export async function resolveActivityIcon(gameName: string): Promise<ActivityIconMedia> {
  // Pass raw display name — SGDB autocomplete needs natural language, not a slug
  const gameId = await SGDB.searchGame(gameName);
  if (gameId) {
    const iconUrl = await SGDB.fetchIcons(gameId);
    if (iconUrl) {
      return {
        role: "activity-icon",
        provider: "sgdb-icon",
        url: iconUrl,
        aspectRatio: "square",
      };
    }
    console.warn(`[media] SGDB: no PNG icon found for gameId=${gameId} (name="${gameName}")`);
  } else {
    console.warn(`[media] SGDB: game not found for name="${gameName}"`);
  }

  return {
    role: "activity-icon",
    provider: "fallback",
    url: FALLBACK_PLACEHOLDER,
    aspectRatio: "square",
  };
}
