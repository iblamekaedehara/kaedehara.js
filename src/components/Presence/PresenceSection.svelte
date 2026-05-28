<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getPresenceTransport } from "../../lib/live/transport/presence-transport";
  import type { PresenceState } from "../../lib/live/transport/presence-transport";
  import { MAX_ACTIVITY_CARDS, PROFILE, SOCIAL_LINKS } from "../../lib/constants";
  import type { DiscordActivity } from "../../lib/types";
  import { getDiscordAvatarUrl } from "../../lib/image-fallback";
  import PresenceCard from "./PresenceCard.svelte";
  import SpotifySection from "../Spotify/SpotifySection.svelte";

  type ResolvedActivity = {
    id: string;
    type: number;
    name: string;
    details?: string;
    state?: string;
    timestamps?: { start?: number; end?: number };
    imageUrl: string;
  };

  const transport = getPresenceTransport();

  // Monotonic counter — ensures stale async resolutions never overwrite newer ones
  let resolveGeneration = 0;

  let connectionState = $state<string>("idle");
  let avatarUrl: string = $state(PROFILE.avatarFallback);
  let statusColor = $state("var(--color-accent-gray)");
  let statusKind = $state<"online" | "idle" | "dnd" | "offline">("offline");
  let statusText = $state("---");
  let presenceState = $state<PresenceState | null>(null);
  let resolvedActivities = $state<ResolvedActivity[]>([]);

  let spotifyCard = $derived(presenceState?.spotify || null);

  // Only show live status when freshness source is authoritative (live or soft-stale)
  let isLive = $derived(
    presenceState?.freshness?.source === "live" ||
    presenceState?.freshness?.source === "soft-stale"
  );

  // Show activities: games first, then others (API route already filters Spotify/Custom)
  let priorityActivities = $derived.by(() => {
    return [...resolvedActivities]
      .sort((a, b) => {
        if ((a.type === 0) !== (b.type === 0)) return a.type === 0 ? -1 : 1;
        return 0;
      })
      .slice(0, MAX_ACTIVITY_CARDS);
  });

  let hasVisibleActivity = $derived(priorityActivities.length > 0);

  function applyStatus(status: string) {
    switch (status) {
      case "online":
        statusKind = "online";
        statusColor = "var(--color-accent-green)";
        statusText = "online";
        break;
      case "idle":
        statusKind = "idle";
        statusColor = "var(--color-accent-amber)";
        statusText = "idle";
        break;
      case "dnd":
        statusKind = "dnd";
        statusColor = "var(--color-accent-red)";
        statusText = "do not disturb";
        break;
      default:
        statusKind = "offline";
        statusColor = "var(--color-accent-gray)";
        statusText = "offline";
    }
  }

  async function resolveActivities(activities: DiscordActivity[]): Promise<ResolvedActivity[]> {
    if (!activities.length) return [];

    const myGeneration = ++resolveGeneration;

    try {
      const res = await fetch("/api/presence-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activities }),
        signal: AbortSignal.timeout(6000),
      });
      // If a newer resolution already completed, discard this result
      if (myGeneration < resolveGeneration) return [];
      if (!res.ok) return [];
      const data = await res.json() as { activities: ResolvedActivity[] };
      return data.activities ?? [];
    } catch {
      if (myGeneration < resolveGeneration) return [];
      return [];
    }
  }

  let unsubPresence: (() => void) | null = null;
  let unsubConnection: (() => void) | null = null;

  onMount(() => {
    unsubConnection = transport.onConnection((s) => (connectionState = s));
    unsubPresence = transport.onPresence(async (state) => {
      // Apply non-image state immediately so avatar/status update without delay
      const rawAvatar = state.user?.avatar
        ? getDiscordAvatarUrl(state.user.id, state.user.avatar, "webp", 160)
        : null;
      avatarUrl = rawAvatar ?? PROFILE.avatarFallback;
      applyStatus(state.status ?? "offline");
      presenceState = state;

      // Resolve images atomically server-side — generation guard prevents stale overwrites
      resolvedActivities = await resolveActivities(state.activities ?? []);
    });

    transport.connect();
  });

  onDestroy(() => {
    unsubPresence?.();
    unsubConnection?.();
  });
</script>

<div class="mx-auto flex w-full max-w-[580px] flex-col gap-3 lg:max-w-none">
  <section aria-label="Profile" class="overflow-hidden">
    <div class="relative h-[142px] overflow-visible rounded-t-lg bg-banner sm:h-[156px]">
      <img src="/assets/banner.svg" alt="" class="h-full w-full object-cover" loading="eager" />

      <div class="absolute -bottom-14 left-4 sm:left-5">
        <div class="relative h-28 w-28 sm:h-32 sm:w-32">
          {#if connectionState === "connecting" || connectionState === "idle"}
            <div class="skeleton-pulse h-full w-full rounded-full border-[5px] border-surface"></div>
          {:else}
            <img
              src={avatarUrl}
              alt="Avatar"
              width={128}
              height={128}
              class="h-full w-full rounded-full border-[5px] border-surface object-cover"
            />
          {/if}

          <div
            class="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-4 border-surface"
            style="background-color: {isLive ? statusColor : 'var(--color-accent-gray)'}"
            aria-label={isLive ? statusText : "offline"}
          >
            {#if isLive && statusKind === "idle"}
              <span class="relative block h-4 w-4 rounded-full bg-accent-amber">
                <span class="absolute -right-0.5 -top-0.5 block h-3.5 w-3.5 rounded-full bg-surface"></span>
              </span>
            {:else if isLive && statusKind === "dnd"}
              <span class="h-1 w-3.5 rounded-full bg-surface"></span>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <div class="px-4 pb-1 pt-16 sm:px-5">
      <h1 class="text-[1.72rem] font-semibold leading-tight text-text-primary sm:text-4xl">
        {PROFILE.displayName}
      </h1>
      <p class="mt-1 text-xl leading-snug text-text-secondary sm:text-2xl">{PROFILE.bio}</p>
    </div>
  </section>

  <!-- Social links bar -->
  <section class="card-shell p-4 sm:p-5" aria-label="Social links">
    <div class="mb-3">
      <p class="text-base text-text-secondary">Social links</p>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      {#each SOCIAL_LINKS as link (link.name)}
        <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={link.name} class="social-icon">
          <img src={link.icon} alt={link.name} width={30} height={30} class="h-7 w-7 rounded-[6px] object-cover" loading="lazy" />
        </a>
      {/each}
    </div>
  </section>

  <!-- Spotify section (standalone card with its own header) -->
  <SpotifySection spotify={spotifyCard} />

  <!-- Discord presence section (hidden entirely when only Spotify is active) -->
  {#if hasVisibleActivity}
    <section aria-label="what am i doing?" class="card-shell p-4 sm:p-5">
      <div class="mb-3 flex items-center justify-between border-b border-border-soft pb-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">what am i doing rn?</p>
      </div>
      <div class="flex flex-col gap-2">
        {#each priorityActivities as activity (activity.id)}
          <PresenceCard {activity} imageUrl={activity.imageUrl} />
        {/each}
      </div>
    </section>
  {:else if connectionState === "connecting" || connectionState === "idle"}
    <section class="card-shell p-4 sm:p-5" aria-label="Loading presence">
      <div class="mb-3 border-b border-border-soft pb-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">what am i doing rn?</p>
      </div>
      <div class="inner-card flex items-start gap-3 p-3 sm:p-4">
        <div class="skeleton-pulse h-[70px] w-[70px] flex-shrink-0 rounded-lg sm:h-20 sm:w-20"></div>
        <div class="flex flex-1 flex-col gap-2 pt-1">
          <div class="skeleton-pulse h-2.5 w-14 rounded-full"></div>
          <div class="skeleton-pulse h-4 w-36 rounded-full"></div>
          <div class="skeleton-pulse h-3.5 w-28 rounded-full"></div>
        </div>
      </div>
    </section>
  {:else if connectionState === "connected" && !spotifyCard}
    <section class="card-shell p-4 sm:p-5">
      <div class="mb-3 border-b border-border-soft pb-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">what am i doing rn?</p>
      </div>
      <div class="inner-card px-4 py-5 text-center text-sm text-text-secondary">
        <p>prolly idling or offline</p>
      </div>
    </section>
  {/if}
</div>