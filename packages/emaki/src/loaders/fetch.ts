// Film + content source that reads static files at runtime: works with any framework, any host, no bundler
// feature. Publish the /content folder as-is (plus content/films/index.json, written by `motion.py manifest`).
//   useSource(fetchFilmSource('/content')); const content = fetchContentSource('/content');
import type { ContentSource, FilmJson, FilmSource, SceneSpec, StoryBody, StoryEntry, TimingJson } from '../index.js';

async function get<T>(url: string, as: 'json' | 'text' = 'json'): Promise<T | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  return (as === 'json' ? r.json() : r.text()) as Promise<T>;
}

export function fetchFilmSource(base = '/content'): FilmSource {
  let list: Promise<{ slug: string; json: FilmJson }[]> | null = null;
  const F = (slug: string, file: string) => `${base}/films/${slug}/${file}`;
  return {
    films: () => (list ??= (async () => {
      const slugs = (await get<string[]>(`${base}/films/index.json`)) ?? [];
      return (await Promise.all(slugs.map(async (slug) => ({ slug, json: (await get<FilmJson>(F(slug, 'film.json')))! })))).filter((f) => f.json);
    })()),
    css: async (slug) => (await get<string>(F(slug, 'look.css'), 'text')) ?? '',
    scene: (slug, id) => get<SceneSpec>(F(slug, `scene-${id}.json`)),
    code: async (slug) => {
      const shared = await get<string>(F(slug, 'shared.js'), 'text');
      if (shared == null) return null;
      const film = await get<FilmJson>(F(slug, 'film.json'));
      const scenes: Record<string, string> = {};
      for (const s of film?.scenes ?? []) { const c = await get<string>(F(slug, `scene-${s.id}.js`), 'text'); if (c != null) scenes[s.id] = c; }
      return { shared, scenes };
    },
    score: (slug) => get<string>(F(slug, 'score.js'), 'text'),
    strings: (slug, locale) => get<Record<string, string>>(F(slug, `strings/${locale}.json`)),
    timing: async (slug, locale) => (await get<TimingJson>(F(slug, `timing.${locale}.json`))) ?? get<TimingJson>(F(slug, 'timing.json')),
    // Asked only for scenes whose timing gives a voice start, which `emaki voice-web` writes with the file.
    voice: async (slug, locale, scene) => F(slug, `voice/${locale}/${scene}.m4a`),
  };
}

export function fetchContentSource(base = '/content'): ContentSource {
  let idx: Promise<StoryEntry[]> | null = null;
  return {
    index: () => (idx ??= get<StoryEntry[]>(`${base}/stories/index.json`).then((x) => x ?? [])),
    body: (locale, slug) => get<StoryBody>(`${base}/stories/${locale}/${slug}.json`),
    sceneIds: async (film) => (await get<FilmJson>(`${base}/films/${film}/film.json`))?.scenes.map((s) => s.id) ?? null,
  };
}
