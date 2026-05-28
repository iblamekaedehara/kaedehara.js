<script lang="ts">
  import type { DiscordActivity } from "../../lib/types";
  import { sharedClock } from "../../lib/live/stores/clock";

  let { activity, imageUrl }: { activity: DiscordActivity; imageUrl: string } = $props();

  let now = $state(Date.now());

  const activityVerb = $derived.by(() => {
    switch (activity.type) {
      case 0: return "Playing";
      case 1: return "Streaming";
      case 3: return "Watching";
      case 5: return "Competing";
      default: return "Active";
    }
  });

  const displayTime = $derived.by(() => {
    if (!activity.timestamps?.start) return null;
    const elapsed = now - activity.timestamps.start;
    if (elapsed < 0) return null;
    const hrs = Math.floor(elapsed / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)} elapsed`;
    return `${pad(mins)}:${pad(secs)} elapsed`;
  });

  $effect(() => {
    const unsub = sharedClock.subscribe((t) => (now = t));
    return unsub;
  });
</script>

<div class="inner-card flex items-start gap-3 p-3 sm:p-4">
  <div class="h-[70px] w-[70px] flex-shrink-0 overflow-hidden rounded-lg bg-card sm:h-20 sm:w-20">
    <img
      src={imageUrl}
      alt={activity.name}
      class="h-full w-full object-contain"
    />
  </div>

  <div class="min-w-0 flex-1">
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">{activityVerb}</p>
      {#if displayTime}
        <span class="shrink-0 font-mono text-[10px] text-text-muted">{displayTime}</span>
      {/if}
    </div>
    <p class="mt-1 truncate text-base font-semibold leading-tight text-text-primary sm:text-lg">{activity.name}</p>

    {#if activity.details}
      <p class="mt-0.5 truncate text-sm text-text-secondary">{activity.details}</p>
    {/if}
    {#if activity.state}
      <p class="truncate text-sm text-text-muted">{activity.state}</p>
    {/if}
  </div>
</div>