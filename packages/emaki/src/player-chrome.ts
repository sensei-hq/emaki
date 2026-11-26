// The standard player chrome: one icon toolbar every emaki player shares — previous, play/pause,
// next, per-scene ticks with progress fill, a count, captions, mute, voice, full screen and an
// optional pop-out link — plus the caption overlay (the current scene's voice line). Framework-free
// DOM over the show controller; the <motion-show> element and the Svelte, React and Vue wrappers
// all mount it. Icons and ticks are overridable (Rokkit's pattern: caller values merged over
// DEFAULT_CHROME_ICONS / renderTick).
import { voiceLines } from './description.js';
import { buildChromeBar, paintState, paintTicks, placeCaption, syncTickButtons, type ChromeElements, type ChromeState } from './player-chrome-view.js';
import type { Show } from './show.js';
import type { VoiceLine } from './types.js';

export { CHROME_CSS } from './player-chrome-view.js';

export type ChromeIconName =
  | 'prev' | 'play' | 'pause' | 'next' | 'cc'
  | 'soundOn' | 'soundOff' | 'voice' | 'voiceOff' | 'fullscreenEnter' | 'fullscreenExit' | 'popout';

// Complete <svg> strings, one per control. The transport, CC and speaker come from Material Symbols
// (Apache 2.0, compatible with MIT); the sound pair is a waveform from andrsrxn/icons (MIT). Sound reads
// as effects, VO as a speaker, and each toggle swaps glyphs so its state shows in its icon.
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const wave = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="${d}"/></svg>`;
export const DEFAULT_CHROME_ICONS: Record<ChromeIconName, string> = {
  prev: svg('M6 6h2v12H6zm3.5 6 8.5 6V6z'),
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 19h4V5H6zm8-14v14h4V5z'),
  next: svg('M6 18l8.5-6L6 6zM16 6v12h2V6z'),
  cc: svg('M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1z'),
  soundOn: wave('M1.75 15.4V8.6m20.5 6.8V8.6m-8.2 6.53V8.87m-4.1 8.45V6.68m-4.1 12.93V4.4m12.3 15.21V4.4'),
  soundOff: wave('m2.63 2.63l18.74 18.74M1.75 15.4V8.6m20.5 6.8V8.6m-8.2 6.53v-1m0-3.61V8.87m-4.1 8.45V10m-4.1 9.61V6.05m12.3 8.58V4.39m0 15.22V18.4'),
  voice: svg('M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4-.91 7-4.49 7-8.77s-3-7.86-7-8.77'),
  voiceOff: svg('M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45q.05-.3.05-.63M19 12a7 7 0 0 1-.54 2.7l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z'),
  fullscreenEnter: svg('M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z'),
  fullscreenExit: svg('M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z'),
  popout: svg('M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2z'),
};

/** One scene tick: identity, timing, and where the playhead is. */
export interface ChromeTick {
  id: string; name: string; dur: number; fill: number; done: boolean; current: boolean;
}

export interface PlayerChromeOptions {
  /** The film's slug, for its voice lines. */
  film: string;
  locale?: string;
  /** The stage element: the caption overlay mounts into it. */
  stage: HTMLElement;
  /** The standalone player page: renders the pop-out link. Hidden when absent. */
  playerHref?: string;
  /** Show the VO toggle (default true); false leaves mute as the single master control. */
  voiceToggle?: boolean;
  /** Glyph overrides, merged over DEFAULT_CHROME_ICONS (complete <svg> strings). */
  icons?: Partial<Record<ChromeIconName, string>>;
  /** Custom tick HTML per scene (still seeks on click); void keeps the default progress tick. */
  renderTick?: (tick: ChromeTick, index: number) => string | void;
}

export interface PlayerChrome {
  el: HTMLElement;
  destroy: () => void;
}

/** Wires the transport, toggles and captions buttons to the show (repaints through `render`). */
function wireTransport(els: ChromeElements, show: Show, state: ChromeState, render: () => void): void {
  els.prev.onclick = () => show.prev();
  els.next.onclick = () => show.next();
  els.toggle.onclick = () => (show.state.started ? show.toggle() : show.start());
  els.mute.onclick = () => show.setSound(!show.state.sound);
  if (els.vo) els.vo.onclick = () => show.setVoice(!show.state.voiceOn);
  els.cc.onclick = () => {
    state.ccOn = !state.ccOn;
    els.cc.setAttribute('aria-pressed', String(state.ccOn));
    render();
  };
}

/** Wires the fullscreen toggle (glyph follows the host); returns the listener cleanup. */
function wireFullscreen(doc: Document, host: HTMLElement, fs: HTMLButtonElement, icons: Record<ChromeIconName, string>): () => void {
  const syncFs = () => {
    fs.innerHTML = doc.fullscreenElement === host ? icons.fullscreenExit : icons.fullscreenEnter;
  };
  fs.onclick = () => {
    if (doc.fullscreenElement) doc.exitFullscreen?.();
    else host.requestFullscreen?.();
  };
  const onFs = () => syncFs();
  doc.addEventListener('fullscreenchange', onFs);
  return () => doc.removeEventListener('fullscreenchange', onFs);
}

/** One key on the chrome (Space, arrows, M, V, C, F); anything else is left for the page. */
function handleChromeKey(e: KeyboardEvent, show: Show, vo: HTMLButtonElement | null, cc: HTMLButtonElement, fs: HTMLButtonElement): void {
  const k = e.key.toLowerCase();
  const acts: Record<string, () => void> = {
    ' ': () => (show.state.started ? show.toggle() : show.start()),
    arrowright: () => show.next(),
    arrowleft: () => show.prev(),
    m: () => show.setSound(!show.state.sound),
    v: () => vo?.click(),
    c: () => cc.click(),
    f: () => fs.click(),
  };
  if (!Object.hasOwn(acts, k)) return;
  e.preventDefault();
  e.stopPropagation();
  acts[k]();
}

/** The film's voice lines, once loaded: no lines drops the CC and VO toggles (nothing to caption). */
function applyVoiceLines(els: ChromeElements, state: ChromeState, lines: VoiceLine[] | null, render: () => void): void {
  if (state.dead) return;
  state.lines = lines;
  if (!lines?.length) { els.cc.remove(); els.vo?.remove(); }
  else els.cc.setAttribute('aria-pressed', String(state.ccOn));
  render();
}

/** Mounts the standard toolbar into `host` (caption overlay into `opts.stage`), driven by `show`. */
export function mountPlayerChrome(host: HTMLElement, show: Show, opts: PlayerChromeOptions): PlayerChrome {
  const doc = host.ownerDocument;
  const icons = { ...DEFAULT_CHROME_ICONS, ...opts.icons };
  const locale = opts.locale ?? 'en';
  const els = buildChromeBar(doc, icons, opts);
  // The caption anchors to the host (light DOM always paints; stage hosts carry shadow roots
  // that would swallow it) and is geometrically pinned over the stage below.
  const pos = host.style.position || getComputedStyle(host).position;
  if (!pos || pos === 'static') host.style.position = 'relative';
  host.append(els.style, els.bar, els.cap);

  const state: ChromeState = { lines: null, ccOn: false, dead: false, last: '', geoKey: '' };
  let raf = 0;
  const render = () => {
    if (state.dead) return;
    placeCaption(host, opts.stage, els.cap, state);
    syncTickButtons(doc, els.ticksEl, show);
    paintTicks(doc, els.ticksEl, show, opts.renderTick);
    paintState(els, show, icons, state);
  };
  // Tick fills follow the playhead every frame; state changes notify through the show.
  const loop = () => {
    if (state.dead) return;
    render();
    raf = requestAnimationFrame(loop);
  };

  wireTransport(els, show, state, render);
  const dropFs = wireFullscreen(doc, host, els.fs, icons);
  const onKey = (e: KeyboardEvent) => handleChromeKey(e, show, els.vo, els.cc, els.fs);
  host.addEventListener('keydown', onKey);

  const off = show.on(() => render());
  render();
  raf = requestAnimationFrame(loop);
  void voiceLines(opts.film, locale).then((l) => applyVoiceLines(els, state, l, render));

  return {
    el: els.bar,
    destroy() {
      state.dead = true;
      off();
      cancelAnimationFrame(raf);
      host.removeEventListener('keydown', onKey);
      dropFs();
      els.style.remove();
      els.bar.remove();
      els.cap.remove();
    },
  };
}
