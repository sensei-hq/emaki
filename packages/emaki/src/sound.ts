// The film's score, timed to the film as it actually runs in one locale (T = each scene's running start; a sound
// placed after a pause moves with it), and the offline render the video pipeline asks for.
import { collectScore, play, renderWav, type Score } from './score.js';
import { getSource, timeline, unwarp } from './registry.js';
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
      ctx ??= new AudioContext();
      score ??= await filmScore(f);
      if (!score) return false;
      await ctx.resume();
      voice = play(ctx, ctx.destination, score, from, end, ctx.currentTime + 0.05, end);
      return true;
    },
    stop() { voice?.stop(); voice = null; },
    close() { voice?.stop(); ctx?.close(); },
  };
}

export { renderWav };
