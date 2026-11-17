// The web components: <motion-scene> mounts one scene (a figure unless told otherwise), waits for its film and scene
// attributes, plays only while on screen, loops with a short rest (cueing its sound again), and goes quiet when it
// scrolls away; <motion-show> starts its player when it has a film, restarts on a new one, fits on resize, and lets
// keys through until the player is there.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSource, type FilmJson } from '../src/index.js';
import { defineMotionElements } from '../src/elements/index.js';

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

/** Observers whose callbacks the spec fires by hand (jsdom has neither). */
class Watch {
  static all: Watch[] = [];
  constructor(public cb: (entries: { isIntersecting: boolean }[]) => void) { Watch.all.push(this); }
  observe() {} disconnect() {}
}
const intersect = (isIntersecting: boolean) => Watch.all.forEach((w) => w.cb([{ isIntersecting }]));

const film: FilmJson = { title: 'T', background: '#fff', scenes: [{ id: 'a', name: 'A', dur: 1 }, { id: 'b', name: 'B', dur: 1 }] };
let frames: FrameRequestCallback[];
let clock: number;

beforeEach(() => {
  document.body.replaceChildren();
  FakeAudio.all = []; Watch.all = []; frames = []; clock = performance.now() + 60_000;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('ResizeObserver', Watch);
  vi.stubGlobal('IntersectionObserver', Watch);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  useSource({
    films: async () => [{ slug: 'f', json: film }, { slug: 'g', json: { ...film, title: 'G' } }],
    css: async () => '',
    scene: async (_s, id) => ({
      components: [{ type: 'text', id: `t-${id}`, text: id }],
      tracks: [{ kind: 'tween', target: `.t-${id}`, prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
      portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
    }),
    timing: async () => ({ scenes: { a: { voice: 0 } } }),
    voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
  });
  defineMotionElements();
});
afterEach(() => vi.unstubAllGlobals());

function scene(attrs: Record<string, string>) {
  const el = document.createElement('motion-scene');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}
const stage = (el: Element) => el.querySelector('div')!.shadowRoot?.getElementById('stage') ?? null;
/** Runs the next `n` animation frames, 100 ms apart. */
function run(n: number) {
  for (let i = 0; i < n; i++) { clock += 100; frames.splice(0).forEach((f) => f(clock)); }
}

describe('<motion-scene>', () => {
  it('waits for both a film and a scene, and draws nothing for a film that does not exist', async () => {
    const el = scene({ film: 'f' });
    await new Promise((r) => setTimeout(r, 10));
    expect(stage(el)).toBeNull();
    el.setAttribute('film', 'nope');
    el.setAttribute('scene', 'a');
    await new Promise((r) => setTimeout(r, 10));
    expect(stage(el)).toBeNull();
    el.remove();
  });

  it('is a figure unless a layout is given', async () => {
    const el = scene({ film: 'f', scene: 'a' }) as HTMLElement & { layout: string };
    expect(el.layout).toBe('figure');
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    expect(el.querySelector<HTMLElement>('div')!.style.height).toBe('1000px');
    el.remove();
  });

  it('plays only while on screen, and loops after a short rest, cueing its sound from the top', async () => {
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape' });
    const btn = el.querySelector('button')!;
    await vi.waitFor(() => expect(btn.hidden).toBe(false));
    const word = () => stage(el)!.querySelector<HTMLElement>('.t-a')!;
    run(3);
    expect(word().style.opacity).toBe('');
    intersect(true);
    run(5);
    expect(Number(word().style.opacity)).toBeGreaterThan(0.3);
    btn.click();
    await vi.waitFor(() => expect(playing()).toHaveLength(1));
    const takes = FakeAudio.all.length;
    run(10);
    expect(Number(word().style.opacity)).toBeGreaterThan(0.99);
    run(10);
    expect(Number(word().style.opacity)).toBeLessThan(0.5);
    await vi.waitFor(() => expect(FakeAudio.all.length).toBeGreaterThan(takes));
    intersect(false);
    expect(playing()).toHaveLength(0);
    expect(btn.getAttribute('aria-label')).toBe('Sound on');
    el.remove();
  });

  it('loops without sound when the reader has not turned it on', async () => {
    const el = scene({ film: 'f', scene: 'b', layout: 'landscape' });
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    intersect(true);
    run(25);
    expect(FakeAudio.all).toHaveLength(0);
    el.remove();
  });

  it('ignores the sound button before the scene is mounted and after it is gone', async () => {
    const el = scene({});
    el.querySelector('button')!.click();
    el.remove();
    el.querySelector('button')!.click();
    expect(FakeAudio.all).toHaveLength(0);
  });
});

describe('<motion-show>', () => {
  type ShowEl = HTMLElement & { controller: { state: { slug?: string; index: number }; timeline: { scenes: unknown[] } } | null };
  it('starts once it has a film, restarts on a new one, and fits on resize', async () => {
    const el = document.createElement('motion-show') as ShowEl;
    document.body.appendChild(el);
    Watch.all[0].cb([]);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(el.controller).toBeNull();
    el.setAttribute('film', 'f');
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    const first = el.controller;
    Watch.all[0].cb([]);
    el.setAttribute('film', 'g');
    await vi.waitFor(() => expect(el.controller).not.toBe(first));
    el.remove();
  });
});
