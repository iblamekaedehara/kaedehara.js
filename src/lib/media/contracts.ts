/**
 * Semantic media contracts.
 *
 * Every media asset has a role, a provider, and a known aspect ratio.
 * Components receive finalized media objects — never raw unresolved URLs.
 */

export type MediaRole = "activity-icon" | "steam-hero";

export type AspectRatio = "square" | "landscape" | "portrait";

export type ActivityIconProvider = "sgdb-icon" | "fallback";
export type SteamHeroProvider = "sgdb-hero" | "steam-cdn" | "fallback";

export interface ActivityIconMedia {
  role: "activity-icon";
  provider: ActivityIconProvider;
  url: string;
  aspectRatio: "square";
}

export interface SteamHeroMedia {
  role: "steam-hero";
  provider: SteamHeroProvider;
  url: string;
  aspectRatio: "landscape";
}

export type GameMedia = ActivityIconMedia | SteamHeroMedia;

/**
 * Fallback placeholder used when no provider returns a valid asset.
 */
export const FALLBACK_PLACEHOLDER = "/assets/game-fallback.svg";