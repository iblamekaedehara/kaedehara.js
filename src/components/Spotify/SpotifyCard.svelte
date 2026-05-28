<script lang="ts">
  import type { SpotifyData } from "../../lib/types";
  import { sharedClock } from "../../lib/live/stores/clock";

  let { spotify }: { spotify: SpotifyData } = $props();

  let progressPercent = $state(0);
  let currentTime = $state("00:00");
  let endTime = $state("00:00");
  let unsubClock: (() => void) | null = null;

  function formatClock(ms: number): string {
    if (!ms || ms <= 0) return "00:00";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function tick(now: number) {
    const elapsed = now - spotify.timestamps.start;
    const total = spotify.timestamps.end - spotify.timestamps.start;
    if (elapsed >= total) {
      progressPercent = 100;
      currentTime = endTime;
      return;
    }
    progressPercent = Math.min((elapsed / total) * 100, 100);
    currentTime = formatClock(elapsed);
  }

  $effect(() => {
    spotify;
    endTime = formatClock(spotify.timestamps.end - spotify.timestamps.start);
    tick(Date.now());
    unsubClock?.();
    unsubClock = sharedClock.subscribe(tick);
    return () => unsubClock?.();
  });
</script>

<div class="fade-in inner-card p-3 sm:p-4">
  <div class="flex items-center gap-3 sm:gap-4">
    <div class="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg sm:h-24 sm:w-24">
      <img src={spotify.album_art_url} alt={spotify.album} width={96} height={96} class="h-full w-full object-cover" loading="lazy" decoding="async" fetchpriority="low" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-lg font-semibold leading-tight text-text-primary sm:text-xl">{spotify.song}</p>
      <p class="mt-1 truncate text-base font-medium text-text-secondary">{spotify.artist}</p>
      <div class="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <span class="font-mono text-sm font-semibold text-text-secondary">{currentTime}</span>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div class="h-full rounded-full bg-text-primary transition-none" style="width: {progressPercent}%" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100} aria-label="Spotify playback progress"></div>
        </div>
        <span class="font-mono text-sm font-semibold text-text-secondary">{endTime}</span>
      </div>
    </div>
  </div>
</div>
