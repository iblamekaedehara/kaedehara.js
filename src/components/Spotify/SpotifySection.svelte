<script lang="ts">
  import type { SpotifyData } from "../../lib/types";
  import SpotifyCard from "./SpotifyCard.svelte";

  let { spotify }: { spotify: SpotifyData | null } = $props();
</script>

{#if spotify}
  <section aria-label="Spotify" class="border border-border bg-card p-4 sm:p-5">
    <div class="mb-3 border-b border-border pb-2">
      <p class="text-xs font-medium uppercase tracking-wider text-text-muted">
        Listening on Spotify to
      </p>
    </div>
    <SpotifyCard spotify={spotify} />
  </section>
{/if}