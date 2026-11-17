// What the sensei-hq.com players do that emaki's must too (issue #1, gap 8), as core behaviour the wrappers bind:
// a figure rests on its last frame before it loops, holds a still under reduced motion, and can play its slice of the
// score; the story player can open on its cover, shows progress per scene, and answers R / Home / F as well as
// ←/→, Space, M and O.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachScene, createShow, installCapture, sceneSound, showKey, ticks, ScenePlayerState, useSource, type FilmJson,
} from '../src/index.js';
import { defineMotionElements } from '../src/elements/index.js';

const film: FilmJson = {
  title: 'T',
  background: '#fff',
  scenes: [{ id: 'a', name: 'A', dur: 2 }, { id: 'b', name: 'B', dur: 3 }, { id: 'c', name: 'C', dur: 1 }],
  cover: { scene: 'b', at: 1.5 },
};
let score: string | null = null;

beforeEach(() => {
  document.body.replaceChildren();
  score = null;
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async (_s, id) => ({ components: [{ type: 'text', id: `t-${id}`, text: id }], tracks: [] }),
    score: async () => score,
  });
});
afterEach(() => vi.unstubAllGlobals());

const box = () => document.body.appendChild(document.createElement('div'));

describe('scene player', () => {
  it('rests `hold` seconds on the last frame before it loops, and counts loops', () => {
    const p = new ScenePlayerState();
    p.load({ film: 'f', scene: 'a', layout: 'landscape' });
    p.markReady(2);
    p.hold = 1;
    p.play();
    p.tick(2.5);
    expect(p.t).toBeCloseTo(2.5);
    expect(p.loops).toBe(0);
    p.tick(0.6);
    expect(p.t).toBe(0);
    expect(p.loops).toBe(1);
  });

  it('a still (reduced motion) never plays and shows the scene near its end', async () => {
    const p = new ScenePlayerState();
    p.load({ film: 'f', scene: 'b', layout: 'landscape' });
    const view = attachScene(box(), p, { autoplay: true, still: true });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    expect(p.t).toBeCloseTo(3 - 0.6);
    p.play();
    expect(p.playing).toBe(false);
    view.destroy();
  });

  it('defaults to a still when the reader prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} }));
    const p = new ScenePlayerState();
    p.load({ film: 'f', scene: 'b', layout: 'landscape' });
    const view = attachScene(box(), p, { autoplay: true });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    expect(p.t).toBeCloseTo(2.4);
    view.destroy();
  });
});

describe('scene sound', () => {
  it('is available only when the film has a score', async () => {
    expect(await sceneSound('f', 'a').available).toBe(false);
    score = 'kit.score(function (S, T) { S.tempo(70); });';
    expect(await sceneSound('f', 'a').available).toBe(true);
  });
});

describe('story player', () => {
  it('opens on the cover with a poster, and start() plays from the first scene with sound on', async () => {
    const host = box();
    const show = await createShow(host, 'f', { poster: true });
    expect(show.state).toMatchObject({ started: false, playing: false, index: 1 });
    expect(show.state.local).toBeCloseTo(1.5);
    expect(host.shadowRoot!.getElementById('stage')!.textContent).toContain('b');
    await show.start();
    expect(show.state).toMatchObject({ started: true, playing: true, index: 0, local: 0, sound: true });
    show.destroy();
  });

  it('answers the keys: ←/→, Space, M, O, R (replay the scene), Home (from the top), F (fullscreen)', async () => {
    const show = await createShow(box(), 'f');
    const key = (k: string, el?: Element) => showKey(show, new KeyboardEvent('keydown', { key: k }), el);
    expect(key('ArrowRight')).toBe(true);
    expect(show.state.index).toBe(1);
    show.pause();
    expect(key(' ')).toBe(true);
    expect(show.state.playing).toBe(true);
    await show.seek(3.2);
    expect(key('r')).toBe(true);
    expect(show.state).toMatchObject({ index: 1, local: 0, playing: true });
    expect(key('Home')).toBe(true);
    expect(show.state).toMatchObject({ index: 0, local: 0 });
    expect(key('m')).toBe(true);
    expect(show.state.sound).toBe(true);
    expect(key('o')).toBe(true);
    expect(show.state.layout).toBe('portrait');
    const el = document.createElement('div');
    el.requestFullscreen = vi.fn(async () => {});
    expect(key('f', el)).toBe(true);
    expect(el.requestFullscreen).toHaveBeenCalled();
    expect(key('x')).toBe(false);
    show.destroy();
  });

  it('ticks: one per scene, weighted by duration, filled up to the playhead', async () => {
    const show = await createShow(box(), 'f');
    show.pause();
    await show.seek(3);
    expect(ticks(show)).toEqual([
      { id: 'a', name: 'A', dur: 2, fill: 1 },
      { id: 'b', name: 'B', dur: 3, fill: 1 / 3 },
      { id: 'c', name: 'C', dur: 1, fill: 0 },
    ]);
    show.destroy();
  });
});

describe('story player keys, the rest of the way', () => {
  it('← goes back a scene, Space starts a poster and then pauses it, O turns portrait back to landscape', async () => {
    const show = await createShow(box(), 'f', { poster: true });
    const key = (k: string) => showKey(show, new KeyboardEvent('keydown', { key: k }));
    key(' ');
    await vi.waitFor(() => expect(show.state).toMatchObject({ started: true, playing: true, index: 0 }));
    key(' ');
    expect(show.state.playing).toBe(false);
    key('ArrowLeft');
    expect(show.state.index).toBe(2);
    key('o'); key('o');
    expect(show.state.layout).toBe('landscape');
    show.destroy();
  });

  it('F leaves fullscreen when something is fullscreen, and asks for the whole page by default', async () => {
    const show = await createShow(box(), 'f');
    const page = document.documentElement as HTMLElement & { requestFullscreen: () => Promise<void> };
    page.requestFullscreen = vi.fn(async () => {});
    showKey(show, new KeyboardEvent('keydown', { key: 'f' }));
    expect(page.requestFullscreen).toHaveBeenCalledTimes(1);
    const exit = vi.fn(async () => {});
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => page });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    showKey(show, new KeyboardEvent('keydown', { key: 'f' }));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(page.requestFullscreen).toHaveBeenCalledTimes(1);
    delete (document as unknown as Record<string, unknown>).fullscreenElement;
    delete (document as unknown as Record<string, unknown>).exitFullscreen;
    delete (page as unknown as Record<string, unknown>).requestFullscreen;
    show.destroy();
  });
});

describe('story player teardown', () => {
  it('drops a scene that finishes mounting after the show was destroyed', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    useSource({
      films: async () => [{ slug: 'f', json: film }],
      css: async () => '',
      scene: async (_s, id) => { if (id === 'b') await gate; return { components: [{ type: 'text', id: `t-${id}`, text: id }], tracks: [] }; },
    });
    const host = box();
    const show = await createShow(host, 'f');
    show.go(1);
    await new Promise((r) => setTimeout(r, 10));
    show.destroy();
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(host.shadowRoot!.getElementById('stage')).toBeNull();
  });
});

describe('capture', () => {
  it('renders light by default, seeks to film time, and hands over the score as a base64 WAV (or null without one)', async () => {
    const host = box();
    const show = await installCapture(host, 'f', 'landscape', 'en');
    expect(host.shadowRoot!.getElementById('stage')!.dataset.mode).toBe('light');
    const cap = (window as unknown as { __show: { seek: (t: number) => Promise<void>; audio: () => Promise<string | null> } }).__show;
    await cap.seek(4);
    expect(show.state).toMatchObject({ index: 1, local: 2 });
    expect(host.shadowRoot!.getElementById('stage')!.textContent).toBe('b');
    expect(await cap.audio()).toBeNull();
    score = 'kit.score(function (S) { S.fx("tick", 0.5); });';
    vi.stubGlobal('OfflineAudioContext', silentOfflineContext());
    const wav = atob((await cap.audio())!);
    expect(wav.slice(0, 4)).toBe('RIFF');
    expect(wav.length).toBe(44 + 4 * 4);
    show.destroy();
  });
});

/** An OfflineAudioContext whose nodes accept anything and whose render is four samples of silence. */
function silentOfflineContext() {
  const any = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : any()), set: () => true, apply: () => any() });
  return class {
    sampleRate = 48000; currentTime = 0; destination = any();
    constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k as keyof typeof o] : () => any()) }); }
    async startRendering() { const d = new Float32Array(4); return { length: 4, getChannelData: () => d }; }
    createBuffer(_c: number, n: number) { const d = new Float32Array(Math.max(1, n | 0)); return { length: d.length, getChannelData: () => d }; }
  };
}

describe('<motion-show>', () => {
  it('answers the same keys (it delegates to showKey)', async () => {
    class Watch { observe() {} disconnect() {} }
    vi.stubGlobal('ResizeObserver', Watch);
    defineMotionElements();
    const el = document.createElement('motion-show') as HTMLElement & { controller: Awaited<ReturnType<typeof createShow>> | null };
    el.setAttribute('film', 'f');
    document.body.appendChild(el);
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    el.controller!.go(2);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(el.controller!.state.index).toBe(0);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(el.controller!.state).toMatchObject({ index: 0, local: 0, playing: true });
    el.remove();
  });
});
