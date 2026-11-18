// The film's sound in the browser: its score, timed to the film as it actually runs in one locale (T = each scene's
// running start; a sound placed after a pause moves with it), the offline render the video pipeline asks for, and the
// narration (each scene's voice take, served for the web) that plays over the ducked score.
import { collectScore, play, renderWav, type Score } from './score.js';
import { narration } from './narration.js';
import { getSource, loadFilm, timeline, unwarp } from './registry.js';
import type { FilmMeta } from './types.js';

export async function filmScore(f: FilmMeta): Promise<Score | null> {
  const code = await getSource().score?.(f.slug);
  if (!code) return null;
  const tl = timeline(f), T: Record<string, number> = {};
  tl.scenes.forEach((s) => (T[s.id] = s.start));
  const score = collectScore(code, T);
  for (const e of score.events) {
    let k = tl.scenes.length - 1;
    while (k > 0 && e.t < tl.scenes[k].start) k--;
    const s = tl.scenes[k];
    if (s.holds.length) e.t = s.start + unwarp(e.t - s.start, s.holds);
  }
  score.events.sort((a, b) => a.t - b.t);
  return score;
}

/** How far the score drops while the narration speaks (the video build ducks it under the voice the same way). */
export const DUCK = 0.35;

/** A player for the score that follows a picture: start(fromFilmTime) / stop(), and duck(on) under the narration.
 *  Sound is always opt-in. */
export function scorePlayer(f: FilmMeta) {
  let ctx: AudioContext | null = null, bus: GainNode | null = null, score: Score | null = null, voice: { stop: () => void } | null = null;
  let ducked = false;
  const end = timeline(f).duration;
  return {
    async start(from: number) {
      voice?.stop(); voice = null;
      score ??= await filmScore(f);
      if (!score) return false;
      if (!ctx) {
        ctx = new AudioContext();
        bus = ctx.createGain();
        bus.gain.value = ducked ? DUCK : 1;
        bus.connect(ctx.destination);
      }
      await ctx.resume();
      voice = play(ctx, bus!, score, { from, to: end, at: ctx.currentTime + 0.05, end });
      return true;
    },
    duck(on: boolean) {
      ducked = on;
      if (ctx && bus) bus.gain.setTargetAtTime(on ? DUCK : 1, ctx.currentTime, 0.15);
    },
    stop() { voice?.stop(); voice = null; },
    close() { voice?.stop(); ctx?.close(); },
  };
}

/** Where a scene runs in its film in locale `l`: the film, the scene's window and the film's end; null if either is
 *  missing. */
async function placeScene(film: string, scene: string, l: string) {
  const f = await loadFilm(film, l);
  const tl = f && timeline(f), s = tl?.scenes.find((x) => x.id === scene);
  return f && s && tl ? { f, from: s.start, to: s.start + s.dur, end: tl.duration } : null;
}

/** What an article figure's sound holds: its audio graph, what is sounding, the scene's window in the film, the
 *  narration and the score for the current locale (`ready`). */
interface FigureSound {
  film: string; scene: string; locale: string;
  ctx: AudioContext | null; bus: GainNode | null; voice: { stop: () => void } | null;
  from: number; to: number; end: number; words: ReturnType<typeof narration> | null;
  ready: Promise<{ score: Score | null; spoken: boolean }>;
}

/** Loads the scene in locale `l`: its window, its narration (the previous one stopped) and the film's score. */
async function loadFigure(st: FigureSound, l: string) {
  const placed = await placeScene(st.film, st.scene, l);
  if (!placed) return { score: null, spoken: false };
  ({ from: st.from, to: st.to, end: st.end } = placed);
  st.words?.stop();
  st.words = narration(placed.f, l);
  return { score: await filmScore(placed.f), spoken: st.words.has(st.scene) };
}

/** Opens (and resumes, inside the reader's gesture) the AudioContext, if there is a score to play through it. */
async function openFigure(st: FigureSound) {
  const { score } = await st.ready;
  if (!score) return;
  st.ctx ??= new AudioContext();
  await st.ctx.resume();
}

/** Starts the narration and the score's slice `at` seconds into the scene; the score is ducked under a narration. */
async function soundFigure(st: FigureSound, r: Awaited<FigureSound['ready']>, at: number) {
  const speaking = r.spoken && st.words ? st.words.start(st.scene, at) : Promise.resolve(false);
  if (r.score && st.ctx) {
    const c = st.ctx;
    if (!st.bus) { st.bus = c.createGain(); st.bus.connect(c.destination); }
    st.bus.gain.value = r.spoken ? DUCK : 1;
    st.voice = play(c, st.bus, r.score, { from: st.from + at, to: st.to, at: c.currentTime + 0.03, end: st.end });
  }
  await speaking;
}

/** One scene's sound for an article figure: its slice of the film's score and its narration. Off until toggled on,
 *  then cue(at) restarts both at `at` seconds into the scene (call it whenever the scene starts over, with 0) and
 *  stop() silences them (call it when the figure scrolls away). `available` resolves false when the scene has
 *  neither, so the button can stay hidden; setLocale() follows the figure into another language. */
export function sceneSound(film: string, scene: string, locale = 'en') {
  const st: FigureSound = { film, scene, locale, ctx: null, bus: null, voice: null, from: 0, to: 0, end: 0, words: null, ready: Promise.resolve({ score: null, spoken: false }) };
  st.ready = loadFigure(st, locale);
  const api = {
    get available() { return st.ready.then((r) => !!r.score || r.spoken); },
    on: false,
    async toggle(at = 0) {
      api.on = !api.on;
      if (!api.on) return api.stop();
      await openFigure(st);
      await api.cue(at);
    },
    async cue(at = 0) {
      api.stop();
      const r = await st.ready;
      if (api.on) await soundFigure(st, r, at);
    },
    setLocale(l: string) { if (l !== st.locale) { st.locale = l; api.stop(); st.ready = loadFigure(st, l); } },
    stop() { st.voice?.stop(); st.voice = null; st.words?.stop(); },
    destroy() { api.on = false; api.stop(); st.ctx?.close(); st.ctx = null; },
  };
  return api;
}

export { narration, renderWav };
