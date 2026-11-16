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

export function attachScene(host: HTMLElement, player: ScenePlayerState, opts: AttachOptions = {}): AttachedScene {
  let m: Mounted | null = null, mountedKey = '', width = host.clientWidth, alive = true, raf = 0, last = performance.now();
  let locale = opts.locale ?? 'en', mode: Mode = opts.mode ?? 'auto', busy: Promise<void> = Promise.resolve();
  host.style.position ||= 'relative';
  host.style.overflow = 'hidden';

  const size = () => SIZES[player.ref?.layout ?? 'landscape'];
  const keyOf = () => `${player.key}|${locale}|${mode}`;
  const scale = () => {
    const [W, H] = size();
    host.style.aspectRatio = `${W} / ${H}`;
    if (m && width) m.stage.style.transform = `scale(${width / m.W})`;
  };

  function sync() {
    busy = busy.then(async () => {
      const ref: SceneRef | null = player.ref;
      if (!ref || !alive) return;
      if (mountedKey !== keyOf()) {
        m?.destroy(); m = null; mountedKey = '';
        const want = keyOf();
        try {
          const f = await loadFilm(ref.film, locale);
          if (!f) return player.fail(`no film "${ref.film}"`);
          await fontsReady(f);
          if (!alive) return;
          const next = await mountScene(host, f, ref.scene, ref.layout, { locale, src: ref.src, mode });
          if (!alive || want !== keyOf()) { next.destroy(); return; }
          m = next; mountedKey = want;
          player.markReady(m.dur);
          if (opts.autoplay && visible) player.play();
        } catch (e) {
          return player.fail(e instanceof Error ? e.message : String(e));
        }
      }
      scale();
      m?.render(Math.min(player.t, Math.max(0, (m?.dur ?? 0) - 1e-3)));
    });
  }

  let seenKey = '';
  const off = player.subscribe(() => {
    if (keyOf() !== seenKey) { seenKey = keyOf(); sync(); }
    else if (m && mountedKey === keyOf()) m.render(Math.min(player.t, m.dur - 1e-3));
  });

  let visible = !opts.autoplay;
  const io = opts.autoplay && typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) player.play(); else player.pause(); }, { threshold: 0.2 })
    : null;
  io?.observe(host);

  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (player.playing && m && mountedKey === keyOf()) player.tick(dt);
    if (alive) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  seenKey = keyOf();
  sync();

  return {
    fit(w) { width = w; scale(); },
    setMode(md) { if (md !== mode) { mode = md; seenKey = keyOf(); sync(); } },
    setLocale(l) { if (l !== locale) { locale = l; seenKey = keyOf(); sync(); } },
    destroy() { alive = false; cancelAnimationFrame(raf); off(); io?.disconnect(); m?.destroy(); m = null; },
  };
}

/** A player pointed at one scene, for article figures: loops, starts when on screen. */
export function figurePlayer(ref: SceneRef) {
  const p = new ScenePlayerState();
  p.load(ref);
  return p;
}
