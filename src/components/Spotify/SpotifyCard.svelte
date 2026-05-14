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

<div class="fade-in border border-border bg-card p-4">
  <div class="flex items-start gap-3">
    <div class="h-12 w-12 flex-shrink-0 overflow-hidden">
      <img src={spotify.album_art_url} alt={spotify.album} width={48} height={48} class="h-full w-full object-cover" loading="lazy" decoding="async" fetchpriority="low" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-text-primary">{spotify.song}</p>
      <p class="truncate text-xs text-text-secondary">{spotify.artist}</p>
      <p class="mt-0.5 font-mono text-xs text-text-muted">{currentTime} / {endTime}</p>
    </div>
    <div class="flex-shrink-0" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" style="fill: var(--color-spotify, #1DB954)" class="mt-1"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
    </div>
  </div>
  <div class="mt-3 h-1 w-full overflow-hidden bg-border">
    <div class="h-full transition-none" style="width: {progressPercent}%; background-color: var(--color-spotify, #1DB954)" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100} aria-label="Spotify playback progress"></div>
  </div>
</div>