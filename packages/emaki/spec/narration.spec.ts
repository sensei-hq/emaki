// Narration in the browser: each scene's voice take, encoded for the web by `emaki voice-web`, plays from `voice`
// seconds into its scene (timing.<locale>.json) whenever sound is on, in step with the picture, over a ducked score.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShow, loadFilm, narration, sceneSound, scorePlayer, useSource, type FilmJson, type FilmSource } from '../src/index.js';

class FakeAudio {
  static all: FakeAudio[] = [];
  src: string; currentTime = 0; paused = true; preload = '';
  constructor(src = '') { this.src = src; FakeAudio.all.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute(k: string) { if (k === 'src') this.src = ''; }
  load() {}
}
const playing = () => FakeAudio.all.filter((a) => !a.paused);

const film: FilmJson = {
  title: 'T', background: '#fff',
  scenes: [{ id: 'a', name: 'A', dur: 2 }, { id: 'b', name: 'B', dur: 3 }, { id: 'c', name: 'C', dur: 1 }],
};
const timing = { scenes: { a: { dur: 4, voice: 0.6 }, b: { voice: 0.5 } } };
let score: string | null = null;
let voice: FilmSource['voice'];

beforeEach(() => {
  document.body.replaceChildren();
  FakeAudio.all = [];
  score = null;
  voice = async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`;
  vi.stubGlobal('Audio', FakeAudio);
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async (_s, id) => ({ components: [{ type: 'text', id: `t-${id}`, text: id }], tracks: [] }),
    score: async () => score,
    timing: async () => timing,
    voice: (s, l, id) => voice!(s, l, id),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const box = () => document.body.appendChild(document.createElement('div'));

describe('timing', () => {
  it('carries each scene\'s narration start from timing.<locale>.json', async () => {
    const f = (await loadFilm('f'))!;
    expect(f.scenes.map((s) => s.voice)).toEqual([0.6, 0.5, undefined]);
  });
});

describe('narration', () => {
  it('plays a scene\'s take from where the picture is', async () => {
    const n = narration((await loadFilm('f', 'es'))!, 'es');
    expect(await n.start('a', 1.6)).toBe(true);
    expect(playing()).toHaveLength(1);
    expect(playing()[0]).toMatchObject({ src: '/v/f/es/a.m4a', currentTime: 1 });
    n.stop();
    expect(playing()).toHaveLength(0);
  });

  it('waits for the voice\'s start when the picture is before it', async () => {
    vi.useFakeTimers();
    const n = narration((await loadFilm('f'))!, 'en');
    await n.start('a', 0.2);
    expect(playing()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(playing()[0]).toMatchObject({ src: '/v/f/en/a.m4a', currentTime: 0 });
  });

  it('stays silent for a scene without narration, or a source that serves none', async () => {
    const f = (await loadFilm('f'))!;
    expect(await narration(f, 'en').start('c', 0)).toBe(false);
    voice = async () => null;
    expect(await narration(f, 'en').start('a', 1)).toBe(false);
    expect(FakeAudio.all).toHaveLength(0);
  });

  it('a stop() before the take resolves wins over the late start', async () => {
    const n = narration((await loadFilm('f'))!, 'en');
    const p = n.start('a', 1);
    n.stop();
    expect(await p).toBe(false);
    expect(playing()).toHaveLength(0);
  });
});

describe('story player', () => {
  it('narrates the scene on screen while sound is on and it plays', async () => {
    const show = await createShow(box(), 'f', { poster: true });
    await show.start();
    await vi.waitFor(() => expect(playing().map((a) => a.src)).toEqual(['/v/f/en/a.m4a']));
    show.pause();
    expect(playing()).toHaveLength(0);
    show.play();
    show.next();
    await vi.waitFor(() => expect(playing().map((a) => a.src)).toEqual(['/v/f/en/b.m4a']));
    show.setSound(false);
    expect(playing()).toHaveLength(0);
    show.destroy();
  });

  it('is quiet without sound', async () => {
    const show = await createShow(box(), 'f');
    show.next();
    await new Promise((r) => setTimeout(r, 20));
    expect(playing()).toHaveLength(0);
    show.destroy();
  });
});

describe('article figure', () => {
  it('offers sound for a narrated scene even without a score, and cues the take from the scene\'s start', async () => {
    vi.stubGlobal('AudioContext', fakeAudioContext().Ctx);
    const s = sceneSound('f', 'b');
    expect(await s.available).toBe(true);
    expect(await sceneSound('f', 'c').available).toBe(false);
    vi.useFakeTimers();
    await s.toggle();
    await vi.advanceTimersByTimeAsync(500);
    expect(playing()[0]).toMatchObject({ src: '/v/f/en/b.m4a', currentTime: 0 });
    s.stop();
    expect(playing()).toHaveLength(0);
    s.destroy();
  });
});

describe('score under the voice', () => {
  it('ducks the score while narration plays and brings it back after', async () => {
    score = 'kit.score(function (S, T) { S.tempo(70); });';
    const fake = fakeAudioContext();
    vi.stubGlobal('AudioContext', fake.Ctx);
    const a = scorePlayer((await loadFilm('f'))!);
    expect(await a.start(0)).toBe(true);
    const bus = fake.gains[0];
    a.duck(true);
    expect(bus.target).toBeLessThan(1);
    a.duck(false);
    expect(bus.target).toBe(1);
    a.close();
  });
});

/** Just enough of an AudioContext for the score player: every node accepts anything; gains record their target. */
function fakeAudioContext() {
  const gains: { target: number }[] = [];
  const any = (): unknown => {
    const store: Record<string | symbol, unknown> = {};
    return new Proxy(function () {}, {
      get: (_t, k) => (k === 'then' ? undefined : (k in store ? store[k] : (store[k] = any()))),
      set: (_t, k, v) => { store[k] = v; return true; },
      apply: () => any(),
    });
  };
  class Ctx {
    currentTime = 0; sampleRate = 48000; destination = any();
    async resume() {} async close() {}
    createGain() {
      const rec = { target: 1 };
      gains.push(rec);
      const node = any() as Record<string, unknown>;
      node.gain = { value: 1, setTargetAtTime: (v: number) => { rec.target = v; }, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {} };
      return node;
    }
    createBuffer(_c: number, n: number) { const d = new Float32Array(Math.max(1, n | 0)); return { getChannelData: () => d, length: d.length }; }
  }
  return { Ctx: new Proxy(Ctx, { construct: (C) => new Proxy(new C() as unknown as Record<string | symbol, unknown>, { get: (t, k) => (k in t ? t[k] : (t[k] = () => any())) }) }), gains };
}

describe('loaders', () => {
  it('vite: the voice glob (?url) maps a scene to its narration, and a scene without one to null', async () => {
    const { viteSource } = await import('../src/loaders/vite.js');
    const { filmSource } = viteSource({
      films: { '/content/films/f/film.json': film },
      scenes: {},
      voice: { '/content/films/f/voice/es/a.m4a': '/assets/a-1234.m4a' },
    });
    expect(await filmSource.voice!('f', 'es', 'a')).toBe('/assets/a-1234.m4a');
    expect(await filmSource.voice!('f', 'en', 'a')).toBeNull();
    expect(await filmSource.voice!('f', 'es', 'b')).toBeNull();
  });

  it('fetch: the published content folder\'s voice/<locale>/<scene>.m4a', async () => {
    const { fetchFilmSource } = await import('../src/loaders/fetch.js');
    expect(await fetchFilmSource('/c').voice!('f', 'es', 'a')).toBe('/c/films/f/voice/es/a.m4a');
  });
});
