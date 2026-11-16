<script lang="ts">
  // The story player: a film's scenes as slides, fitted to its box. Keys: ←/→ scene, Space play/pause, M sound,
  // O orientation. Give it a size (it fills its parent). bind:show to drive it from your own chrome.
  import { onMount, untrack } from 'svelte';
  import { createShow, type Layout, type Mode } from '@senseihq/emaki';
  import { reactiveShow, type ShowHandle } from './player.svelte.js';

  let { film, locale = 'en', layout = 'landscape', mode = 'auto', controls = true, slide = 1, loop = false, show = $bindable() }:
    { film: string; locale?: string; layout?: Layout; mode?: Mode; controls?: boolean; slide?: number; loop?: boolean; show?: ShowHandle } = $props();

  let box: HTMLDivElement, stage: HTMLDivElement;
  let w = $state(0), h = $state(0);
  const s = reactiveShow();

  // Each (re)start gets a ticket, so a slow createShow that a newer one overtook is thrown away.
  let ticket = 0;
  async function start() {
    const mine = ++ticket;
    s.detach();
    const made = await createShow(stage, film, { locale, layout, mode, slide, loop });
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
    const a = s.api; if (!a) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowright') a.next(); else if (k === 'arrowleft') a.prev();
    else if (k === ' ') { a.toggle(); e.preventDefault(); }
    else if (k === 'm') a.setSound(!s.sound);
    else if (k === 'o') a.setLayout(s.layout === 'landscape' ? 'portrait' : 'landscape');
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="motion-show" bind:this={box} tabindex="0" role="application" aria-label="Story player" {onkeydown}>
  <div class="ms-fit" bind:clientWidth={w} bind:clientHeight={h}><div class="ms-stage" bind:this={stage}></div></div>
  {#if controls && s.api}
    <div class="ms-bar">
      <button onclick={() => s.api?.prev()} aria-label="Previous scene">‹</button>
      <button onclick={() => s.api?.toggle()} aria-label={s.playing ? 'Pause' : 'Play'}>{s.playing ? '❚❚' : '▶'}</button>
      <button onclick={() => s.api?.next()} aria-label="Next scene">›</button>
      <span class="ms-count">{s.index + 1} / {s.count}</span>
      <button onclick={() => s.api?.setSound(!s.sound)} aria-pressed={s.sound}>{s.sound ? 'Sound on' : 'Sound off'}</button>
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
</style>
