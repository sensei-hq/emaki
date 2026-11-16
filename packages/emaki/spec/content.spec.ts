// The content side of the core: locales, stories, the film registry, and the loaders that feed them.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureLocales, coverTime, dirOf, evaluateScene, fallbackChain, listStories, loadFilm, loadStory, localizeScene,
  mergeChain, negotiate, sceneKeys, t, timeline, today, unwarp, useSource, validateScene, warp, type SceneSpec,
} from '../src/index.js';
import { viteSource } from '../src/loaders/vite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/content');
const film = 'measure-the-right-work';
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** What Vite's import.meta.glob would hand the app, built from the fixture folder (lazy entries are functions). */
function globs() {
  const fdir = `films/${film}`, files = readdirSync(join(root, fdir));
  const key = (p: string) => `/content/${p}`;
  const lazy = <T>(p: string) => () => Promise.resolve(json(p) as T);
  return viteSource({
    films: { [key(`${fdir}/film.json`)]: json(`${fdir}/film.json`) },
    scenes: Object.fromEntries(files.filter((f) => /^scene-.*\.json$/.test(f)).map((f) => [key(`${fdir}/${f}`), lazy<SceneSpec>(`${fdir}/${f}`)])),
    strings: Object.fromEntries(readdirSync(join(root, fdir, 'strings')).map((f) => [key(`${fdir}/strings/${f}`), lazy(`${fdir}/strings/${f}`)])),
    raw: { [key(`${fdir}/look.css`)]: () => Promise.resolve(readFileSync(join(root, fdir, 'look.css'), 'utf8')) },
    index: { [key('stories/index.json')]: json('stories/index.json') },
    bodies: Object.fromEntries(['en', 'es'].map((l) => [key(`stories/${l}/${film}.json`), lazy(`stories/${l}/${film}.json`)])),
    site: { [key('site.json')]: json('site.json') },
  });
}

beforeEach(() => configureLocales({ locales: ['en', 'es', 'fr-CA', 'fr', 'ar'], defaultLocale: 'en' }));

describe('locales', () => {
  it('falls back from a region to its language, then the default', () => {
    expect(fallbackChain('fr-CA')).toEqual(['fr-CA', 'fr', 'en']);
    expect(fallbackChain('de')).toEqual(['en']);
  });
  it('negotiates Accept-Language and knows text direction', () => {
    expect(negotiate(['es-MX', 'en'])).toBe('es');
    expect(negotiate(['de'])).toBe('en');
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('es')).toBe('ltr');
  });
  it('interpolates UI strings and merges tables, most specific winning', () => {
    expect(t({ n: '{n} stories' }, 'n', { n: 3 })).toBe('3 stories');
    expect(t({}, 'missing.key')).toBe('missing.key');
    expect(mergeChain([{ a: 'fr-CA' }, { a: 'fr', b: 'fr' }, { a: 'en', b: 'en', c: 'en' }])).toEqual({ a: 'fr-CA', b: 'fr', c: 'en' });
  });
  it('dates by the site time zone, not UTC', () => {
    expect(today('Asia/Kolkata', new Date('2026-11-15T20:00:00Z'))).toBe('2026-11-16');
    expect(today('America/New_York', new Date('2026-11-15T20:00:00Z'))).toBe('2026-11-15');
  });
});

describe('vite loader + registry', () => {
  it('lists the film and resolves its timeline and cover', async () => {
    const { filmSource, site } = globs();
    useSource(filmSource);
    expect(site?.defaultLocale).toBeTruthy();
    const f = (await loadFilm(film, 'es'))!;
    expect(f.slug).toBe(film);
    const tl = timeline(f);
    expect(tl.duration).toBeCloseTo(f.scenes.reduce((n, s) => n + s.dur, 0));
    expect(coverTime(f)).toBeGreaterThan(tl.scenes.at(-1)!.start);
  });
  it('validates every scene and localises it with no key left over', async () => {
    const { filmSource } = globs();
    for (const s of (await filmSource.films())[0].json.scenes) {
      const spec = (await filmSource.scene(film, s.id))!;
      expect(validateScene(spec), s.id).toEqual([]);
      for (const l of ['en', 'es']) {
        const strings = (await filmSource.strings!(film, l))!;
        const missing = sceneKeys(spec).filter((k) => !(k in strings));
        expect(missing, `${s.id}/${l}`).toEqual([]);
        expect(JSON.stringify(localizeScene(spec, strings))).not.toMatch(/\{\{/);
      }
      expect(evaluateScene(spec, s.dur).length).toBeGreaterThan(0);
    }
  });
  it('holds stop the scene clock and unwarp inverts warp', () => {
    const holds: [number, number][] = [[2, 1.5]];
    expect(warp(1, holds)).toBe(1);
    expect(warp(2.7, holds)).toBe(2);
    expect(warp(4, holds)).toBe(2.5);
    expect(warp(unwarp(3, holds), holds)).toBe(3);
  });
});

describe('stories', () => {
  it('maps sections to scenes by id and falls back to the default locale', async () => {
    const { contentSource } = globs();
    const es = (await loadStory(contentSource, film, 'es'))!;
    expect(es.locale).toBe('es');
    expect(es.sections.some((s) => s.motion?.film === film)).toBe(true);
    const fr = (await loadStory(contentSource, film, 'fr-CA'))!;
    expect(fr.locale).toBe('en');
    expect(fr.fallbackFrom).toBe('en');
  });
  it('hides future-dated stories unless drafts are asked for', async () => {
    const { contentSource } = globs();
    expect((await listStories(contentSource, 'en', { timeZone: 'UTC' })).length).toBe(1);
    const future = { ...contentSource, index: async () => [{ slug: film, publish_date: '2999-01-01' }] };
    expect(await listStories(future, 'en')).toEqual([]);
    expect((await listStories(future, 'en', { drafts: true })).length).toBe(1);
  });
});

it('fixture folder is the starter sample', () => expect(existsSync(join(root, 'films', film, 'film.json'))).toBe(true));
