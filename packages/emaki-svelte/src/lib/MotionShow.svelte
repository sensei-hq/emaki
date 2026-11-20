<script lang="ts">
  // The story player: a film's scenes as slides, fitted to its box, under the standard chrome (prev/play/next,
  // scene ticks, count, captions, mute, voice, fullscreen, pop-out). Keys: ←/→ scene, Space play/pause, M sound,
  // V voice, C captions, O orientation, R replay the scene, Home from the top, F fullscreen. `sound`/`cc`/`voice`
  // plus `onsoundchange`/`onccchange`/`onvoicechange` lift that state to the app: a defined prop drives the player
  // (the app wins over the toggles) while every toggle still emits; undefined keeps per-instance toggles. With `poster` it opens on the
  // film's cover with a play button, and the first click plays it from the top with sound on. With `cover` it
  // paints that image instead and creates nothing until the first click (a fast first paint, and a sensible page
  // without JS). Give it a size (it fills its parent). bind:show to drive it from your own chrome.
  import { onMount, untrack } from 'svelte';
  import {
    createShow, mountPlayerChrome, showKey, SIZES, voiceLines,
    type ChromeIconName, type ChromeTick, type Layout, type Mode, type PlayerChrome, type VoiceLine,
  } from '@senseihq/emaki';
  import { reactiveShow, type ShowHandle } from './player.svelte.js';

  let {
    film, locale = 'en', layout = 'landscape', mode = 'auto', controls = true, slide = 1, loop = false,
    poster = false, cover = '', title = '', length = '', fullscreenHref = '', playerHref = '',
    icons = undefined, renderTick = undefined, description = false, show = $bindable(),
    sound = undefined, cc = undefined, voice = undefined,
    onsoundchange = undefined, onccchange = undefined, onvoicechange = undefined,
  }: {
    film: string; locale?: string; layout?: Layout; mode?: Mode; controls?: boolean; slide?: number; loop?: boolean;
    /** Open on the cover with a play button. */ poster?: boolean;
    /** An image (URL) to show with the play button; the show is created on the first click. */ cover?: string;
    /** The film's name and running time, for the poster's label and chip. */ title?: string; length?: string;
    /** Where the pop-out link goes (e.g. /show/<film>); no link when empty. Kept as an alias of playerHref. */ fullscreenHref?: string;
    /** Where the pop-out link goes; fullscreenHref is used when this is empty. */ playerHref?: string;
    /** Glyph overrides for the chrome (complete <svg> strings), merged over the defaults. */ icons?: Partial<Record<ChromeIconName, string>>;
    /** Custom tick HTML per scene; void keeps the default progress tick. */ renderTick?: (tick: ChromeTick, index: number) => string | void;
    /** A Description button under the player that opens the film's voiceover script; hidden without one. */ description?: boolean;
    show?: ShowHandle;
    /** Controlled sound: a defined value drives mute (the app wins over the toggle). */ sound?: boolean;
    /** Controlled captions: a defined value shows or hides the caption overlay. */ cc?: boolean;
    /** Controlled voice cut: false silences the narration while the score plays on. */ voice?: boolean;
    onsoundchange?: (on: boolean) => void; onccchange?: (on: boolean) => void; onvoicechange?: (on: boolean) => void;
  } = $props();

  let box: HTMLDivElement, stage: HTMLDivElement;
  let w = $state(0), h = $state(0);
  const s = reactiveShow();

  // The fit box keeps the content aspect ratio for the show's layout (core SIZES): width-driven, except
  // portrait which is height-driven. Flex growth would break the ratio, so centering comes from margin auto;
  // the max cap degrades to contain in capped shells.
  const fitStyle = $derived.by(() => {
    const [W, H] = SIZES[s.layout];
    return s.layout === 'portrait'
      ? `aspect-ratio: ${W} / ${H}; height: 100%; max-width: 100%; margin: auto;`
      : `aspect-ratio: ${W} / ${H}; width: 100%; max-height: 100%; margin: auto;`;
  });

  // Each (re)start gets a ticket, so a slow createShow that a newer one overtook is thrown away. The poster shows
  // only until the reader first plays: a language or mode change after that restarts without it.
  let ticket = 0, begun = false;
  // With a cover nothing is created until the reader clicks it; that click then starts the show (sound on).
  let waiting = $state(untrack(() => !!cover)), autoplay = false;
  $effect(() => { if (s.started && s.api) begun = true; });
  async function start() {
    const mine = ++ticket, play = autoplay;
    autoplay = false;
    s.detach();
    const made = await createShow(stage, film, { locale, layout, mode, slide, loop, poster: (poster || play) && !begun });
    if (mine !== ticket) return made.destroy();
    s.attach(made);
    show = s;
    made.fit(w, h);
    if (play) await made.start();
    applyControlled();
  }
  function open() { autoplay = true; waiting = false; }
  // The description's lines, reloaded with the film or language; a load a newer one overtook is dropped.
  let lines = $state<VoiceLine[] | null>(null), expanded = $state(false), dticket = 0;
  async function loadLines() {
    const mine = ++dticket;
    if (!description) { lines = null; return; }
    const l = await voiceLines(film, locale);
    if (mine === dticket) lines = l;
  }
  // The standard chrome over the show, remounted with it and whenever its inputs change; gone without
  // controls, under a poster (it mounts with the start), or on unmount. Toggles (CC/mute) live in the
  // chrome, so it must NOT remount on show notifications (scene changes would wipe them): the gate below
  // flips once, while s.started re-reads on every notification.
  let chrome: PlayerChrome | null = null;
  let startedOnce = $state(false);
  // Controlled sound/cc/voice: a defined prop drives the player while every toggle still emits, so one app-level
  // state object can hold a film plus its figures. Sound and voice drive the show controller; captions live in
  // the chrome, so the prop flips its toggle for it. Undefined stays uncontrolled.
  let syncingCc = false;
  function syncCc() {
    if (cc === undefined) return;
    const btn = box.querySelector('.emk-cc') as HTMLButtonElement | null;
    if (btn && (btn.getAttribute('aria-pressed') === 'true') !== cc) {
      syncingCc = true;
      btn.click();
      syncingCc = false;
    }
  }
  function applyControlled() {
    const api = s.api;
    if (!api) return;
    if (sound !== undefined) api.setSound(sound);
    if (voice !== undefined) api.setVoice(voice);
    syncCc();
  }
  // The chrome's own toggles call straight into the show; under a defined prop the app wins instead, so capture
  // the click on its way down and stop it there (the chrome listens on the button itself). Every toggle still
  // emits its change event, controlled or not.
  function intercept(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    const btn = el?.closest?.('.emk-mute, .emk-voice, .emk-cc') as HTMLButtonElement | null;
    if (!btn || !box.contains(btn)) return;
    if (btn.classList.contains('emk-cc')) {
      if (syncingCc) return;
      const next = btn.getAttribute('aria-pressed') !== 'true';
      onccchange?.(next);
      if (cc !== undefined) e.stopPropagation();
    } else if (btn.classList.contains('emk-mute')) {
      const next = !(sound ?? s.api?.state.sound ?? false);
      onsoundchange?.(next);
      if (sound !== undefined) e.stopPropagation();
    } else {
      const next = !(voice ?? s.api?.state.voiceOn ?? true);
      onvoicechange?.(next);
      if (voice !== undefined) e.stopPropagation();
    }
  }
  $effect(() => {
    if (s.api && s.started) startedOnce = true;
  });
  $effect(() => {
    const api = s.api,
      ready = startedOnce,
      on = controls,
      href = playerHref || fullscreenHref,
      ic = icons,
      rt = renderTick;
    untrack(() => {
      chrome?.destroy();
      chrome = null;
      if (!on || !api || !ready) return;
      chrome = mountPlayerChrome(box, api, { film, locale, stage, playerHref: href || undefined, icons: ic, renderTick: rt });
      applyControlled();
    });
  });
  // M reaches straight into the show, so cut it off here under a defined sound (V and C arrive as toggle
  // clicks, which the click capture sees). A capture listener, registered before the chrome mounts: the
  // template's onkeydown delegates above the box, where the chrome's stopPropagation already swallowed M.
  function interceptKey(e: KeyboardEvent) {
    if (e.key.toLowerCase() !== 'm' || !s.api) return;
    const next = !(sound ?? s.api.state.sound);
    onsoundchange?.(next);
    if (sound === undefined) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  onMount(() => {
    box.addEventListener('click', intercept, true);
    box.addEventListener('keydown', interceptKey, true);
    return () => {
      ticket++; dticket++; chrome?.destroy(); chrome = null; s.detach();
      box.removeEventListener('click', intercept, true);
      box.removeEventListener('keydown', interceptKey, true);
    };
  });
  // Starts on mount and restarts when the film, language or mode changes (and on nothing else: untrack).
  $effect(() => { film; locale; mode; if (!waiting) untrack(start); });
  $effect(() => { film; locale; description; untrack(loadLines); });
  $effect(() => { if (s.api && s.layout !== layout) s.api.setLayout(layout); });
  $effect(() => { s.layout; s.api?.fit(w, h); });
  // A defined sound/cc/voice prop drives the player whenever the app flips it.
  $effect(() => { sound; cc; voice; untrack(applyControlled); });

  // The chrome takes Space/arrows/M/C/F (stopping them); the box keeps O/R/Home.
  function onkeydown(e: KeyboardEvent) {
    if (!s.api) return;
    const k = e.key.toLowerCase();
    if (k === 'o' || k === 'r' || k === 'home') {
      showKey(s.api, e, box);
      e.preventDefault();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="motion-show" bind:this={box} tabindex="0" role="application" aria-label="Story player" {onkeydown}>
  <div class="ms-fit" style={fitStyle} bind:clientWidth={w} bind:clientHeight={h}><div class="ms-stage" bind:this={stage}></div></div>
  {#snippet play()}
    <span class="ms-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg></span>
    <span class="ms-chip">Play the film{length ? ` · ${length}` : ''}</span>
  {/snippet}
  {#if waiting}
    <button class="ms-poster" onclick={open} aria-label="Play the film{title ? `: ${title}` : ''}">
      <img class="ms-cover" src={cover} alt="" />
      {@render play()}
    </button>
  {:else if s.api && !s.started}
    <button class="ms-poster" onclick={() => s.api?.start()} aria-label="Play the film{title ? `: ${title}` : ''}">
      {@render play()}
    </button>
  {/if}
  {#if description && lines}
    <div class="ms-desc">
      <button onclick={() => (expanded = !expanded)} aria-expanded={expanded}>Description {expanded ? '▾' : '▸'}</button>
      {#if expanded}<div>{#each lines as l (l.scene)}<p>{l.text}</p>{/each}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .motion-show { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; outline: none; }
  .ms-fit { position: relative; min-height: 0; display: grid; place-items: center; overflow: hidden; }
  .ms-stage { position: relative; }
  .ms-desc { padding: 6px 12px 12px; font: 14px/1.55 system-ui; }
  .ms-desc button { background: none; border: 0; padding: 6px 0; cursor: pointer; font: inherit; color: inherit; opacity: .75; text-decoration: underline; }
  .ms-desc p { margin: 0 0 .7em; }
  .ms-poster { position: absolute; inset: 0; border: 0; padding: 0; background: none; cursor: pointer; color: inherit; }
  .ms-cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .ms-play { position: absolute; right: 18px; bottom: 14px; width: 64px; height: 64px; border-radius: 50%; background: color-mix(in srgb, currentColor 85%, transparent); display: grid; place-items: center; transition: transform .2s; }
  .ms-poster:hover .ms-play { transform: scale(1.06); }
  .ms-play svg { width: 28px; height: 28px; fill: Canvas; margin-left: 3px; }
  .ms-chip { position: absolute; left: 16px; bottom: 14px; padding: 6px 12px; border-radius: 999px; font: 11px/1 system-ui; letter-spacing: .1em; text-transform: uppercase; background: color-mix(in srgb, Canvas 88%, transparent); border: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
</style>
