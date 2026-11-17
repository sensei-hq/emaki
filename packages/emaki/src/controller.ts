// The DOM side of a ScenePlayerState, shared by every framework wrapper: mounts the scene the state points at,
// remounts when its key changes, draws the playhead, runs the clock and fits the stage to the host's width.
// A wrapper only has to give it a host element, keep the state reactive, and call fit()/destroy().
import { fontsReady, mountScene } from './mount.js';
import { ScenePlayerState, type SceneRef } from './player.js';
import { loadFilm } from './registry.js';
import { SIZES, type Mode, type Mounted } from './types.js';

export interface AttachOptions {
  /** Language of the scene text (strings/<locale>.json along the fallback chain). */
  locale?: string;
  /** Play while at least 20% of the host is on screen, pause when it scrolls away (article figures). */
  autoplay?: boolean;
  /** Light, dark or 'auto' (the default: follow the page's data-mode, else prefers-color-scheme). */
  mode?: Mode;
  /** A still: never plays, shows the scene near its end. Defaults to the reader's prefers-reduced-motion. */
  still?: boolean;
  /** The scene's slice of the score (sceneSound): cued each time the scene starts over, stopped off screen. */
  sound?: { cue(at?: number): void; stop(): void; destroy(): void; setLocale?(locale: string): void };
}

export interface AttachedScene {
  /** Size the stage to `width` px (the host keeps the layout's aspect ratio). */
  fit(width: number): void;
  /** Change the language; remounts the scene. */
  setLocale(locale: string): void;
  /** Change light/dark/auto; remounts the scene. */
  setMode(mode: Mode): void;
  destroy(): void;
}

/** An attached scene's live state: the host and player it binds, what is mounted (under which key), the clock, and
 *  the language, mode and visibility it draws for. */
interface View {
  host: HTMLElement; player: ScenePlayerState; opts: AttachOptions; still: boolean;
  m: Mounted | null; mountedKey: string; width: number; alive: boolean; raf: number; last: number;
  locale: string; mode: Mode; busy: Promise<void>; seenKey: string; loops: number; visible: boolean;
}

/** Changes whenever the mount must be rebuilt: the player's scene, the language or the mode. */
const keyOf = (v: View) => `${v.player.key}|${v.locale}|${v.mode}`;
/** True when the mount on stage is the one the player points at now. */
const isCurrent = (v: View) => !!v.m && v.mountedKey === keyOf(v);

// A still (reduced motion, or asked for) never plays; it rests near the end, where the scene has been built.
const prefersStill = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function scale(v: View) {
  const [W, H] = SIZES[v.player.ref?.layout ?? 'landscape'];
  v.host.style.aspectRatio = `${W} / ${H}`;
  if (v.m && v.width) v.m.stage.style.transform = `scale(${v.width / v.m.W})`;
}

/** Loads the film and mounts the scene for the current language and mode; null (nothing to draw) when the film is
 *  missing (reported on the player) or the view died while the fonts loaded. */
async function mountRef(v: View, ref: SceneRef): Promise<Mounted | null> {
  const f = await loadFilm(ref.film, v.locale);
  if (!f) { v.player.fail(`no film "${ref.film}"`); return null; }
  await fontsReady(f);
  if (!v.alive) return null;
  return mountScene(v.host, f, ref.scene, ref.layout, { locale: v.locale, src: ref.src, mode: v.mode });
}

/** Puts a finished mount on stage under `key` and tells the player: ready, resting near the end if a still, and
 *  playing if it autoplays on screen. */
function adopt(v: View, next: Mounted, key: string) {
  v.m = next; v.mountedKey = key;
  v.player.markReady(next.dur);
  if (v.still) v.player.seek(Math.max(0, next.dur - 0.6));
  if (v.opts.autoplay && v.visible) v.player.play();
}

/** Replaces the mount with one for the current key. False when there is nothing to draw: the load failed (reported
 *  on the player), or the view died or moved on to another key meanwhile (the late mount is dropped). */
async function remount(v: View, ref: SceneRef): Promise<boolean> {
  v.m?.destroy(); v.m = null; v.mountedKey = '';
  const want = keyOf(v);
  try {
    const next = await mountRef(v, ref);
    if (next && v.alive && want === keyOf(v)) { adopt(v, next, want); return true; }
    next?.destroy();
  } catch (e) {
    v.player.fail(e instanceof Error ? e.message : String(e));
  }
  return false;
}

/** Brings the stage up to date (queued, never overlapping): remounts when the key changed, then fits and draws. */
function sync(v: View) {
  v.busy = v.busy.then(async () => {
    const ref: SceneRef | null = v.player.ref;
    if (!ref || !v.alive) return;
    if (v.mountedKey !== keyOf(v) && !(await remount(v, ref))) return;
    scale(v);
    v.m?.render(Math.min(v.player.t, Math.max(0, (v.m?.dur ?? 0) - 1e-3)));
  });
}
function resync(v: View) { v.seenKey = keyOf(v); sync(v); }

/** Follows the player: cues the sound when the scene loops, remounts on a new key, else draws the playhead. */
function onChange(v: View) {
  if (v.player.loops !== v.loops) { v.loops = v.player.loops; v.opts.sound?.cue(); }
  if (keyOf(v) !== v.seenKey) resync(v);
  else if (isCurrent(v)) v.m!.render(Math.min(v.player.t, v.m!.dur - 1e-3));
}

/** Autoplay: play while at least 20% of the host is on screen; pause and silence it when it scrolls away. */
function watchScreen(v: View) {
  if (!v.opts.autoplay || typeof IntersectionObserver === 'undefined') return null;
  const io = new IntersectionObserver(([e]) => {
    v.visible = e.isIntersecting;
    if (v.visible) v.player.play(); else { v.player.pause(); v.opts.sound?.stop(); }
  }, { threshold: 0.2 });
  io.observe(v.host);
  return io;
}

function tick(v: View, now: number) {
  const dt = Math.min(0.1, (now - v.last) / 1000);
  v.last = now;
  if (v.player.playing && isCurrent(v)) v.player.tick(dt);
  if (v.alive) v.raf = requestAnimationFrame((t) => tick(v, t));
}

export function attachScene(host: HTMLElement, player: ScenePlayerState, opts: AttachOptions = {}): AttachedScene {
  const v: View = {
    host, player, opts, still: opts.still ?? prefersStill(),
    m: null, mountedKey: '', width: host.clientWidth, alive: true, raf: 0, last: performance.now(),
    locale: opts.locale ?? 'en', mode: opts.mode ?? 'auto', busy: Promise.resolve(), seenKey: '', loops: player.loops, visible: !opts.autoplay,
  };
  player.still = v.still;
  host.style.position ||= 'relative';
  host.style.overflow = 'hidden';
  const off = player.subscribe(() => onChange(v));
  const io = watchScreen(v);
  v.raf = requestAnimationFrame((t) => tick(v, t));
  resync(v);

  return {
    fit(w) { v.width = w; scale(v); },
    setMode(md) { if (md !== v.mode) { v.mode = md; resync(v); } },
    setLocale(l) { if (l !== v.locale) { v.locale = l; opts.sound?.setLocale?.(l); resync(v); } },
    destroy() { v.alive = false; cancelAnimationFrame(v.raf); off(); io?.disconnect(); opts.sound?.destroy(); v.m?.destroy(); v.m = null; },
  };
}

/** A player pointed at one scene, for article figures: loops, starts when on screen. */
export function figurePlayer(ref: SceneRef) {
  const p = new ScenePlayerState();
  p.load(ref);
  return p;
}
