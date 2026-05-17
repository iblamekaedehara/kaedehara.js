/**
 * Type-aware media fallback system.
 *
 * Semantic hierarchy:
 *   Game → game fallback
 *   Music → music fallback
 *   Coding/dev tools → code fallback
 *   Browser/web → browser fallback
 *   Chat → chat fallback
 *   Unknown → neutral generic fallback
 *
 * Game detection uses Discord activity type (type 0 = PLAYING = game)
 * rather than hardcoded appid sets. This handles launcher games,
 * custom Discord rich presence apps, and any new game automatically.
 *
 * NEVER uses Steam branding as a universal fallback.
 *
 * IMPORTANT: All referenced fallback assets MUST exist in /public/assets/.
 * If creating new categories, create the SVG file first.
 */

export type ActivityCategory = "game" | "music" | "code" | "browser" | "chat" | "unknown";

const CODE_APPS = new Set([
  "383226320970154001", "782685898163617802", "810516608442695700",
  "1013815396358889493",
]);

const CHAT_APPS = new Set(["496665455737176104", "822967278369734666"]);

const MUSIC_APPS = new Set(["880218394199220334"]);

/**
 * @param applicationId — Discord application_id from the activity
 * @param name — activity name (e.g. "Visual Studio Code", "Minecraft")
 * @param activityType — Discord activity type (0 = GAME/PLAYING, 1 = STREAMING,
 *   2 = LISTENING/SPOTIFY, 3 = WATCHING, 4 = CUSTOM, 5 = COMPETING)
 */
export function categorizeActivity(
  applicationId?: string,
  name?: string,
  activityType?: number,
): ActivityCategory {
  // type 0 = PLAYING — definitive game signal, overrides everything
  if (activityType === 0) return "game";

  const appId = applicationId ?? "";

  // Known app-id sets (safety net for edge cases where type is undefined)
  if (MUSIC_APPS.has(appId)) return "music";
  if (CHAT_APPS.has(appId)) return "chat";
  if (CODE_APPS.has(appId)) return "code";

  // Name-based heuristics (fallback when type is unavailable or ambiguous)
  const n = (name ?? "").toLowerCase();
  if (n.includes("code") || n.includes("visual studio") || n.includes("intellij") || n.includes("terminal")) return "code";
  if (n.includes("chrome") || n.includes("firefox") || n.includes("edge") || n.includes("browser")) return "browser";
  if (n.includes("discord") || n.includes("telegram") || n.includes("whatsapp")) return "chat";
  if (n.includes("spotify") || n.includes("music") || n.includes("youtube music")) return "music";

  return "unknown";
}

const FALLBACK_MAP: Record<ActivityCategory, string> = {
  game: "/assets/game-fallback.svg",
  music: "/assets/generic-fallback.svg",
  code: "/assets/code-fallback.svg",
  browser: "/assets/generic-fallback.svg",
  chat: "/assets/generic-fallback.svg",
  unknown: "/assets/generic-fallback.svg",
};

export function getFallbackIcon(category: ActivityCategory): string {
  return FALLBACK_MAP[category] ?? "/assets/generic-fallback.svg";
}