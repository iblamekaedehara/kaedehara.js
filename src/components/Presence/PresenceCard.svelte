<script lang="ts">
  import type { DiscordActivity } from "../../lib/types";
  import { getDiscordAssetUrl } from "../../lib/image-fallback";
  import { categorizeActivity, getFallbackIcon } from "../../lib/media/activity-icons";
  import { sharedClock } from "../../lib/live/stores/clock";

  let { activity }: { activity: DiscordActivity } = $props();

  let imageError = $state(false);
  let resolvedImageUrl = $state("");
  let now = $state(Date.now());
  let unsubClock: (() => void) | null = null;

  // Resolve the best image URL: Discord CDN > external URL > type-aware fallback
  $effect(() => {
    const asset = activity.assets?.large_image;
    const appId = activity.application_id;
    const category = categorizeActivity(appId, activity.name);
    imageError = false; // Reset on every activity change

    if (!asset) {
      resolvedImageUrl = getFallbackIcon(category);
      return;
    }

    if (asset.startsWith("mp:")) {
      // Format 1: mp:/http... (encoded absolute URL)
      const httpIdx = asset.indexOf("/http");
      if (httpIdx > 0) {
        const encoded = asset.substring(httpIdx + 1);
        try { resolvedImageUrl = decodeURIComponent(encoded); }
        catch { resolvedImageUrl = encoded; }
        return;
      }
      // Format 2: mp:external/{hash} — Discord media proxy
      const proxyPath = asset.slice("mp:".length);
      if (proxyPath) {
        resolvedImageUrl = `https://media.discordapp.net/${proxyPath}`;
        return;
      }
      resolvedImageUrl = getFallbackIcon(category);
      return;
    }

    if (appId && !asset.startsWith("http")) {
      resolvedImageUrl = getDiscordAssetUrl(appId, asset, "webp", 128);
      return;
    }

    if (asset.startsWith("http")) {
      resolvedImageUrl = asset;
      return;
    }

    resolvedImageUrl = getFallbackIcon(category);
  });

  // Subscribe to shared clock so elapsed time updates every second
  $effect(() => {
    unsubClock = sharedClock.subscribe((t) => (now = t));
    return () => unsubClock?.();
  });

  let displayTime = $derived.by(() => {
    if (activity.timestamps?.start) {
      const elapsed = now - activity.timestamps.start;
      if (elapsed < 0) return null;
      const hrs = Math.floor(elapsed / 3600000);
      const mins = Math.floor((elapsed % 3600000) / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      if (hrs > 0) {
        return `${hrs}:${pad(mins)}:${pad(secs)} elapsed`;
      }
      return `${mins}:${pad(secs)} elapsed`;
    }
    return null;
  });

  const category = $derived(categorizeActivity(activity.application_id, activity.name));
  const fallbackIcon = $derived(getFallbackIcon(category));
</script>

<div class="fade-in flex items-start gap-3 border border-border bg-card p-4">
  <div class="h-12 w-12 flex-shrink-0 overflow-hidden">
    {#if !imageError}
      <img src={resolvedImageUrl} alt={activity.name} class="h-full w-full object-cover" onerror={() => (imageError = true)} />
    {:else}
      <img src={fallbackIcon} alt={activity.name} class="h-full w-full object-cover" />
    {/if}
  </div>

  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-text-primary">{activity.name}</p>
    {#if activity.details}
      <p class="truncate text-xs text-text-secondary">{activity.details}</p>
    {/if}
    {#if activity.state}
      <p class="truncate text-xs text-text-muted">{activity.state}</p>
    {/if}
    {#if displayTime}
      <p class="mt-1 font-mono text-xs text-text-muted">{displayTime}</p>
    {/if}
  </div>
</div>