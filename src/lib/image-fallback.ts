/**
 * Discord CDN avatar URL helper.
 */
const DISCORD_CDN_BASE = "https://cdn.discordapp.com";

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
