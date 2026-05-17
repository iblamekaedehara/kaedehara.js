import * as v from "valibot";

// ── Lanyard WebSocket message validation ──────────────────────────────────

export const DiscordUserSchema = v.object({
  id: v.string(),
  username: v.string(),
  discriminator: v.string(),
  avatar: v.nullish(v.string()),
  global_name: v.nullish(v.string()),
  display_name: v.nullish(v.string()),
  public_flags: v.optional(v.number()),
});

export const ActivityTimestampsSchema = v.optional(
  v.object({
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  })
);

export const ActivityAssetsSchema = v.optional(
  v.object({
    large_image: v.optional(v.string()),
    large_text: v.optional(v.string()),
    small_image: v.optional(v.string()),
    small_text: v.optional(v.string()),
  })
);

export const DiscordActivitySchema = v.object({
  id: v.string(),
  name: v.string(),
  type: v.number(),
  state: v.optional(v.string()),
  details: v.optional(v.string()),
  timestamps: ActivityTimestampsSchema,
  application_id: v.optional(v.string()),
  assets: ActivityAssetsSchema,
  flags: v.optional(v.number()),
});

export const SpotifyDataSchema = v.nullish(
  v.object({
    track_id: v.string(),
    song: v.string(),
    artist: v.string(),
    album_art_url: v.string(),
    album: v.string(),
    timestamps: v.object({
      start: v.number(),
      end: v.number(),
    }),
  })
);

// Lanyard PRESENCE_UPDATE may send partial data (only changed fields),
// so top-level fields are optional — the transport merges into existing state.
export const LanyardPresenceSchema = v.object({
  discord_user: v.optional(DiscordUserSchema),
  discord_status: v.optional(
    v.union([
      v.literal("online"),
      v.literal("idle"),
      v.literal("dnd"),
      v.literal("offline"),
    ])
  ),
  activities: v.optional(v.array(DiscordActivitySchema)),
  spotify: SpotifyDataSchema,
  listening_to_spotify: v.optional(v.boolean()),
  active_on_discord_web: v.optional(v.boolean()),
  active_on_discord_mobile: v.optional(v.boolean()),
  active_on_discord_desktop: v.optional(v.boolean()),
  active_on_discord_embedded: v.optional(v.boolean()),
  active_on_discord_vr: v.optional(v.boolean()),
});

export type ValidatedLanyardPresence = v.InferOutput<typeof LanyardPresenceSchema>;

export function validatePresencePayload(data: unknown): ValidatedLanyardPresence | null {
  const result = v.safeParse(LanyardPresenceSchema, data);
  if (result.success) return result.output;
  console.warn("[lanyard] Invalid presence payload:", result.issues);
  return null;
}