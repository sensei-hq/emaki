// The film's score, timed to the film as it actually runs in one locale (T = each scene's running start; a sound
// placed after a pause moves with it), and the offline render the video pipeline asks for.
import { collectScore, play, renderWav, type Score } from './score.js';
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

/** A player for the score that follows a picture: start(fromFilmTime) / stop(). Sound is always opt-in. */
export function scorePlayer(f: FilmMeta) {
  let ctx: AudioContext | null = null, score: Score | null = null, voice: { stop: () => void } | null = null;
  const end = timeline(f).duration;
  return {
    async start(from: number) {
      voice?.stop(); voice = null;
      score ??= await filmScore(f);
      if (!score) return false;
      ctx ??= new AudioContext();
      await ctx.resume();
      voice = play(ctx, ctx.destination, score, from, end, ctx.currentTime + 0.05, end);
      return true;
    },
    stop() { voice?.stop(); voice = null; },
    close() { voice?.stop(); ctx?.close(); },
  };
}

/** One scene's slice of its film's score, for an article figure: off until toggled on, then cue() restarts it in step
 *  with the scene (call it whenever the scene starts over) and stop() silences it (call it when the figure scrolls
 *  away). `available` resolves false when the film has no score, so the button can stay hidden. */
export function sceneSound(film: string, scene: string, locale = 'en') {
  let ctx: AudioContext | null = null, voice: { stop: () => void } | null = null, from = 0, to = 0, end = 0;
  const ready = loadFilm(film, locale).then(async (f) => {
    const score = f ? await filmScore(f) : null;
    const tl = f && timeline(f), s = tl?.scenes.find((x) => x.id === scene);
    if (s && tl) { from = s.start; to = s.start + s.dur; end = tl.duration; }
    return s ? score : null;
  });
  const api = {
    available: ready.then(Boolean),
    on: false,
    async toggle() {
      api.on = !api.on;
      if (!api.on) return api.stop();
      ctx ??= new AudioContext();
      await ctx.resume();
      await api.cue();
    },
    async cue() {
      api.stop();
      const score = await ready;
      if (!api.on || !score || !ctx) return;
      voice = play(ctx, ctx.destination, score, from, to, ctx.currentTime + 0.03, end);
    },
    stop() { voice?.stop(); voice = null; },
    destroy() { api.on = false; api.stop(); ctx?.close(); ctx = null; },
  };
  return api;
}

export { renderWav };
