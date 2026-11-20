// The story player: a film's scenes as slides in landscape or portrait, fitted to a box, with sound on request.
// The same controller backs the capture contract the video pipeline drives (window.__show), so whatever framework
// renders the /show/<slug> route, tools/motion.py can record it frame by frame.
import { fontsReady, mountScene } from './mount.js';
import { coverTime, loadFilm, timeline } from './registry.js';
import { filmScore, narration, scorePlayer } from './sound.js';
import { renderWav } from './score.js';
import { SIZES, type FilmMeta, type Layout, type Mode, type Mounted } from './types.js';

export interface ShowOptions {
  layout?: Layout; locale?: string; capture?: boolean; slide?: number; loop?: boolean;
  /** Light, dark or 'auto' (the default; capture defaults to light so renders do not depend on the machine). */
  mode?: Mode;
  /** Force where scenes come from: their JSON file or the film's code modules (parity checks; ?src= on /show). */
  src?: 'json' | 'js';
  /** Open on the film's cover, paused, until start() (which plays from the top with sound on). */
  poster?: boolean;
}
export type ShowListener = (s: { index: number; local: number; playing: boolean; sound: boolean; voiceOn: boolean; layout: Layout; started: boolean }) => void;

/** A running show: what it plays, where the playhead is, and the stage, clock and sound it drives. */
interface ShowRun {
  host: HTMLElement; f: FilmMeta; tl: ReturnType<typeof timeline>; opts: ShowOptions; locale: string; mode: Mode;
  layout: Layout; index: number; local: number; playing: boolean; sound: boolean; voiceOn: boolean; scale: number; started: boolean;
  sounded: boolean;
  dead: boolean; m: Mounted | null; key: string; chain: Promise<void>; raf: number; last: number;
  audio: ReturnType<typeof scorePlayer>; words: ReturnType<typeof narration>; listeners: Set<ShowListener>;
}

const snapshot = (r: ShowRun) => ({ index: r.index, local: r.local, playing: r.playing, sound: r.sound, voiceOn: r.voiceOn, layout: r.layout, started: r.started });
const emit = (r: ShowRun) => r.listeners.forEach((l) => l(snapshot(r)));
/** The mount key of the scene and layout on screen. */
const keyOf = (r: ShowRun) => `${r.index}:${r.layout}`;

/** The scene film time `t` falls in (the first at or before it). */
function sceneAt(tl: ShowRun['tl'], t: number) {
  let i = tl.scenes.length - 1;
  while (i > 0 && t < tl.scenes[i].start) i--;
  return i;
}
/** Puts the playhead at film time `t`. */
function place(r: ShowRun, t: number) {
  r.index = sceneAt(r.tl, t);
  r.local = t - r.tl.scenes[r.index].start;
}

/** Mounts the scene on screen under `k`; false when the show died meanwhile (the new mount is dropped). */
async function remount(r: ShowRun, k: string) {
  r.m?.destroy();
  const next = await mountScene(r.host, r.f, r.tl.scenes[r.index].id, r.layout, { locale: r.locale, mode: r.mode, src: r.opts.src });
  if (r.dead) { next.destroy(); return false; }
  r.m = next; r.key = k;
  return true;
}
/** Draws the playhead, remounting first when the scene or layout changed. Queued: draws never overlap. */
function draw(r: ShowRun) {
  r.chain = r.chain.then(async () => {
    if (r.dead) return;
    const k = keyOf(r);
    if (k !== r.key && !(await remount(r, k))) return;
    r.m!.stage.style.transform = `scale(${r.scale})`;
    r.m!.render(Math.max(0, Math.min(r.local, r.m!.dur - 1e-3)));
  });
  return r.chain;
}

// Sound follows the picture: the score from the playhead, and the scene's narration over it (the score ducked).
// Narration is audible only with sound and voice both on; the score ducks only while it actually speaks.
async function syncAudio(r: ShowRun) {
  // Silence only what was started: a show that never sounded has nothing to stop (a late voice cut
  // on a silent show still stops the take and score it once started, so toggling voice while off
  // can only ever hush, never start, anything).
  if (!(r.sound && r.playing)) { if (r.sounded) { r.audio.stop(); r.words.stop(); } return; }
  r.sounded = true;
  const s = r.tl.scenes[r.index];
  r.audio.duck(r.voiceOn && r.words.has(s.id));
  await Promise.all([r.audio.start(s.start + r.local), r.voiceOn ? r.words.start(s.id, r.local) : (r.words.stop(), false)]);
}
/** Changes what the show does and tells the picture, the sound and the listeners. */
function update(r: ShowRun, change: Partial<Pick<ShowRun, 'index' | 'local' | 'playing' | 'sound' | 'voiceOn' | 'layout' | 'started'>>, redraw = true) {
  Object.assign(r, change);
  if (redraw) draw(r);
  syncAudio(r);
  emit(r);
}
function go(r: ShowRun, i: number) { update(r, { index: (i + r.tl.scenes.length) % r.tl.scenes.length, local: 0 }); }

/** Moves the playhead `dt` on: into the next scene at the end of this one, then round again (loop) or to a stop. */
function advance(r: ShowRun, dt: number) {
  r.local += dt;
  const dur = r.tl.scenes[r.index].dur;
  if (r.local < dur) r.m!.render(r.local);
  else if (r.index < r.tl.scenes.length - 1) go(r, r.index + 1);
  else if (r.opts.loop) go(r, 0);
  else update(r, { local: dur, playing: false }, false);
}
function tick(r: ShowRun, now: number) {
  const dt = Math.min(0.1, (now - r.last) / 1000); r.last = now;
  if (r.playing && r.m && r.key === keyOf(r)) advance(r, dt);
  r.raf = requestAnimationFrame((t) => tick(r, t));
}

/** Fits the stage into a box of w x h px; the host takes the stage's scaled size. */
function fitStage(r: ShowRun, w: number, h: number) {
  const [W, H] = SIZES[r.layout];
  r.scale = Math.max(0, Math.min(w / W, h / H));
  r.host.style.width = `${W * r.scale}px`; r.host.style.height = `${H * r.scale}px`;
  if (r.m) r.m.stage.style.transform = `scale(${r.scale})`;
}

export async function createShow(host: HTMLElement, slug: string, opts: ShowOptions = {}) {
  const locale = opts.locale ?? 'en', mode: Mode = opts.mode ?? (opts.capture ? 'light' : 'auto');
  const f = await loadFilm(slug, locale);
  if (!f) throw new Error(`emaki: no film "${slug}"`);
  const tl = timeline(f);
  const r: ShowRun = {
    host, f, tl, opts, locale, mode,
    layout: opts.layout ?? 'landscape', index: Math.max(0, Math.min(tl.scenes.length - 1, (opts.slide ?? 1) - 1)),
    local: 0, playing: !opts.capture && !opts.poster, sound: false, voiceOn: true, scale: 1, started: !opts.poster, sounded: false,
    dead: false, m: null, key: '', chain: Promise.resolve(), raf: 0, last: 0,
    audio: scorePlayer(f), words: narration(f, locale), listeners: new Set<ShowListener>(),
  };
  // A poster opens on the cover frame (the closing card by default), paused, until start().
  if (opts.poster) place(r, coverTime(f));
  await fontsReady(f);
  await draw(r);
  if (!opts.capture) { r.last = performance.now(); r.raf = requestAnimationFrame((t) => tick(r, t)); }

  const api = {
    film: f as FilmMeta, timeline: tl,
    get state() { return snapshot(r); },
    /** From a poster: play from the first scene with sound on (the click that starts it is the reader's gesture). */
    async start() { Object.assign(r, { started: true, playing: true, sound: true, index: 0, local: 0 }); await draw(r); syncAudio(r); emit(r); },
    /** R: the current scene again from its start. */
    replay() { update(r, { local: 0, playing: true, started: true }); },
    /** Home: the film from the top. */
    restart() { r.started = true; go(r, 0); },
    /** Fit the stage into a box of w x h px; the host takes the stage's scaled size (centre it with CSS). */
    fit(w: number, h: number) { fitStage(r, w, h); },
    go: (i: number) => go(r, i), next: () => go(r, r.index + 1), prev: () => go(r, r.index - 1),
    play() { update(r, { playing: true }, false); }, pause() { update(r, { playing: false }, false); },
    toggle() { r.playing ? api.pause() : api.play(); },
    setSound(on: boolean) { update(r, { sound: on }, false); },
    /** Cut (or restore) the narration; the score keeps playing, unducked. */
    setVoice(on: boolean) { update(r, { voiceOn: on }, false); },
    setLayout(l: Layout) { r.layout = l; draw(r); emit(r); },
    /** Seek to film time t (s): picks the scene and draws it. Resolves when drawn. */
    async seek(t: number) { place(r, t); await draw(r); },
    on(l: ShowListener) { r.listeners.add(l); return () => r.listeners.delete(l); },
    destroy() { r.dead = true; cancelAnimationFrame(r.raf); r.audio.close(); r.words.stop(); r.m?.destroy(); r.listeners.clear(); },
  };
  return api;
}

/** The capture contract for tools/motion.py: window.__show = { meta, ready, seek(t), audio() }. Call on the /show route
 *  when ?capture=1 is set; render the stage at 1:1 with no chrome. */
export async function installCapture(host: HTMLElement, slug: string, layout: Layout, locale: string, opts: { mode?: Mode; src?: 'json' | 'js' } = {}) {
  const mode = opts.mode ?? 'light';
  const [W, H] = SIZES[layout];
  host.style.cssText = `position:relative;width:${W}px;height:${H}px;overflow:hidden`;
  const show = await createShow(host, slug, { layout, locale, capture: true, mode, src: opts.src });
  const f = show.film;
  const w = window as unknown as Record<string, unknown>;
  w.__show = {
    meta: { slug, title: f.title, layout, locale, duration: show.timeline.duration, cover: coverTime(f),
      scenes: show.timeline.scenes.map((s) => ({ id: s.id, name: s.name, start: s.start, dur: s.dur })) },
    ready: Promise.resolve(true),
    seek: (t: number) => show.seek(t),
    /** The score rendered offline, as base64 WAV (null if the film has no score.js). */
    audio: async () => {
      const score = await filmScore(f);
      if (!score) return null;
      const bytes = await renderWav(score, show.timeline.duration);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  return show;
}

export type Show = Awaited<ReturnType<typeof createShow>>;

/** F: leave fullscreen, or put `el` (default the whole page) into it. */
function toggleFullscreen(el?: Element) {
  if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen?.();
  else (el ?? document.documentElement).requestFullscreen?.();
}

/** What each key does (by its lower-cased KeyboardEvent.key). */
const KEYS: Record<string, (show: Show, fullscreen?: Element) => void> = {
  arrowright: (show) => show.next(),
  arrowleft: (show) => show.prev(),
  ' ': (show) => { show.state.started ? show.toggle() : show.start(); },
  m: (show) => show.setSound(!show.state.sound),
  v: (show) => show.setVoice(!show.state.voiceOn),
  o: (show) => show.setLayout(show.state.layout === 'landscape' ? 'portrait' : 'landscape'),
  r: (show) => show.replay(),
  home: (show) => show.restart(),
  f: (_show, fullscreen) => toggleFullscreen(fullscreen),
};

/** The story player's keys, for every wrapper: ←/→ scene, Space play/pause, M sound, V voice, O orientation,
 *  R replay the scene, Home from the top, F fullscreen (on `fullscreen`, default the whole page). True when the
 *  key was used, so the caller can preventDefault. */
export function showKey(show: Show, e: KeyboardEvent, fullscreen?: Element): boolean {
  const k = e.key.toLowerCase();
  if (!Object.hasOwn(KEYS, k)) return false;
  KEYS[k](show, fullscreen);
  return true;
}

/** Progress per scene: one tick each, weighted by its running time, filled up to the playhead (0 … 1). */
export function ticks(show: Show) {
  const { index, local } = show.state;
  return show.timeline.scenes.map((s, i) => ({ id: s.id, name: s.name, dur: s.dur, fill: i < index ? 1 : i > index ? 0 : Math.min(1, local / s.dur) }));
}
