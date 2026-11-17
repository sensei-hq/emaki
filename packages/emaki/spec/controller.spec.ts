// Characterization: attachScene, the DOM side of a ScenePlayerState, branch by branch: mounting and remounting on key
// changes, the races a slow mount can lose, failures, rendering the playhead, the clock, fitting, autoplay on screen
// and teardown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Fake = { args: unknown[]; stage: HTMLElement; W: number; dur: number; render: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
const mounts: Fake[] = [];
let gate: Promise<void> | null = null;
let mountError: unknown = null;
vi.mock('../src/mount.js', async (orig) => {
  const real = await orig<typeof import('../src/mount.js')>();
  return {
    ...real,
    fontsReady: async () => {},
    mountScene: async (...args: unknown[]) => {
      if (gate) await gate;
      if (mountError) throw mountError;
      const m: Fake = { args, stage: document.createElement('div'), W: 1920, dur: 3, render: vi.fn(), destroy: vi.fn() };
      mounts.push(m);
      return m;
    },
  };
});
const { attachScene, ScenePlayerState, useSource } = await import('../src/index.js');

let frames: FrameRequestCallback[] = [];
let now = 0;
const step = (n: number, ms = 50) => { for (let i = 0; i < n; i++) { now += ms; const f = frames; frames = []; f.forEach((cb) => cb(now)); } };
let observer: { cb: (e: { isIntersecting: boolean }[]) => void; observed: Element[]; disconnected: boolean; opts: unknown } | null = null;

beforeEach(() => {
  mounts.length = 0;
  gate = null; mountError = null; observer = null;
  frames = []; now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void, opts: unknown) { observer = { cb, observed: [], disconnected: false, opts }; }
    observe(el: Element) { observer!.observed.push(el); }
    disconnect() { observer!.disconnected = true; }
  });
  useSource({
    films: async () => [{ slug: 'f', json: { title: 'T', background: '#fff', scenes: [{ id: 'a', name: 'A', dur: 3 }, { id: 'b', name: 'B', dur: 2 }] } }],
    css: async () => '', scene: async () => null, score: async () => null,
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const box = () => document.body.appendChild(document.createElement('div'));
const loaded = (scene = 'a', layout: 'landscape' | 'portrait' | 'figure' = 'landscape') => {
  const p = new ScenePlayerState();
  p.load({ film: 'f', scene, layout });
  return p;
};
const sound = () => ({ cue: vi.fn(), stop: vi.fn(), destroy: vi.fn(), setLocale: vi.fn() });

describe('attachScene', () => {
  it('mounts the scene, marks the player ready and draws the playhead', async () => {
    const host = box(), p = loaded();
    const view = attachScene(host, p, { locale: 'es', mode: 'dark' });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    expect(mounts).toHaveLength(1);
    const [h, f, scene, layout, o] = mounts[0].args as [HTMLElement, { slug: string }, string, string, unknown];
    expect([h, f.slug, scene, layout, o]).toEqual([host, 'f', 'a', 'landscape', { locale: 'es', src: undefined, mode: 'dark' }]);
    expect(p.dur).toBe(3);
    expect(mounts[0].render).toHaveBeenLastCalledWith(0);
    expect(host.style.position).toBe('relative');
    expect(host.style.overflow).toBe('hidden');
    expect(host.style.aspectRatio).toBe('1920 / 1080');
    p.seek(1.5);
    expect(mounts[0].render).toHaveBeenLastCalledWith(1.5);
    p.seek(3);
    expect(mounts[0].render).toHaveBeenLastCalledWith(3 - 1e-3);
    view.destroy();
  });

  it('runs the clock while playing, and only then', async () => {
    const p = loaded();
    const view = attachScene(box(), p);
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    step(2);
    expect(p.t).toBe(0);
    p.play();
    step(1, 50);
    expect(p.t).toBeCloseTo(0.05);
    step(1, 1000); // dt is capped at 0.1 s
    expect(p.t).toBeCloseTo(0.15);
    view.destroy();
  });

  it('remounts on a new scene, a mode or a language, destroying the old mount', async () => {
    const s = sound();
    const p = loaded();
    const view = attachScene(box(), p, { sound: s });
    await vi.waitFor(() => expect(mounts).toHaveLength(1));
    p.load({ film: 'f', scene: 'b', layout: 'portrait' });
    await vi.waitFor(() => expect(mounts).toHaveLength(2));
    expect(mounts[0].destroy).toHaveBeenCalled();
    expect(mounts[1].args[2]).toBe('b');
    view.setMode('auto');
    view.setLocale('en');
    await new Promise((r) => setTimeout(r, 10));
    expect(mounts).toHaveLength(2);
    expect(s.setLocale).not.toHaveBeenCalled();
    view.setMode('dark');
    await vi.waitFor(() => expect(mounts).toHaveLength(3));
    view.setLocale('fr');
    await vi.waitFor(() => expect(mounts).toHaveLength(4));
    expect(s.setLocale).toHaveBeenCalledWith('fr');
    expect((mounts[3].args[4] as { locale: string; mode: string })).toMatchObject({ locale: 'fr', mode: 'dark' });
    view.destroy();
  });

  it('fits the stage to the host width', async () => {
    const host = box(), p = loaded('a', 'figure');
    const view = attachScene(host, p);
    view.fit(800);
    expect(host.style.aspectRatio).toBe('1600 / 1000');
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    view.fit(960);
    expect(mounts[0].stage.style.transform).toBe('scale(0.5)');
    view.destroy();
  });

  it('reports a missing film and a failing mount on the player', async () => {
    const p = new ScenePlayerState();
    p.load({ film: 'nope', scene: 'a', layout: 'landscape' });
    const view = attachScene(box(), p);
    await vi.waitFor(() => expect(p.status).toBe('error'));
    expect(p.error).toBe('no film "nope"');
    view.destroy();
    mountError = new Error('bad scene');
    const q = loaded();
    const v2 = attachScene(box(), q);
    await vi.waitFor(() => expect(q.error).toBe('bad scene'));
    v2.destroy();
    mountError = 'plain string';
    const r = loaded();
    const v3 = attachScene(box(), r);
    await vi.waitFor(() => expect(r.error).toBe('plain string'));
    v3.destroy();
  });

  it('drops a mount that finishes after destroy, or after the scene changed under it', async () => {
    let open!: () => void;
    gate = new Promise<void>((r) => { open = r; });
    const p = loaded();
    const view = attachScene(box(), p);
    await new Promise((r) => setTimeout(r, 0));
    view.destroy();
    open();
    await new Promise((r) => setTimeout(r, 10));
    expect(mounts[0].destroy).toHaveBeenCalled();
    expect(p.status).toBe('idle');

    mounts.length = 0;
    gate = new Promise<void>((r) => { open = r; });
    const q = loaded();
    const v2 = attachScene(box(), q);
    await new Promise((r) => setTimeout(r, 0));
    v2.setMode('dark');
    open();
    await vi.waitFor(() => expect(q.status).toBe('ready'));
    expect(mounts).toHaveLength(2);
    expect(mounts[0].destroy).toHaveBeenCalled();
    expect((mounts[1].args[4] as { mode: string }).mode).toBe('dark');
    v2.destroy();
  });

  it('autoplay plays while on screen and pauses (and silences) off it', async () => {
    const s = sound();
    const host = box(), p = loaded();
    const view = attachScene(host, p, { autoplay: true, still: false, sound: s });
    expect(observer!.observed).toEqual([host]);
    expect(observer!.opts).toEqual({ threshold: 0.2 });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    expect(p.playing).toBe(false);
    observer!.cb([{ isIntersecting: true }]);
    expect(p.playing).toBe(true);
    observer!.cb([{ isIntersecting: false }]);
    expect(p.playing).toBe(false);
    expect(s.stop).toHaveBeenCalledTimes(1);
    observer!.cb([{ isIntersecting: true }]);
    p.load({ film: 'f', scene: 'b', layout: 'landscape' });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    expect(p.playing).toBe(true);
    view.destroy();
    expect(observer!.disconnected).toBe(true);
  });

  it('without autoplay it neither observes nor plays', async () => {
    const p = loaded();
    const view = attachScene(box(), p, { still: false });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    expect(observer).toBeNull();
    expect(p.playing).toBe(false);
    view.destroy();
  });

  it('cues the sound each time the scene loops', async () => {
    const s = sound();
    const p = loaded();
    const view = attachScene(box(), p, { sound: s });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    p.play();
    step(31, 100);
    expect(p.loops).toBe(1);
    expect(s.cue).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('destroy stops the clock, unsubscribes, and tears down the sound and the mount', async () => {
    const s = sound();
    const p = loaded();
    const view = attachScene(box(), p, { sound: s });
    await vi.waitFor(() => expect(p.status).toBe('ready'));
    view.destroy();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(s.destroy).toHaveBeenCalled();
    expect(mounts[0].destroy).toHaveBeenCalled();
    const renders = mounts[0].render.mock.calls.length;
    p.seek(1);
    expect(mounts[0].render.mock.calls.length).toBe(renders);
    step(2);
    expect(frames).toHaveLength(0);
  });
});
