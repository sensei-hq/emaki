<script lang="ts">
  // The capture page the video pipeline drives (`emaki render` opens /show/<film>?capture=1&o=landscape&lang=en):
  // the stage at 1:1, no chrome, window.__show = { meta, ready, seek, audio }. Turn SSR off for this route.
  import { onMount } from 'svelte';
  import { installCapture, type Layout, type Mode } from '@senseihq/emaki';
  import MotionShow from './MotionShow.svelte';

  // mode: capture renders light unless asked; the interactive player follows the page (auto).
  let { film, layout = 'landscape', locale = 'en', mode, src, capture = false }:
    { film: string; layout?: Layout; locale?: string; mode?: Mode; src?: 'json' | 'js'; capture?: boolean } = $props();
  let host: HTMLDivElement | undefined = $state();
  onMount(() => { if (capture && host) installCapture(host, film, layout, locale, { mode: mode ?? 'light', src }); });
</script>

{#if capture}
  <div bind:this={host}></div>
{:else}
  <div style="position:fixed;inset:0"><MotionShow {film} {layout} {locale} mode={mode ?? 'auto'} /></div>
{/if}
