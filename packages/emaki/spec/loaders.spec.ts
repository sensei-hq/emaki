// The two loaders that turn a published content folder into a FilmSource and a ContentSource: fetchFilmSource and
// fetchContentSource read static files over HTTP (a missing file is a 404, never an error), viteSource reads the
// globs an app hands it (eager values or lazy importers, matched by path tail wherever the folder lives).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContentSource, fetchFilmSource } from '../src/loaders/fetch.js';
import { viteSource } from '../src/loaders/vite.js';
import type { FilmJson } from '../src/index.js';

const film: FilmJson = { title: 'T', background: '#fff', scenes: [{ id: 'a', name: 'A', dur: 1 }, { id: 'b', name: 'B', dur: 1 }] };

describe('fetchFilmSource and fetchContentSource', () => {
  let files: Record<string, unknown>;
  let asked: string[];
  beforeEach(() => {
    asked = [];
    files = {};
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const body = files[url];
      if (body === undefined) return new Response('not found', { status: 404 });
      return new Response(typeof body === 'string' ? body : JSON.stringify(body));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the films named in films/index.json, skips one without a film.json, and asks only once', async () => {
    files['/c/films/index.json'] = ['f', 'gone'];
    files['/c/films/f/film.json'] = film;
    const src = fetchFilmSource('/c');
    expect(await src.films()).toEqual([{ slug: 'f', json: film }]);
    await src.films();
    expect(asked.filter((u) => u.endsWith('index.json'))).toHaveLength(1);
  });

  it('lists no films when the folder has no index', async () => {
    expect(await fetchFilmSource().films()).toEqual([]);
    expect(asked).toEqual(['/content/films/index.json']);
  });

  it('reads the look, the scenes, the score and the strings, as text or JSON', async () => {
    files['/c/films/f/look.css'] = '#stage{color:red}';
    files['/c/films/f/scene-a.json'] = { components: [], tracks: [] };
    files['/c/films/f/score.js'] = 'export default 1';
    files['/c/films/f/strings/es.json'] = { hi: 'hola' };
    const src = fetchFilmSource('/c');
    expect(await src.css('f')).toBe('#stage{color:red}');
    expect(await src.scene('f', 'a')).toEqual({ components: [], tracks: [] });
    expect(await src.scene('f', 'b')).toBeNull();
    expect(await src.score!('f')).toBe('export default 1');
    expect(await src.strings!('f', 'es')).toEqual({ hi: 'hola' });
    expect(await src.strings!('f', 'fr')).toBeNull();
  });

  it('gives an empty look when the film has no look.css', async () => {
    expect(await fetchFilmSource('/c').css('f')).toBe('');
  });

  it('reads the voiceover script for the locale, or nothing when the film has none', async () => {
    files['/c/films/f/voice/en.json'] = [{ scene: 'a', text: 'Hi.' }];
    const src = fetchFilmSource('/c');
    expect(await src.voiceText!('f', 'en')).toEqual([{ scene: 'a', text: 'Hi.' }]);
    expect(await src.voiceText!('f', 'es')).toBeNull();
  });

  it('reads the timing for the locale, falling back to the film-wide timing', async () => {
    files['/c/films/f/timing.es.json'] = { scenes: { a: { dur: 2 } } };
    files['/c/films/f/timing.json'] = { scenes: { a: { dur: 1 } } };
    const src = fetchFilmSource('/c');
    expect(await src.timing!('f', 'es')).toEqual({ scenes: { a: { dur: 2 } } });
    expect(await src.timing!('f', 'fr')).toEqual({ scenes: { a: { dur: 1 } } });
  });

  it('collects the code scenes the film lists, skipping a scene that has no module', async () => {
    files['/c/films/f/shared.js'] = 'window.W = {}';
    files['/c/films/f/film.json'] = film;
    files['/c/films/f/scene-a.js'] = 'kit.scene("a", {})';
    expect(await fetchFilmSource('/c').code!('f')).toEqual({ shared: 'window.W = {}', scenes: { a: 'kit.scene("a", {})' } });
  });

  it('has no code without a shared.js, and no code scenes without a film.json', async () => {
    const src = fetchFilmSource('/c');
    expect(await src.code!('f')).toBeNull();
    files['/c/films/f/shared.js'] = '';
    expect(await src.code!('f')).toEqual({ shared: '', scenes: {} });
  });

  it('reads the story index once, a story body, and the scene ids of a film', async () => {
    files['/c/stories/index.json'] = [{ slug: 's' }];
    files['/c/stories/es/s.json'] = { title: 'S' };
    files['/c/films/f/film.json'] = film;
    const content = fetchContentSource('/c');
    expect(await content.index()).toEqual([{ slug: 's' }]);
    await content.index();
    expect(asked.filter((u) => u.endsWith('stories/index.json'))).toHaveLength(1);
    expect(await content.body('es', 's')).toEqual({ title: 'S' });
    expect(await content.sceneIds!('f')).toEqual(['a', 'b']);
  });

  it('has no stories and no scene ids when the files are missing', async () => {
    const content = fetchContentSource();
    expect(await content.index()).toEqual([]);
    expect(await content.body('en', 'x')).toBeNull();
    expect(await content.sceneIds!('f')).toBeNull();
  });
});

describe('viteSource', () => {
  it('reads raw files, eager or lazy, and gathers the code scenes of one film', async () => {
    const { filmSource } = viteSource({
      films: { '/src/content/films/f/film.json': film },
      scenes: { '/src/content/films/f/scene-a.json': { components: [], tracks: [] } },
      raw: {
        '/src/content/films/f/look.css': '#stage{}',
        '/src/content/films/f/shared.js': () => Promise.resolve('window.W = {}'),
        '/src/content/films/f/scene-a.js': () => Promise.resolve('A'),
        '/src/content/films/f/score.js': 'S',
        '/src/content/films/other/scene-z.js': 'Z',
      },
    });
    expect(await filmSource.css('f')).toBe('#stage{}');
    expect(await filmSource.scene('f', 'a')).toEqual({ components: [], tracks: [] });
    expect(await filmSource.code!('f')).toEqual({ shared: 'window.W = {}', scenes: { a: 'A' } });
    expect(await filmSource.score!('f')).toBe('S');
  });

  it('answers missing files with nothing: no look, no scene, no code, no score, no strings', async () => {
    const { filmSource } = viteSource({ films: {}, scenes: {} });
    expect(await filmSource.css('f')).toBe('');
    expect(await filmSource.scene('f', 'a')).toBeNull();
    expect(await filmSource.code!('f')).toBeNull();
    expect(await filmSource.score!('f')).toBeNull();
    expect(await filmSource.strings!('f', 'en')).toBeNull();
  });

  it('reads the voiceover scripts the app globbed, or nothing when it did not', async () => {
    const { filmSource } = viteSource({
      films: {}, scenes: {}, voiceText: { '/content/films/f/voice/en.json': [{ scene: 'a', text: 'Hi.' }] },
    });
    expect(await filmSource.voiceText!('f', 'en')).toEqual([{ scene: 'a', text: 'Hi.' }]);
    expect(await filmSource.voiceText!('f', 'es')).toBeNull();
    const { filmSource: bare } = viteSource({ films: {}, scenes: {} });
    expect(await bare.voiceText!('f', 'en')).toBeNull();
  });

  it('gives a film an empty slug when its path is not films/<slug>/film.json', async () => {
    const { filmSource } = viteSource({ films: { '/odd/film.json': film }, scenes: {} });
    expect(await filmSource.films()).toEqual([{ slug: '', json: film }]);
  });

  it('has no stories and no scene ids for a film it does not hold', async () => {
    const { contentSource, logos, site } = viteSource({ films: {}, scenes: {} });
    expect(await contentSource.index()).toEqual([]);
    expect(await contentSource.sceneIds!('f')).toBeNull();
    expect(logos).toEqual({});
    expect(site).toBeUndefined();
  });
});
