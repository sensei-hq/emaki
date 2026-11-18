// Custom-element upgrade: defineMotionElements() after attributed elements are already connected fires one
// attribute callback per observed attribute plus connectedCallback, so up to six mounts overlap per element.
// The newest call must win: every figure's visible stage keeps the box scale, every show its newest controller.
// (Its own file: the upgrade path needs defineMotionElements() to run after insertion, once per registry.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSource, type FilmJson, type SceneSpec } from '../src/index.js';
import { defineMotionElements } from '../src/elements/index.js';

class FakeAudio {
  src: string; currentTime = 0; paused = true; preload = '';
  constructor(src = '') { this.src = src; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute(k: string) { if (k === 'src') this.src = ''; }
  load() {}
}

/** Observers whose callbacks the spec fires by hand (jsdom has neither). */
class Watch {
  static all: Watch[] = [];
  constructor(public cb: (entries: { isIntersecting: boolean }[]) => void) { Watch.all.push(this); }
  observe() {} disconnect() {}
}

const film: FilmJson = { title: 'T', background: '#fff', scenes: [{ id: 'a', name: 'A', dur: 1 }, { id: 'b', name: 'B', dur: 1 }] };
const sceneJson = (id: string): SceneSpec => ({
  components: [{ type: 'text', id: `t-${id}`, text: id }],
  tracks: [{ kind: 'tween', target: `.t-${id}`, prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
  portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
}) as SceneSpec;

/** Gates that reorder loads the way fonts and fetch do in the wild: the first scene load waits for G1, every
 *  score load (which each figure's sound awaits) waits for G2. Both released by hand, in order. */
let sceneCalls: number;
let sceneGate: Promise<SceneSpec>, releaseScene!: (v: SceneSpec) => void;
let scoreGate: Promise<string | null>, releaseScore!: (v: string | null) => void;

beforeEach(() => {
  document.body.replaceChildren();
  Watch.all = [];
  sceneCalls = 0;
  sceneGate = new Promise((r) => (releaseScene = r));
  scoreGate = new Promise((r) => (releaseScore = r));
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('ResizeObserver', Watch);
  vi.stubGlobal('IntersectionObserver', Watch);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  useSource({
    films: async () => [{ slug: 'f', json: film }, { slug: 'g', json: { ...film, title: 'G' } }],
    css: async () => '',
    scene: async (_s, id) => (++sceneCalls === 1 ? sceneGate : sceneJson(id)),
    timing: async () => ({ scenes: { a: { voice: 0 } } }),
    voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
    score: () => scoreGate,
  });
  // defineMotionElements() runs in each test, after insertion: the upgrade path.
});
afterEach(() => vi.unstubAllGlobals());

/** A macrotask: every pending microtask chain settles, gated loads excluded. */
const tick = () => new Promise((r) => setTimeout(r, 0));
const stage = (el: Element) => el.querySelector('div')!.shadowRoot?.getElementById('stage') ?? null;

describe('upgrade races', () => {
  it('every upgraded figure keeps the box scale on its visible stage', async () => {
    document.body.innerHTML = [1, 2, 3]
      .map(() => '<motion-scene film="f" scene="a" layout="figure" locale="en" mode="light"></motion-scene>')
      .join('');
    defineMotionElements();
    await tick();
    releaseScene(sceneJson('a'));
    await tick();
    releaseScore(null);
    await tick();
    const figs = [...document.querySelectorAll('motion-scene')];
    expect(figs).toHaveLength(3);
    for (const el of figs) expect(stage(el)!.style.transform).toBe('scale(1)');
    figs.forEach((el) => el.remove());
  });

  it('an upgraded show keeps a live controller and a fitted stage', async () => {
    document.body.innerHTML = '<motion-show film="f" locale="en" layout="landscape" mode="light"></motion-show>';
    defineMotionElements();
    await tick();
    releaseScene(sceneJson('a'));
    await tick();
    releaseScore(null);
    await tick();
    const el = document.querySelector('motion-show') as HTMLElement & { controller: { state: { slug?: string } } | null };
    expect(el.controller).toBeTruthy();
    expect(stage(el)!.style.transform).toBe('scale(0)');
    el.remove();
  });
});
