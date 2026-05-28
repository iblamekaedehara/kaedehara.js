<script lang="ts">
  import type { SpotifyData } from "../../lib/types";
  import SpotifyCard from "./SpotifyCard.svelte";

  let { spotify }: { spotify: SpotifyData | null } = $props();
</script>

{#if spotify}
  <section aria-label="Spotify" class="card-shell p-4 sm:p-5">
    <div class="mb-3 flex items-center justify-between gap-4 border-b border-border-soft pb-3">
      <p class="text-xs font-semibold uppercase tracking-wider text-text-muted">
        listening on spotify to
      </p>
      </p>
    </div>
    <SpotifyCard spotify={spotify} />
  </section>
{/if}
