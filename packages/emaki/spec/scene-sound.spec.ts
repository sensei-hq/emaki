// Characterization: an article figure's sound (sceneSound) and the narration player, branch by branch: the score's
// slice and its ducking, toggling off, a missing scene or film, locale changes and teardown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const played: unknown[][] = [];
const handles: { stop: ReturnType<typeof vi.fn> }[] = [];
vi.mock('../src/score.js', async (orig) => {
  const real = await orig<typeof import('../src/score.js')>();
  return { ...real, play: (...a: unknown[]) => { played.push(a); const h = { stop: vi.fn() }; handles.push(h); return h; } };
});
const { filmScore, loadFilm, narration, sceneSound, scorePlayer, useSource, DUCK } = await import('../src/index.js');
type FilmJson = import('../src/index.js').FilmJson;

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

class FakeCtx {
  static all: FakeCtx[] = [];
  currentTime = 2; destination = { id: 'dest' }; closed = false; resumed = 0;
  gains: { gain: { value: number }; connect: (d: unknown) => void; to?: unknown }[] = [];
  constructor() { FakeCtx.all.push(this); }
  async resume() { this.resumed++; }
  async close() { this.closed = true; }
  createGain() { const g = { gain: { value: 1 }, to: undefined as unknown, connect(d: unknown) { g.to = d; } }; this.gains.push(g); return g; }
}

const film: FilmJson = {
  title: 'T', background: '#fff',
  scenes: [{ id: 'a', name: 'A', dur: 2 }, { id: 'b', name: 'B', dur: 3 }, { id: 'c', name: 'C', dur: 1 }],
};
let score: string | null;
let voice: ((slug: string, locale: string, scene: string) => Promise<string | null>) | undefined;

beforeEach(() => {
  played.length = 0;
  FakeAudio.all = [];
  FakeCtx.all = [];
  score = 'kit.score(function (S, T) { S.fx("tick", T.b + 0.5); });';
  voice = async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('AudioContext', FakeCtx);
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async () => null,
    score: async () => score,
    timing: async () => ({ scenes: { b: { voice: 0.5 } } }),
    get voice() { return voice && ((s: string, l: string, id: string) => voice!(s, l, id)); },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('scene sound', () => {
  it('plays the scene\'s slice of the score from `at`, ducked under its narration', async () => {
    const s = sceneSound('f', 'b');
    await s.toggle(1);
    const ctx = FakeCtx.all[0];
    expect(ctx.resumed).toBe(1);
    expect(played).toHaveLength(1);
    const [c, bus, sc, { from, to, at, end }] = played[0] as [FakeCtx, FakeCtx['gains'][0], { events: unknown[] }, { from: number; to: number; at: number; end: number }];
    expect(c).toBe(ctx);
    expect(bus).toBe(ctx.gains[0]);
    expect(bus.to).toBe(ctx.destination);
    expect(bus.gain.value).toBe(DUCK);
    expect(sc.events).toHaveLength(1);
    expect([from, to, at, end]).toEqual([2 + 1, 5, 2.03, 6]);
    await s.cue(0.5);
    expect(ctx.gains).toHaveLength(1);
    expect((played[1][3] as { from: number }).from).toBe(2.5);
    s.destroy();
    expect(ctx.closed).toBe(true);
    expect(s.on).toBe(false);
  });

  it('plays the score at full level for a scene without narration', async () => {
    const s = sceneSound('f', 'a');
    expect(await s.available).toBe(true);
    await s.toggle();
    expect(FakeCtx.all[0].gains[0].gain.value).toBe(1);
    expect(playing()).toHaveLength(0);
    s.destroy();
  });

  it('without a score: speaks only, and never opens an AudioContext', async () => {
    score = null;
    const s = sceneSound('f', 'b');
    await s.toggle();
    expect(FakeCtx.all).toHaveLength(0);
    expect(played).toHaveLength(0);
    s.destroy();
  });

  it('toggling off stops it; cue() while off does nothing', async () => {
    const s = sceneSound('f', 'b');
    await s.toggle();
    expect(s.on).toBe(true);
    await s.toggle();
    expect(s.on).toBe(false);
    await s.cue(0);
    expect(played).toHaveLength(1);
    s.destroy();
  });

  it('is unavailable for a missing scene or film, and stays silent', async () => {
    for (const s of [sceneSound('f', 'zz'), sceneSound('nope', 'a')]) {
      expect(await s.available).toBe(false);
      await s.toggle();
      expect(played).toHaveLength(0);
      s.destroy();
    }
  });

  it('setLocale() to the same language keeps what it loaded', async () => {
    const s = sceneSound('f', 'b', 'es');
    await s.toggle(1);
    s.setLocale('es');
    await s.cue(1);
    expect(playing().map((a) => a.src)).toEqual(['/v/f/es/b.m4a']);
    s.destroy();
  });
});

describe('narration', () => {
  it('has() needs a narration start and a source that serves voice', async () => {
    const f = (await loadFilm('f'))!;
    expect(narration(f, 'en').has('b')).toBe(true);
    expect(narration(f, 'en').has('a')).toBe(false);
    voice = undefined;
    expect(narration(f, 'en').has('b')).toBe(false);
  });

  it('stays silent when the source serves no voice at all', async () => {
    const f = (await loadFilm('f'))!;
    voice = undefined;
    expect(await narration(f, 'en').start('b', 1)).toBe(false);
    expect(playing()).toHaveLength(0);
  });

  it('stays silent when the take fails to load', async () => {
    const f = (await loadFilm('f'))!;
    voice = async () => { throw new Error('offline'); };
    expect(await narration(f, 'en').start('b', 1)).toBe(false);
    expect(FakeAudio.all).toHaveLength(0);
  });

  it('asks the source for each take once', async () => {
    const f = (await loadFilm('f'))!;
    const spy = vi.fn(async () => '/v.m4a');
    voice = spy;
    const n = narration(f, 'en');
    expect(await n.start('b', 1)).toBe(true);
    expect(await n.start('b', 2)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(playing()).toHaveLength(1);
    expect(playing()[0].currentTime).toBe(1.5);
    n.stop();
  });
});

describe('film score', () => {
  it('moves a sound placed after a pause along with the scene it falls in', async () => {
    useSource({
      films: async () => [{ slug: 'f', json: film }],
      css: async () => '',
      scene: async () => null,
      score: async () => score,
      timing: async () => ({ scenes: { b: { holds: [[0.2, 1]] } } }),
    });
    const sc = (await filmScore((await loadFilm('f'))!))!;
    expect(sc.events.map((e) => e.t)).toEqual([3.5]);
  });
});

describe('score player', () => {
  it('starts ducked when the narration was already speaking, and restarting or stopping silences what was playing', async () => {
    const p = scorePlayer((await loadFilm('f'))!);
    p.duck(true);
    expect(await p.start(0)).toBe(true);
    expect(FakeCtx.all[0].gains[0].gain.value).toBe(DUCK);
    const first = handles.at(-1)!;
    expect(await p.start(1)).toBe(true);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(FakeCtx.all).toHaveLength(1);
    p.stop();
    expect(handles.at(-1)!.stop).toHaveBeenCalledTimes(1);
    p.stop();
    p.close();
    expect(FakeCtx.all[0].closed).toBe(true);
  });
});
