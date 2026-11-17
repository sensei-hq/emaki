<script lang="ts">
  // An article figure: one scene, looping while it is on screen with a `hold` s rest on its last frame, or a still
  // under reduced motion. Pass `t` to drive it yourself. When the film has a score, a speaker button plays the
  // scene's slice of it in step with the loop (off until the reader turns it on). <MotionScene film="..." scene="..." />
  import { onMount, untrack } from 'svelte';
  import { attachScene, figurePlayer, sceneSound, type Layout, type Mode } from '@senseihq/emaki';

  let { film, scene, layout = 'figure', locale = 'en', mode = 'auto', autoplay = true, t = undefined, hold = 2, label = '', class: cls = '' }:
    { film: string; scene: string; layout?: Layout; locale?: string; mode?: Mode; autoplay?: boolean; t?: number; hold?: number; label?: string; class?: string } = $props();

  let host: HTMLDivElement;
  let width = $state(0);
  let hasSound = $state(false), soundOn = $state(false);
  const player = figurePlayer({ film: '', scene: '', layout: 'figure' });
  let view: ReturnType<typeof attachScene> | null = null;
  let sound: ReturnType<typeof sceneSound> | null = null;

  onMount(() => {
    player.load({ film, scene, layout });
    player.hold = hold;
    sound = sceneSound(film, scene, locale);
    view = attachScene(host, player, { locale, mode, autoplay: autoplay && t === undefined, sound });
    sound.available.then((ok) => (hasSound = ok && t === undefined && !player.still));
    return () => view?.destroy();
  });
  $effect(() => { const ref = { film, scene, layout }; untrack(() => { if (view && (ref.film !== player.ref?.film || ref.scene !== player.ref?.scene || ref.layout !== player.ref?.layout)) player.load(ref); }); });
  $effect(() => { view?.setLocale(locale); });
  $effect(() => { view?.setMode(mode); });
  $effect(() => { player.hold = hold; });
  $effect(() => { if (t !== undefined && view) untrack(() => { player.pause(); player.seek(t!); }); });
  $effect(() => { if (width) view?.fit(width); });

  async function toggleSound() {
    if (!sound) return;
    await sound.toggle();
    soundOn = sound.on;
  }
</script>

<div class="motion-scene {cls}" bind:clientWidth={width} role="img" aria-label={label || undefined}>
  <div bind:this={host}></div>
  {#if hasSound}
    <button class="ms-snd" onclick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'} title={soundOn ? 'Sound on' : 'Sound off'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {#if soundOn}<path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />{:else}<path class="w" d="M17 9l5 6M22 9l-5 6" />{/if}
      </svg>
    </button>
  {/if}
</div>

<style>
  .motion-scene { position: relative; width: 100%; }
  .ms-snd {
    position: absolute; right: 10px; bottom: 10px; width: 34px; height: 34px; padding: 6px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: color-mix(in srgb, Canvas 85%, transparent);
    color: inherit; cursor: pointer; opacity: 0.75; transition: opacity 0.15s;
  }
  .ms-snd:hover, .ms-snd:focus-visible, .ms-snd[aria-pressed='true'] { opacity: 1; }
  .ms-snd svg { width: 100%; height: 100%; fill: currentColor; }
  .ms-snd .w { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
</style>
