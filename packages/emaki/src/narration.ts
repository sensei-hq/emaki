// A film's narration in the browser: each scene's voice take, served for the web (FilmSource.voice), played in step
// with the picture from the scene's `voice` start.
import { getSource } from './registry.js';
import type { FilmMeta } from './types.js';

/** Plays the take at `u`, `lead` seconds before its voice starts (now, from the right point, when lead <= 0), while
 *  `live()` holds. Returns the element and the timer that waits for the voice. */
function playTake(u: string, lead: number, live: () => boolean) {
  const a = new Audio(u);
  a.preload = 'auto';
  const go = (at: number) => { if (live()) { a.currentTime = at; a.play().catch(() => {}); } };
  if (lead > 0) return { el: a, timer: setTimeout(() => go(0), lead * 1000) };
  go(-lead);
  return { el: a, timer: undefined };
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
  const voiceAt = (scene: string) => f.scenes.find((x) => x.id === scene)?.voice;
  const api = {
    /** True when the scene has a narration start (whether the source serves a take is known only on start). */
    has: (scene: string) => f.scenes.some((s) => s.id === scene && s.voice != null) && !!getSource().voice,
    async start(scene: string, local: number) {
      api.stop();
      const mine = turn, at = voiceAt(scene);
      const u = at == null ? null : await url(scene).catch(() => null);
      if (!u || mine !== turn) return false;
      ({ el, timer } = playTake(u, at! - local, () => mine === turn));
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
