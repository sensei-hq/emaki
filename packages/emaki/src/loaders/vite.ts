// Film + content source for Vite-based apps (React, SvelteKit, Vue/Nuxt, Solid, Astro). Vite only expands
// import.meta.glob in the app's own code with literal patterns, so the app writes the globs (one file, see
// `emaki init` or the README) and hands them to viteSource(); this module turns them into a FilmSource and a
// ContentSource. Paths are matched by their tail, so the content folder can live anywhere (`/content`, `/src/content`).
//
//   const g = {
//     films: import.meta.glob('/content/films/*/film.json', { eager: true, import: 'default' }),
//     scenes: import.meta.glob('/content/films/*/scene-*.json', { import: 'default' }),
//     strings: import.meta.glob('/content/films/*/strings/*.json', { import: 'default' }),
//     timings: import.meta.glob('/content/films/*/timing*.json', { eager: true, import: 'default' }),
//     raw: import.meta.glob(['/content/films/*/*.js', '/content/films/*/look.css'], { query: '?raw', import: 'default' }),
//     index: import.meta.glob('/content/stories/index.json', { eager: true, import: 'default' }),
//     bodies: import.meta.glob('/content/stories/*/*.json', { import: 'default' }),
//     logos: import.meta.glob('/content/logos/*.svg', { eager: true, query: '?raw', import: 'default' }),
//     site: import.meta.glob('/content/site.json', { eager: true, import: 'default' }),
//     voice: import.meta.glob('/content/films/*/voice/*/*.m4a', { eager: true, query: '?url', import: 'default' }),
//     voiceText: import.meta.glob('/content/films/*/voice/*.json', { eager: true, import: 'default' }),
//   };
//   export const { filmSource, contentSource, logos, site } = viteSource(g);
import type { ContentSource, FilmJson, FilmSource, SceneSpec, StoryBody, StoryEntry, TimingJson, VoiceLine } from '../index.js';
import type { SiteConfig } from '../i18n.js';

type Lazy<T> = Record<string, T | (() => Promise<unknown>)>;
export interface ViteGlobs {
  films: Record<string, FilmJson>;
  scenes: Lazy<SceneSpec>;
  strings?: Lazy<Record<string, string>>;
  timings?: Record<string, TimingJson>;
  raw?: Lazy<string>;
  index?: Record<string, StoryEntry[]>;
  bodies?: Lazy<StoryBody>;
  logos?: Record<string, string>;
  site?: Record<string, SiteConfig>;
  /** voice/<locale>/<scene>.m4a as URLs (`?url`): the narration `emaki voice-web` encodes for the web. */
  voice?: Record<string, string>;
  /** voice/<locale>.json, eager: the voiceover script, one line per scene (the player's description). */
  voiceText?: Record<string, VoiceLine[]>;
}

const call = async <T>(v: unknown): Promise<T | null> => (v == null ? null : ((typeof v === 'function' ? await v() : v) as T));
/** The entry whose path ends with `tail` (`films/<slug>/film.json`), whatever folder the app keeps content in. */
const at = <T>(map: Record<string, T> | undefined, tail: string): T | undefined => {
  if (!map) return undefined;
  for (const k of Object.keys(map)) if (k.endsWith('/' + tail)) return map[k];
  return undefined;
};
const filmSlug = (p: string) => p.match(/films\/([^/]+)\/film\.json$/)?.[1] ?? '';
export const logoName = (p: string) => p.split('/').pop()!.replace(/\.svg$/, '');

export function viteSource(g: ViteGlobs) {
  const F = (slug: string, file: string) => `films/${slug}/${file}`;
  const filmSource: FilmSource = {
    films: async () => Object.entries(g.films).map(([p, json]) => ({ slug: filmSlug(p), json })),
    css: async (slug) => (await call<string>(at(g.raw, F(slug, 'look.css')))) ?? '',
    scene: (slug, id) => call<SceneSpec>(at(g.scenes, F(slug, `scene-${id}.json`))),
    code: async (slug) => {
      const shared = await call<string>(at(g.raw, F(slug, 'shared.js')));
      if (shared == null) return null;
      const scenes: Record<string, string> = {};
      const re = new RegExp(`films/${slug}/scene-(.+)\\.js$`);
      // shared.js came from g.raw, so the globs are there.
      for (const p of Object.keys(g.raw!)) {
        const m = p.match(re);
        if (m) scenes[m[1]] = (await call<string>(g.raw![p]))!;
      }
      return { shared, scenes };
    },
    score: (slug) => call<string>(at(g.raw, F(slug, 'score.js'))),
    strings: (slug, locale) => call<Record<string, string>>(at(g.strings, F(slug, `strings/${locale}.json`))),
    timing: async (slug, locale) => at(g.timings, F(slug, `timing.${locale}.json`)) ?? at(g.timings, F(slug, 'timing.json')) ?? null,
    voice: async (slug, locale, scene) => at(g.voice, F(slug, `voice/${locale}/${scene}.m4a`)) ?? null,
    voiceText: async (slug, locale) => at(g.voiceText, F(slug, `voice/${locale}.json`)) ?? null,
  };
  const contentSource: ContentSource = {
    index: async () => Object.values(g.index ?? {})[0] ?? [],
    body: (locale, slug) => call<StoryBody>(at(g.bodies, `stories/${locale}/${slug}.json`)),
    sceneIds: async (film) => at(g.films, F(film, 'film.json'))?.scenes.map((s) => s.id) ?? null,
  };
  const logos = Object.fromEntries(Object.entries(g.logos ?? {}).map(([p, svg]) => [logoName(p), svg]));
  const site = Object.values(g.site ?? {})[0] as SiteConfig | undefined;
  return { filmSource, contentSource, logos, site };
}
