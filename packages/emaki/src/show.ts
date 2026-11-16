// The story player: a film's scenes as slides in landscape or portrait, fitted to a box, with sound on request.
// The same controller backs the capture contract the video pipeline drives (window.__show), so whatever framework
// renders the /show/<slug> route, tools/motion.py can record it frame by frame.
import { fontsReady, mountScene } from './mount.js';
import { coverTime, loadFilm, timeline } from './registry.js';
import { filmScore, scorePlayer } from './sound.js';
import { renderWav } from './score.js';
import { SIZES, type FilmMeta, type Layout, type Mode, type Mounted } from './types.js';

export interface ShowOptions {
  layout?: Layout; locale?: string; capture?: boolean; slide?: number; loop?: boolean;
  /** Light, dark or 'auto' (the default; capture defaults to light so renders do not depend on the machine). */
  mode?: Mode;
}
export type ShowListener = (s: { index: number; local: number; playing: boolean; sound: boolean; layout: Layout }) => void;

export async function createShow(host: HTMLElement, slug: string, opts: ShowOptions = {}) {
  const locale = opts.locale ?? 'en';
  const f = await loadFilm(slug, locale);
  if (!f) throw new Error(`emaki: no film "${slug}"`);
  const tl = timeline(f);
  let layout: Layout = opts.layout ?? 'landscape';
  let index = Math.max(0, Math.min(tl.scenes.length - 1, (opts.slide ?? 1) - 1));
  let local = 0, playing = !opts.capture, sound = false, scale = 1;
  let dead = false, m: Mounted | null = null, key = '', chain: Promise<void> = Promise.resolve(), raf = 0, last = 0;
  const audio = scorePlayer(f), listeners = new Set<ShowListener>();
  const emit = () => listeners.forEach((l) => l({ index, local, playing, sound, layout }));

  function draw() {
    chain = chain.then(async () => {
      if (dead) return;
      const k = `${index}:${layout}`;
      if (k !== key) {
        m?.destroy();
        const next = await mountScene(host, f!, tl.scenes[index].id, layout, { locale });
        if (dead) return next.destroy();
        m = next; key = k;
      }
      m!.stage.style.transform = `scale(${scale})`;
      m!.render(Math.max(0, Math.min(local, m!.dur - 1e-3)));
    });
    return chain;
  }
  async function syncAudio() { if (sound && playing) await audio.start(tl.scenes[index].start + local); else audio.stop(); }
  function go(i: number) { index = (i + tl.scenes.length) % tl.scenes.length; local = 0; draw(); syncAudio(); emit(); }
  function tick(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing && m && key === `${index}:${layout}`) {
      local += dt;
      if (local >= tl.scenes[index].dur) {
        if (index < tl.scenes.length - 1) go(index + 1);
        else if (opts.loop) go(0);
        else { local = tl.scenes[index].dur; playing = false; syncAudio(); emit(); }
      } else m.render(local);
    }
    raf = requestAnimationFrame(tick);
  }
  await fontsReady(f);
  await draw();
  if (!opts.capture) { last = performance.now(); raf = requestAnimationFrame(tick); }

  const api = {
    film: f as FilmMeta, timeline: tl,
    get state() { return { index, local, playing, sound, layout }; },
    /** Fit the stage into a box of w x h px; the host takes the stage's scaled size (centre it with CSS). */
    fit(w: number, h: number) {
      const [W, H] = SIZES[layout];
      scale = Math.max(0, Math.min(w / W, h / H));
      host.style.width = `${W * scale}px`; host.style.height = `${H * scale}px`;
      if (m) m.stage.style.transform = `scale(${scale})`;
    },
    go, next: () => go(index + 1), prev: () => go(index - 1),
    play() { playing = true; syncAudio(); emit(); }, pause() { playing = false; syncAudio(); emit(); },
    toggle() { playing ? api.pause() : api.play(); },
    setSound(on: boolean) { sound = on; syncAudio(); emit(); },
    setLayout(l: Layout) { layout = l; draw(); emit(); },
    /** Seek to film time t (s): picks the scene and draws it. Resolves when drawn. */
    async seek(t: number) {
      let i = tl.scenes.length - 1;
      while (i > 0 && t < tl.scenes[i].start) i--;
      index = i; local = t - tl.scenes[i].start;
      await draw();
    },
    on(l: ShowListener) { listeners.add(l); return () => listeners.delete(l); },
    destroy() { dead = true; cancelAnimationFrame(raf); audio.close(); m?.destroy(); listeners.clear(); },
  };
  return api;
}

/** The capture contract for tools/motion.py: window.__show = { meta, ready, seek(t), audio() }. Call on the /show route
 *  when ?capture=1 is set; render the stage at 1:1 with no chrome. */
export async function installCapture(host: HTMLElement, slug: string, layout: Layout, locale: string) {
  const [W, H] = SIZES[layout];
  host.style.cssText = `position:relative;width:${W}px;height:${H}px;overflow:hidden`;
  const show = await createShow(host, slug, { layout, locale, capture: true });
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
