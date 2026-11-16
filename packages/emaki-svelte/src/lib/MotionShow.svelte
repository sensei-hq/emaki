<script lang="ts">
  // The story player: a film's scenes as slides, fitted to its box. Keys: ←/→ scene, Space play/pause, M sound,
  // O orientation, R replay the scene, Home from the top, F fullscreen. With `poster` it opens on the film's cover
  // with a play button, and the first click plays it from the top with sound on. Give it a size (it fills its
  // parent). bind:show to drive it from your own chrome.
  import { onMount, untrack } from 'svelte';
  import { createShow, showKey, type Layout, type Mode } from '@senseihq/emaki';
  import { reactiveShow, type ShowHandle } from './player.svelte.js';

  let {
    film, locale = 'en', layout = 'landscape', mode = 'auto', controls = true, slide = 1, loop = false,
    poster = false, title = '', length = '', fullscreenHref = '', show = $bindable(),
  }: {
    film: string; locale?: string; layout?: Layout; mode?: Mode; controls?: boolean; slide?: number; loop?: boolean;
    /** Open on the cover with a play button. */ poster?: boolean;
    /** The film's name and running time, for the poster's label and chip. */ title?: string; length?: string;
    /** Where the full-screen link goes (e.g. /show/<film>); no link when empty. */ fullscreenHref?: string;
    show?: ShowHandle;
  } = $props();

  let box: HTMLDivElement, stage: HTMLDivElement;
  let w = $state(0), h = $state(0);
  const s = reactiveShow();

  // Each (re)start gets a ticket, so a slow createShow that a newer one overtook is thrown away. The poster shows
  // only until the reader first plays: a language or mode change after that restarts without it.
  let ticket = 0, begun = false;
  $effect(() => { if (s.started && s.api) begun = true; });
  async function start() {
    const mine = ++ticket;
    s.detach();
    const made = await createShow(stage, film, { locale, layout, mode, slide, loop, poster: poster && !begun });
    if (mine !== ticket) return made.destroy();
    s.attach(made);
    show = s;
    made.fit(w, h);
  }
  onMount(() => () => { ticket++; s.detach(); });
  // Starts on mount and restarts when the film, language or mode changes (and on nothing else: untrack).
  $effect(() => { film; locale; mode; untrack(start); });
  $effect(() => { if (s.api && s.layout !== layout) s.api.setLayout(layout); });
  $effect(() => { s.layout; s.api?.fit(w, h); });

  function onkeydown(e: KeyboardEvent) {
    if (s.api && showKey(s.api, e, box)) e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="motion-show" bind:this={box} tabindex="0" role="application" aria-label="Story player" {onkeydown}>
  <div class="ms-fit" bind:clientWidth={w} bind:clientHeight={h}><div class="ms-stage" bind:this={stage}></div></div>
  {#if s.api && !s.started}
    <button class="ms-poster" onclick={() => s.api?.start()} aria-label="Play the film{title ? `: ${title}` : ''}">
      <span class="ms-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg></span>
      <span class="ms-chip">Play the film{length ? ` · ${length}` : ''}</span>
    </button>
  {:else if controls && s.api}
    <div class="ms-bar">
      <button onclick={() => s.api?.prev()} aria-label="Previous scene">‹</button>
      <button onclick={() => s.api?.toggle()} aria-label={s.playing ? 'Pause' : 'Play'}>{s.playing ? '❚❚' : '▶'}</button>
      <button onclick={() => s.api?.next()} aria-label="Next scene">›</button>
      <div class="ms-ticks">
        {#each s.ticks as tk, i (tk.id)}
          <button style="flex:{tk.dur}" onclick={() => s.api?.go(i)} aria-label={tk.name}><span style="width:{tk.fill * 100}%"></span></button>
        {/each}
      </div>
      <span class="ms-count">{s.index + 1} / {s.count}</span>
      <button onclick={() => s.api?.setSound(!s.sound)} aria-pressed={s.sound}>{s.sound ? 'Sound on' : 'Sound off'}</button>
      {#if fullscreenHref}<a class="ms-full" href={fullscreenHref} aria-label="Open full screen" title="Full screen">⤢</a>{/if}
    </div>
  {/if}
</div>

<style>
  .motion-show { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; outline: none; }
  .ms-fit { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; }
  .ms-stage { position: relative; }
  .ms-bar { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 8px; font: 13px system-ui; }
  .ms-bar button { min-width: 34px; height: 34px; border-radius: 17px; border: 1px solid currentColor; background: none; color: inherit; cursor: pointer; padding: 0 10px; }
  .ms-count { font-variant-numeric: tabular-nums; opacity: .7; }
  .ms-ticks { flex: 1; display: flex; gap: 3px; max-width: 360px; }
  .ms-bar .ms-ticks button { min-width: 0; height: 18px; padding: 7px 0; border: 0; border-radius: 0; background: linear-gradient(color-mix(in srgb, currentColor 18%, transparent), color-mix(in srgb, currentColor 18%, transparent)) center / 100% 4px no-repeat; }
  .ms-ticks span { display: block; height: 4px; border-radius: 2px; background: currentColor; }
  .ms-full { min-width: 34px; height: 34px; border-radius: 17px; border: 1px solid currentColor; display: grid; place-items: center; color: inherit; text-decoration: none; }
  .ms-poster { position: absolute; inset: 0; border: 0; padding: 0; background: none; cursor: pointer; color: inherit; }
  .ms-play { position: absolute; right: 18px; bottom: 14px; width: 64px; height: 64px; border-radius: 50%; background: color-mix(in srgb, currentColor 85%, transparent); display: grid; place-items: center; transition: transform .2s; }
  .ms-poster:hover .ms-play { transform: scale(1.06); }
  .ms-play svg { width: 28px; height: 28px; fill: Canvas; margin-left: 3px; }
  .ms-chip { position: absolute; left: 16px; bottom: 14px; padding: 6px 12px; border-radius: 999px; font: 11px/1 system-ui; letter-spacing: .1em; text-transform: uppercase; background: color-mix(in srgb, Canvas 88%, transparent); border: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
</style>
