/**
 * Discord CDN asset URL helpers and deterministic fallback resolution.
 *
 * FEATURES for developers:
 * - Construct Discord CDN asset/avatar URLs
 * - The activity-icons module handles category-aware fallbacks (game/music/code/etc.)
 * - This module provides generic "nothing worked" fallbacks and URL construction
 * - Steam assets are NOT used as universal fallbacks (per architecture audit)
 */

const DISCORD_CDN_BASE = "https://cdn.discordapp.com";

export function getDiscordAssetUrl(
  applicationId: string,
  assetId: string,
  format: "png" | "webp" = "webp",
  size: number = 128
): string {
  return `${DISCORD_CDN_BASE}/app-assets/${applicationId}/${assetId}.${format}?size=${size}`;
}

export function getDiscordAvatarUrl(
  userId: string,
  avatarHash: string,
  format: "png" | "webp" | "gif" = "webp",
  size: number = 128
): string {
  const isGif = avatarHash.startsWith("a_");
  const actualFormat = format === "gif" ? (isGif ? "gif" : "png") : format;
  return `${DISCORD_CDN_BASE}/avatars/${userId}/${avatarHash}.${actualFormat}?size=${size}`;
}

/**
 * Generic neutral fallback — NEVER use Steam branding as universal fallback.
 * Category-specific fallbacks are in activity-icons.ts.
 */
export function getGenericFallback(): string {
  return "/assets/game-fallback.svg";
}
