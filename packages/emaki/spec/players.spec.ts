// What the sensei-hq.com players do that emaki's must too (issue #1, gap 8), as core behaviour the wrappers bind:
// a figure rests on its last frame before it loops, holds a still under reduced motion, and can play its slice of the
// score; the story player can open on its cover, shows progress per scene, and answers R / Home / F as well as
// ←/→, Space, M and O.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachScene, createShow, sceneSound, showKey, ticks, ScenePlayerState, useSource, type FilmJson,
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
