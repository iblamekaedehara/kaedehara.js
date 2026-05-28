export const DISCORD_USER_ID = "951275149171245126";

export const STEAM_USER_ID = "76561199405350051";

export const ANILIST_USERNAME = "iblamericouwv";

export const SOCIAL_LINKS = [
  {
    name: "Spotify",
    url: "https://open.spotify.com/user/313bvsyasco5ygahfwytic65exxu",
    icon: "/assets/spotify.png",
  },
  {
    name: "Discord",
    url: "https://discord.com/users/951275149171245126",
    icon: "/assets/discord.png",
  },
  {
    name: "Instagram",
    url: "https://www.instagram.com/iblamericouwv/",
    icon: "/assets/instagram.png",
  },
  {
    name: "GitHub",
    url: "https://github.com/iblamekaedehara",
    icon: "/assets/github.png",
  },
  {
    name: "Steam",
    url: "https://steamcommunity.com/id/ricouwv/",
    icon: "/assets/steam.png",
  },
  {
    name: "AniList",
    url: "https://anilist.co/user/iblamericouwv",
    icon: "/assets/anilist.png",
  },
] as const;

export const PROFILE = {
  displayName: "!! kaedehara",
  bio: "~there's no limit to the larp.",
  avatarFallback: "/assets/avatar-fallback.svg",
} as const;

export const LANYARD_WS_URL = "wss://api.lanyard.rest/socket";

// Maximum number of activity cards to display
export const MAX_ACTIVITY_CARDS = 2;

// Discord activity type constants (matching Lanyard spec)
export const ACTIVITY_TYPES = {
  GAME: 0,
  STREAMING: 1,
  SPOTIFY: 2,
  WATCHING: 3,
  CUSTOM: 4,
  COMPETING: 5,
} as const;
