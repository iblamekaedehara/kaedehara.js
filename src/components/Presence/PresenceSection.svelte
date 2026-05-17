<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getPresenceTransport } from "../../lib/live/transport/presence-transport";
  import type { PresenceState } from "../../lib/live/transport/presence-transport";
  import { MAX_ACTIVITY_CARDS, ACTIVITY_TYPES, PROFILE, SOCIAL_LINKS } from "../../lib/constants";
  import type { DiscordActivity, SpotifyData } from "../../lib/types";
  import PresenceCard from "./PresenceCard.svelte";
  import SpotifySection from "../Spotify/SpotifySection.svelte";

  const transport = getPresenceTransport();

  let connectionState = $state<string>("idle");
  let avatarUrl: string = $state(PROFILE.avatarPath);
  let statusColor = $state("var(--color-accent-gray)");
  let statusText = $state("---");
  let freshnessSource = $state<string | null>(null);
  let presenceState = $state<PresenceState | null>(null);

  let spotifyCard = $derived(presenceState?.spotify || null);

  // Only show live status when freshness source is authoritative (live or soft-stale)
  let isLive = $derived(
    freshnessSource === "live" || freshnessSource === "soft-stale"
  );

  // Show activities: games first, then others — skip Spotify & Custom Status
  let priorityActivities = $derived.by(() => {
    if (!presenceState?.activities) return [];
    const sorted = [...presenceState.activities].sort((a, b) => {
      // Games (type 0) before everything else
      if ((a.type === 0) !== (b.type === 0)) return a.type === 0 ? -1 : 1;
      return 0;
    });
    return sorted.filter(
      (a) => a.type !== ACTIVITY_TYPES.SPOTIFY && a.type !== ACTIVITY_TYPES.CUSTOM && a.type !== ACTIVITY_TYPES.STREAMING
    ).slice(0, MAX_ACTIVITY_CARDS);
  });

  let hasVisibleActivity = $derived(priorityActivities.length > 0);

  $effect(() => {
    if (presenceState) {
      console.log("[presence] activities:", presenceState.activities);
      console.log("[presence] freshness:", presenceState.freshness?.source);
    }
  });

  function applyStatus(status: string) {
    switch (status) {
      case "online":
        statusColor = "var(--color-accent-green)";
        statusText = "online";
        break;
      case "idle":
        statusColor = "var(--color-accent-amber)";
        statusText = "idle";
        break;
      case "dnd":
        statusColor = "var(--color-accent-red)";
        statusText = "do not disturb";
        break;
      default:
        statusColor = "var(--color-accent-gray)";
        statusText = "offline";
    }
  }

  let unsubPresence: (() => void) | null = null;
  let unsubConnection: (() => void) | null = null;

  onMount(() => {
    unsubConnection = transport.onConnection((s) => (connectionState = s));
    unsubPresence = transport.onPresence((state) => {
      presenceState = state;
      freshnessSource = state.freshness?.source ?? null;
      applyStatus(state.status ?? "offline");
    });

    transport.connect();
  });

  onDestroy(() => {
    unsubPresence?.();
    unsubConnection?.();
  });
</script>

<div class="flex flex-col gap-3">
  <!-- Profile panel -->
  <div class="border border-border bg-card p-4 sm:p-5">
    <div class="flex items-center gap-5">
      <div class="flex flex-col items-center">
        {#if connectionState === "connecting" || connectionState === "idle"}
          <div class="skeleton-pulse h-24 w-24 sm:h-28 sm:w-28"></div>
        {:else}
          <img
            src={avatarUrl}
            alt="Avatar"
            width={112}
            height={112}
            class="h-24 w-24 object-cover sm:h-28 sm:w-28"
            onerror={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.onerror = null;
              img.src = "/assets/avatar-fallback.svg";
            }}
          />
        {/if}
      </div>

      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold text-text-primary sm:text-3xl">
          {PROFILE.displayName}
        </h1>
        <p class="mt-1 text-sm text-text-secondary">{PROFILE.bio}</p>
        <div class="mt-4 inline-flex items-center gap-2 border border-border bg-card px-3 py-1 text-sm text-text-secondary">
          {#if !isLive}
            <span class="text-text-muted">---</span>
          {:else}
            <span class="h-2.5 w-2.5 rounded-full" style="background-color: {statusColor}" aria-hidden="true"></span>
            <span>{statusText}</span>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Social links bar -->
  <div class="border border-border bg-card p-4 sm:p-5">
    <div class="mb-3 border-b border-border pb-2">
      <p class="text-xs font-medium uppercase tracking-wider text-text-muted">my social links</p>
    </div>
    <div class="flex items-center justify-center gap-5">
      {#each SOCIAL_LINKS as link (link.name)}
        <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={link.name} class="opacity-60 transition-opacity duration-200 hover:opacity-100">
          <img src={link.icon} alt={link.name} width={24} height={24} class="h-6 w-6" loading="lazy" />
        </a>
      {/each}
    </div>
  </div>

  <!-- Spotify section (standalone card with its own header) -->
  <SpotifySection spotify={spotifyCard} />

  <!-- Discord presence section (hidden entirely when only Spotify is active) -->
  {#if hasVisibleActivity}
    <section aria-label="what am i doing?" class="border border-border bg-card p-4 sm:p-5">
      <div class="mb-3 border-b border-border pb-2">
        <p class="text-xs font-medium uppercase tracking-wider text-text-muted">what am i doing rn?</p>
      </div>
      <div class="flex flex-col gap-3">
        {#each priorityActivities as activity (activity.id)}
          <PresenceCard {activity} />
        {/each}
      </div>
    </section>
  {:else if connectionState === "connected" && !spotifyCard}
    <section class="border border-border bg-card p-4 sm:p-5">
      <div class="mb-3 border-b border-border pb-2">
        <p class="text-xs font-medium uppercase tracking-wider text-text-muted">what am i doing rn?</p>
      </div>
      <div class="py-4 text-center text-sm text-text-secondary">
        <p>prolly idling or offline</p>
      </div>
    </section>
  {/if}
</div>