// Svelte 5 reactivity over the core: reactivePlayer and reactiveShow make the core's notifications into tracked reads,
// so effects (and templates) re-run when the player or the story controller changes, and stop when torn down.
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePlayerState } from '@senseihq/emaki';
import { reactivePlayer, reactiveShow } from '../src/lib/player.svelte.js';
import { fakeShow, type FakeShow } from './fakes.js';

/** Runs `fn` in an effect root; returns its result and the teardown. */
function inRoot<T>(fn: () => T): [T, () => void] {
  let out!: T;
  const stop = $effect.root(() => { out = fn(); });
  flushSync();
  return [out, stop];
}

describe('reactivePlayer', () => {
  it('reads through to the player, re-running effects on each change until torn down', () => {
    const player = new ScenePlayerState();
    const seen: string[] = [];
    const [p, stop] = inRoot(() => {
      const p = reactivePlayer(() => player);
      $effect(() => { seen.push(`${p.status} ${p.t}/${p.dur} ${p.playing ? 'playing' : 'paused'}`); });
      return p;
    });
    expect(seen).toEqual(['idle 0/0 paused']);
    expect([p.key, p.ref, p.error]).toEqual(['', null, '']);

    player.load({ film: 'f', scene: 'a', layout: 'figure' });
    player.markReady(4);
    flushSync();
    player.play();
    player.seek(1.5);
    flushSync();
    expect(seen).toEqual(['idle 0/0 paused', 'ready 0/4 paused', 'ready 1.5/4 playing']);
    expect([p.key, p.ref]).toEqual(['f:a:figure:', { film: 'f', scene: 'a', layout: 'figure' }]);
    player.fail('broken');
    flushSync();
    expect(p.error).toBe('broken');
    expect(seen.at(-1)).toBe('error 1.5/4 paused');

    stop();
    player.seek(0);
    flushSync();
    expect(seen).toHaveLength(4);
  });

  it('follows a different player when the getter does', () => {
    const a = new ScenePlayerState(), b = new ScenePlayerState();
    const seen: string[] = [];
    let current = $state(a);
    const [, stop] = inRoot(() => {
      const p = reactivePlayer(() => current);
      $effect(() => { seen.push(p.status); });
    });
    current = b;
    flushSync();
    b.fail('x');
    flushSync();
    a.load({ film: 'f', scene: 'a', layout: 'figure' });
    a.markReady(2);
    flushSync();
    expect(seen).toEqual(['idle', 'idle', 'error']);
    stop();
  });
});

describe('reactiveShow', () => {
  let frames: Map<number, FrameRequestCallback>, next: number;
  const frame = () => { const due = [...frames.values()]; frames.clear(); due.forEach((f) => f(performance.now())); flushSync(); };
  beforeEach(() => {
    frames = new Map(); next = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  });
  afterEach(() => vi.unstubAllGlobals());
  const attach = (s: ReturnType<typeof reactiveShow>, show: FakeShow) => s.attach(show as unknown as Parameters<typeof s.attach>[0]);

  it('is empty until a controller is attached', () => {
    const s = reactiveShow();
    expect([s.api, s.index, s.local, s.playing, s.sound, s.layout, s.started, s.count, s.ticks]).toEqual([null, 0, 0, false, false, 'landscape', true, 0, []]);
    expect(frames.size).toBe(0);
  });

  it('mirrors the attached controller, follows its playhead each frame, and lets it go on detach', () => {
    const show = fakeShow(3), seen: string[] = [];
    const [s, stop] = inRoot(() => {
      const s = reactiveShow();
      $effect(() => { seen.push(`${s.index}@${s.local.toFixed(1)} ${s.playing ? '▶' : '❚❚'} ${s.sound ? 'snd' : '-'} ${s.layout} ${s.count}`); });
      return s;
    });
    attach(s, show);
    flushSync();
    expect(seen.at(-1)).toBe('0@0.0 ▶ - landscape 3');
    expect(show.listeners.size).toBe(1);

    // `api` is the controller: calling it drives the show, whose notifications come back as state.
    s.api!.next(); show.setSound(true); show.setLayout('portrait');
    expect(show.next).toHaveBeenCalledOnce();
    flushSync();
    expect(seen.at(-1)).toBe('1@0.0 ▶ snd portrait 3');

    // The playhead moves without notifications; one read a frame keeps up with it, and a still frame changes nothing.
    show.advance(1);
    frame();
    expect(s.local).toBe(1);
    expect(s.ticks.map((t) => t.fill)).toEqual([1, 0.5, 0]);
    const n = seen.length;
    frame();
    expect(seen).toHaveLength(n);
    expect(frames.size).toBe(1);

    s.detach();
    expect(show.destroy).toHaveBeenCalledOnce();
    expect(show.listeners.size).toBe(0);
    expect(frames.size).toBe(0);
    expect([s.api, s.count, s.ticks]).toEqual([null, 0, []]);
    stop();
  });

  it('re-attaching swaps controllers and keeps one frame loop', () => {
    const a = fakeShow(2), b = fakeShow(4), s = reactiveShow();
    attach(s, a);
    attach(s, b);
    expect(frames.size).toBe(1);
    expect(s.count).toBe(4);
    b.next();
    expect(s.index).toBe(1);
  });

  it('a frame already due when it detaches reads nothing', () => {
    const show = fakeShow(), s = reactiveShow();
    attach(s, show);
    const due = [...frames.values()][0];
    s.detach();
    show.advance(1);
    expect(() => due(performance.now())).not.toThrow();
    expect(s.local).toBe(0);
  });

  it('detaching with nothing attached is harmless', () => {
    const s = reactiveShow();
    expect(() => s.detach()).not.toThrow();
  });
});
