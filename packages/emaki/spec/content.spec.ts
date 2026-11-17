// The content side of the core: locales, stories, the film registry, and the loaders that feed them.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureLocales, coverTime, defaultLocale, dirOf, formatDate, listFilms, locales, evaluateScene, fallbackChain, listStories, loadFilm, loadStory, localizeScene,
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
  it('knows the configured languages and the default', () => {
    expect(locales()).toEqual(['en', 'es', 'fr-CA', 'fr', 'ar']);
    expect(defaultLocale()).toBe('en');
  });
  it('negotiates a configured region exactly, whatever its case', () => {
    expect(negotiate(['FR-ca', 'en'])).toBe('fr-CA');
  });
  it('formats a date for the reader, on the day it names in any time zone', () => {
    expect(formatDate('2026-11-15', 'en-US')).toBe('Nov 15, 2026');
    expect(formatDate('2026-11-15', 'en-US', { month: 'long' })).toBe('November');
  });
  it('interpolates UI strings and merges tables, most specific winning', () => {
    expect(t({ n: '{n} stories' }, 'n', { n: 3 })).toBe('3 stories');
    expect(t({ n: '{n} of {total}' }, 'n', { n: 3 })).toBe('3 of {total}');
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
  it('asks the app to install a source before anything loads', async () => {
    vi.resetModules();
    const fresh = await import('../src/registry.js');
    expect(() => fresh.getSource()).toThrow(/no film source; call useSource/);
  });
  it('lists every film with its title and scene count', async () => {
    const { filmSource } = globs();
    useSource(filmSource);
    const [only] = await listFilms();
    expect(only.slug).toBe(film);
    expect(only.scenes).toBe((await filmSource.films())[0].json.scenes.length);
    expect(only.title).toBeTruthy();
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
  it('an explicit figure wins over the same-id scene (the website rule)', async () => {
    const { contentSource } = globs();
    const en = (await loadStory(contentSource, film, 'en'))!;
    const id = en.sections.find((s) => s.motion)!.id;
    const withFigure = {
      ...contentSource,
      body: async (l: string, slug: string) => {
        const b = await contentSource.body(l, slug);
        return b && { ...b, sections: b.sections.map((s) => (s.id === id ? { ...s, figure: 'top10' } : s)) };
      },
    };
    const s = (await loadStory(withFigure, film, 'en'))!.sections.find((x) => x.id === id)!;
    expect(s.figure).toBe('top10');
    expect(s.motion).toBeUndefined();
  });
  it('has no story for a slug the index does not list, or one with no body in any language', async () => {
    const { contentSource } = globs();
    expect(await loadStory(contentSource, 'nope', 'en')).toBeNull();
    expect(await loadStory({ ...contentSource, body: async () => null }, film, 'fr-CA')).toBeNull();
  });
  it('leaves sections as written when the source cannot say which scenes a film has', async () => {
    const { contentSource } = globs();
    const story = (await loadStory({ ...contentSource, sceneIds: undefined }, film, 'en'))!;
    expect(story.sections.some((x) => x.motion)).toBe(false);
    expect(story.film).toBeUndefined();
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
