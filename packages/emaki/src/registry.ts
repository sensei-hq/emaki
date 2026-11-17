// Where films come from. The core never assumes a bundler or a server: the app installs a FilmSource once at start-up
// (loaders/vite.ts bundles them; loaders/fetch.ts reads them from static files at runtime) and everything else asks
// the registry. Every film is a folder: film.json, look.css, scene-<id>.json (or .js), score.js, strings/, timing.
import type { SceneSpec } from './scene-schema.js';
import type { FilmJson, FilmMeta, TimingJson } from './types.js';

export interface FilmSource {
  /** Every film: its slug and film.json. */
  films(): Promise<{ slug: string; json: FilmJson }[]>;
  /** The film's look (look.css): tokens and shared classes, scoped to the scene's shadow root. */
  css(slug: string): Promise<string>;
  /** scene-<id>.json, or null when the scene is written as code (the escape hatch). */
  scene(slug: string, id: string): Promise<SceneSpec | null>;
  /** The escape hatch: shared.js plus scene-<id>.js sources. Optional. */
  code?(slug: string): Promise<{ shared: string; scenes: Record<string, string> } | null>;
  /** score.js source (the film's sound), or null. */
  score?(slug: string): Promise<string | null>;
  /** strings/<locale>.json: the scene text for one language, or null. */
  strings?(slug: string, locale: string): Promise<Record<string, string> | null>;
  /** timing.<locale>.json, else timing.json: running times fitted to that language's voice. */
  timing?(slug: string, locale: string): Promise<TimingJson | null>;
  /** The URL of a scene's narration for the web (voice/<locale>/<scene>.m4a), or null. Asked only for scenes whose
   *  timing gives a `voice` start. */
  voice?(slug: string, locale: string, scene: string): Promise<string | null>;
}

let source: FilmSource | null = null;
const cache = new Map<string, Promise<FilmMeta | undefined>>();

/** Installs the source every film is read from. Call once, before anything mounts. */
export function useSource(s: FilmSource) { source = s; cache.clear(); }
export function getSource(): FilmSource {
  if (!source) throw new Error('emaki: no film source; call useSource(...) at start-up (see kit/loaders)');
  return source;
}

/** Every film's slug and title (for galleries and the show index). */
export async function listFilms() {
  return (await getSource().films()).map(({ slug, json }) => ({ slug, title: json.title, scenes: json.scenes.length }));
}

/** A film with running times resolved for `locale` (timing.<locale>.json, then timing.json, then design times). */
export function loadFilm(slug: string, locale = 'en'): Promise<FilmMeta | undefined> {
  const key = `${slug}|${locale}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    const src = getSource(), found = (await src.films()).find((f) => f.slug === slug);
    if (!found) return undefined;
    const tm = (await src.timing?.(slug, locale))?.scenes ?? {};
    const scenes = found.json.scenes.map((s) => {
      const holds = [...(tm[s.id]?.holds ?? [])].sort((a, b) => a[0] - b[0]);
      const designed = s.dur + holds.reduce((n, h) => n + h[1], 0);
      const voice = tm[s.id]?.voice;
      return { ...s, design: s.dur, holds, dur: tm[s.id]?.dur ?? designed, ...(voice != null && { voice }) };
    });
    return { ...found.json, slug, scenes };
  })());
  return cache.get(key)!;
}

/** Total running time and where each scene starts. */
export function timeline(f: FilmMeta) {
  let at = 0;
  const scenes = f.scenes.map((s) => { const row = { ...s, start: at }; at += s.dur; return row; });
  return { duration: at, scenes };
}

/** Scene time for running time `t`: the clock stands still through each pause. */
export function warp(t: number, holds: [number, number][]) {
  let shift = 0;
  for (const [a, l] of holds) { if (t < a + shift) break; if (t < a + shift + l) return a; shift += l; }
  return t - shift;
}
/** Running time for scene time `t` (the inverse, for placing sounds after a pause). */
export function unwarp(t: number, holds: [number, number][]) {
  let out = t;
  for (const [a, l] of holds) if (t > a) out += l;
  return out;
}

/** Film time of the cover frame: film.json "cover", else the last scene's final picture (the punchline card). */
export function coverTime(f: FilmMeta) {
  const tl = timeline(f);
  const s = tl.scenes.find((x) => x.id === f.cover?.scene) ?? tl.scenes[tl.scenes.length - 1];
  const at = f.cover?.at ?? s.dur - 0.3;
  return s.start + Math.max(0, Math.min(at, s.dur - 0.05));
}
