<script lang="ts">
  import type { DiscordActivity } from "../../lib/types";
  import { getDiscordAssetUrl } from "../../lib/image-fallback";
  import { categorizeActivity, getFallbackIcon } from "../../lib/media/activity-icons";
  import { sharedClock } from "../../lib/live/stores/clock";

  let { activity }: { activity: DiscordActivity } = $props();

  const category = $derived(categorizeActivity(activity.application_id, activity.name, activity.type));
  const fallbackIcon = $derived(getFallbackIcon(category));

  let imageError = $state(false);
  let resolvedImageUrl = $state(getFallbackIcon(categorizeActivity(activity.application_id, activity.name, activity.type)));
  let now = $state(Date.now());

  // Bug 2: module-level cancelled flag, reset per $effect run, read by stable handleImageError
  let cancelled = false;

  // Resolve the best image URL: Discord CDN > external URL > type-aware fallback
  $effect(() => {
    cancelled = false;
    const asset = activity.assets?.large_image;
    const appId = activity.application_id;
    imageError = false;

    if (!asset) {
      resolvedImageUrl = fallbackIcon;
      return () => { cancelled = true; };
    }

    if (asset.startsWith("mp:")) {
      // Bug 3: correct mp:external decoding for Lanyard's actual payload format
      if (asset.startsWith("mp:external/")) {
        const withoutPrefix = asset.slice("mp:external/".length);
        const slashIdx = withoutPrefix.indexOf("/");
        if (slashIdx !== -1) {
          // Format A: embedded absolute URL (percent-encoded)
          // "mp:external/{hash}/https/cdn.example.com/image.png"
          const afterHash = withoutPrefix.slice(slashIdx + 1);
          const protocolSepIdx = afterHash.indexOf("/");
          if (protocolSepIdx !== -1) {
            resolvedImageUrl = decodeURIComponent(
              afterHash.slice(0, protocolSepIdx) + "://" + afterHash.slice(protocolSepIdx + 1),
            );
          } else {
            resolvedImageUrl = fallbackIcon;
          }
        } else {
          // Format B: bare media proxy hash — no embedded URL
          // "mp:external/{hash}" → use Discord media proxy
          resolvedImageUrl = `https://media.discordapp.net/external/${withoutPrefix}`;
        }
      } else {
        // Non-external mp: asset — use Discord media proxy
        const proxyPath = asset.slice("mp:".length);
        if (proxyPath) {
          resolvedImageUrl = `https://media.discordapp.net/${proxyPath}`;
        } else {
          resolvedImageUrl = fallbackIcon;
        }
      }
      return () => { cancelled = true; };
    }

    if (appId && !asset.startsWith("http")) {
      resolvedImageUrl = getDiscordAssetUrl(appId, asset, "webp", 128);
    } else if (asset.startsWith("http")) {
      resolvedImageUrl = asset;
    } else {
      resolvedImageUrl = fallbackIcon;
    }

    return () => { cancelled = true; };
  });

  // Bug 2: stable async function — never re-created, closed over module-level `cancelled`
  async function handleImageError() {
    if (activity.type !== 0) {
      imageError = true;
      return;
    }
    try {
      // Discord application_id is NOT a Steam app ID — do not pass it.
      // The API route resolves by game name via SteamGridDB.
      const res = await fetch(
        `/api/game-image?name=${encodeURIComponent(activity.name)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!cancelled && res.ok) {
        const { url } = await res.json() as { url: string | null };
        if (!cancelled && url) {
          resolvedImageUrl = url;
          return;
        }
      }
    } catch {
      // fetch failed or aborted — fall through to error state
    }
    if (!cancelled) imageError = true;
  }

  // Bug 1: local const instead of outer let — no leak
  $effect(() => {
    const unsub = sharedClock.subscribe((t) => (now = t));
    return () => unsub();
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
</script>

<div class="fade-in flex items-start gap-3 border border-border bg-card p-4">
  <div class="h-12 w-12 flex-shrink-0 overflow-hidden">
    {#if !imageError}
      <img src={resolvedImageUrl} alt={activity.name} class="h-full w-full object-cover" onerror={handleImageError} />
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