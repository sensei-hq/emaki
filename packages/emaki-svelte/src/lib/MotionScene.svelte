<script lang="ts">
  // An article figure: one scene, looping while it is on screen. <MotionScene film="..." scene="..." />
  import { onMount, untrack } from 'svelte';
  import { attachScene, figurePlayer, type Layout } from '@senseihq/emaki';

  let { film, scene, layout = 'figure', locale = 'en', autoplay = true, class: cls = '' }:
    { film: string; scene: string; layout?: Layout; locale?: string; autoplay?: boolean; class?: string } = $props();

  let host: HTMLDivElement;
  let width = $state(0);
  const player = figurePlayer({ film: '', scene: '', layout: 'figure' });
  let view: ReturnType<typeof attachScene> | null = null;

  onMount(() => {
    player.load({ film, scene, layout });
    view = attachScene(host, player, { locale, autoplay });
    return () => view?.destroy();
  });
  $effect(() => { const ref = { film, scene, layout }; untrack(() => { if (view && (ref.film !== player.ref?.film || ref.scene !== player.ref?.scene || ref.layout !== player.ref?.layout)) player.load(ref); }); });
  $effect(() => { view?.setLocale(locale); });
  $effect(() => { if (width) view?.fit(width); });
</script>

<div class="motion-scene {cls}" bind:clientWidth={width}><div bind:this={host}></div></div>

<style>.motion-scene { width: 100%; }</style>
