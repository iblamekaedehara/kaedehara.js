/**
 * Discord CDN asset URL helpers and generic fallbacks.
 *
 * ARCHITECTURE: Discord CDN is OPTIONAL best-effort only.
 * Discord RPC should only provide identity + metadata (app name, details, state).
 * Artwork authority lives in the unified resolver (artwork-resolver.ts) —
 * Steam CDN → SteamGridDB → persistent cache.
 *
 * On image load failure in PresenceCard, handleImageError calls /api/game-image
 * which delegates to the unified artwork resolver.
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
  return "/assets/generic-fallback.svg";
}
