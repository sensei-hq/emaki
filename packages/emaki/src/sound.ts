// The film's sound in the browser: its score, timed to the film as it actually runs in one locale (T = each scene's
// running start; a sound placed after a pause moves with it), the offline render the video pipeline asks for, and the
// narration (each scene's voice take, served for the web) that plays over the ducked score.
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
      voice = play(ctx, bus!, score, from, end, ctx.currentTime + 0.05, end);
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

/** A film's narration in one locale: each scene's take (FilmSource.voice), played from the scene's `voice` start.
 *  start(scene, local) picks it up where the picture is (or waits for it); stop() silences it. Resolves false when the
 *  scene is not narrated, the source serves no take, or a later start/stop overtook it. */
export function narration(f: FilmMeta, locale: string) {
  const urls = new Map<string, Promise<string | null>>();
  let el: HTMLAudioElement | null = null, timer: ReturnType<typeof setTimeout> | undefined, turn = 0;
  const url = (id: string) => {
    if (!urls.has(id)) urls.set(id, getSource().voice?.(f.slug, locale, id) ?? Promise.resolve(null));
    return urls.get(id)!;
  };
  const api = {
    /** True when the scene has a narration start (whether the source serves a take is known only on start). */
    has: (scene: string) => f.scenes.some((s) => s.id === scene && s.voice != null) && !!getSource().voice,
    async start(scene: string, local: number) {
      api.stop();
      const mine = turn, s = f.scenes.find((x) => x.id === scene);
      if (s?.voice == null) return false;
      const u = await url(scene).catch(() => null);
      if (!u || mine !== turn) return false;
      const a = (el = new Audio(u));
      a.preload = 'auto';
      const go = (at: number) => { if (mine !== turn) return; a.currentTime = at; a.play().catch(() => {}); };
      const lead = s.voice - local;
      if (lead > 0) timer = setTimeout(() => go(0), lead * 1000);
      else go(-lead);
      return true;
    },
    stop() {
      turn++;
      clearTimeout(timer);
      if (el) { el.pause(); el.removeAttribute('src'); el.load(); el = null; }
    },
  };
  return api;
}

/** One scene's sound for an article figure: its slice of the film's score and its narration. Off until toggled on,
 *  then cue() restarts both in step with the scene (call it whenever the scene starts over) and stop() silences them
 *  (call it when the figure scrolls away). `available` resolves false when the scene has neither, so the button can
 *  stay hidden. */
export function sceneSound(film: string, scene: string, locale = 'en') {
  let ctx: AudioContext | null = null, bus: GainNode | null = null, voice: { stop: () => void } | null = null;
  let from = 0, to = 0, end = 0, words: ReturnType<typeof narration> | null = null;
  const ready = loadFilm(film, locale).then(async (f) => {
    const tl = f && timeline(f), s = tl?.scenes.find((x) => x.id === scene);
    if (!f || !s || !tl) return { score: null, spoken: false };
    from = s.start; to = s.start + s.dur; end = tl.duration;
    words = narration(f, locale);
    return { score: await filmScore(f), spoken: words.has(scene) };
  });
  const api = {
    available: ready.then((r) => !!r.score || r.spoken),
    on: false,
    async toggle() {
      api.on = !api.on;
      if (!api.on) return api.stop();
      const { score } = await ready;
      if (score) {
        ctx ??= new AudioContext();
        await ctx.resume();
      }
      await api.cue();
    },
    async cue() {
      api.stop();
      const { score, spoken } = await ready;
      if (!api.on) return;
      const speaking = spoken && words ? words.start(scene, 0) : Promise.resolve(false);
      if (score && ctx) {
        if (!bus) { bus = ctx.createGain(); bus.connect(ctx.destination); }
        bus.gain.value = spoken ? DUCK : 1;
        voice = play(ctx, bus, score, from, to, ctx.currentTime + 0.03, end);
      }
      await speaking;
    },
    stop() { voice?.stop(); voice = null; words?.stop(); },
    destroy() { api.on = false; api.stop(); ctx?.close(); ctx = null; },
  };
  return api;
}

export { renderWav };
