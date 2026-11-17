// Characterization: the story player's clock and controls, driven frame by frame: scenes advance on their running
// time, the film stops (or loops) at its end, sound follows the picture, and fit/layout/slide/capture/destroy behave.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log: string[] = [];
vi.mock('../src/sound.js', async (orig) => {
  const real = await orig<typeof import('../src/sound.js')>();
  return {
    ...real,
    scorePlayer: () => ({
      start: async (from: number) => { log.push(`score.start ${from.toFixed(2)}`); return true; },
      duck: (on: boolean) => log.push(`score.duck ${on}`),
      stop: () => log.push('score.stop'),
      close: () => log.push('score.close'),
    }),
    narration: () => ({
      has: (id: string) => id === 'b',
      start: async (id: string, local: number) => { log.push(`words.start ${id} ${local.toFixed(2)}`); return true; },
      stop: () => log.push('words.stop'),
    }),
  };
});
const { createShow, useSource } = await import('../src/index.js');
type FilmJson = import('../src/index.js').FilmJson;

const film: FilmJson = {
  title: 'T', background: '#fff',
  scenes: [{ id: 'a', name: 'A', dur: 2 }, { id: 'b', name: 'B', dur: 3 }, { id: 'c', name: 'C', dur: 1 }],
};
let frames: FrameRequestCallback[] = [];
let cancelled: number[] = [];
let now = 0;
/** Runs the pending animation frame `n` times, `ms` apart. */
const step = (n: number, ms = 100) => { for (let i = 0; i < n; i++) { now += ms; const f = frames; frames = []; f.forEach((cb) => cb(now)); } };

beforeEach(() => {
  document.body.replaceChildren();
  log.length = 0;
  frames = []; cancelled = []; now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { cancelled.push(id); });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async (_s, id) => ({ components: [{ type: 'text', id: `t-${id}`, text: id }], tracks: [] }),
    score: async () => null,
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const box = () => document.body.appendChild(document.createElement('div'));
const stageText = (host: HTMLElement) => host.shadowRoot!.getElementById('stage')!.textContent;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('story player clock', () => {
  it('advances through the scenes on their running time and stops at the end', async () => {
    const host = box();
    const show = await createShow(host, 'f');
    const seen: string[] = [];
    show.on((s) => seen.push(`${s.index}:${s.local.toFixed(1)}:${s.playing}`));
    step(1, 500); // dt is capped at 0.1 s
    expect(show.state.local).toBeCloseTo(0.1);
    step(19);
    expect(show.state).toMatchObject({ index: 1, local: 0 });
    await settle();
    expect(stageText(host)).toContain('b');
    step(31);
    await settle();
    expect(show.state.index).toBe(2);
    step(11);
    expect(show.state).toMatchObject({ index: 2, local: 1, playing: false });
    expect(seen).toEqual(['1:0.0:true', '2:0.0:true', '2:1.0:false']);
    step(5);
    expect(show.state.local).toBe(1);
    show.destroy();
    expect(log).toContain('score.close');
  });

  it('loops back to the first scene with loop', async () => {
    const show = await createShow(box(), 'f', { loop: true, slide: 3 });
    expect(show.state.index).toBe(2);
    step(11);
    expect(show.state).toMatchObject({ index: 0, local: 0, playing: true });
    show.destroy();
  });

  it('holds still while paused, and does not tick before the scene is mounted', async () => {
    const show = await createShow(box(), 'f');
    show.pause();
    step(5);
    expect(show.state.local).toBe(0);
    show.play();
    show.setLayout('portrait');
    step(3);
    expect(show.state.local).toBe(0);
    await settle();
    step(3);
    expect(show.state.local).toBeCloseTo(0.3);
    show.destroy();
  });

  it('sound follows the picture: the score from the film time, the narration over it, ducked when the scene speaks', async () => {
    const show = await createShow(box(), 'f');
    show.setSound(true);
    await settle();
    show.next();
    await settle();
    show.pause();
    show.setSound(false);
    expect(log).toEqual([
      'score.duck false', 'score.start 0.00', 'words.start a 0.00',
      'score.duck true', 'score.start 2.00', 'words.start b 0.00',
      'score.stop', 'words.stop',
      'score.stop', 'words.stop',
    ]);
    show.destroy();
  });

  it('fits the stage into a box and keeps the scale across remounts', async () => {
    const host = box();
    const show = await createShow(host, 'f');
    show.fit(960, 1000);
    expect([host.style.width, host.style.height]).toEqual(['960px', '540px']);
    show.setLayout('portrait');
    await settle();
    expect(show.state.layout).toBe('portrait');
    show.fit(540, 540);
    expect([host.style.width, host.style.height]).toEqual(['303.75px', '540px']);
    show.fit(-5, 10);
    expect([host.style.width, host.style.height]).toEqual(['0px', '0px']);
    show.destroy();
  });

  it('wraps prev() from the first scene to the last, and go() any index', async () => {
    const show = await createShow(box(), 'f');
    show.prev();
    expect(show.state.index).toBe(2);
    show.go(4);
    expect(show.state.index).toBe(1);
    show.go(-1);
    expect(show.state.index).toBe(2);
    show.destroy();
  });

  it('clamps the opening slide', async () => {
    for (const [slide, index] of [[undefined, 0], [0, 0], [2, 1], [99, 2]] as const) {
      const show = await createShow(box(), 'f', { slide });
      expect(show.state.index).toBe(index);
      show.destroy();
    }
  });

  it('capture mode never runs the clock and draws on seek', async () => {
    const host = box();
    const show = await createShow(host, 'f', { capture: true });
    expect(frames).toHaveLength(0);
    expect(show.state.playing).toBe(false);
    await show.seek(4.5);
    expect(show.state).toMatchObject({ index: 1 });
    expect(show.state.local).toBeCloseTo(2.5);
    expect(stageText(host)).toContain('b');
    show.destroy();
  });

  it('throws for a film it cannot find', async () => {
    await expect(createShow(box(), 'missing')).rejects.toThrow('emaki: no film "missing"');
  });

  it('destroy stops the clock, the sound and the listeners', async () => {
    const show = await createShow(box(), 'f');
    const l = vi.fn();
    const off = show.on(l);
    show.destroy();
    expect(cancelled).toHaveLength(1);
    expect(log).toEqual(['score.close', 'words.stop']);
    show.next();
    expect(l).not.toHaveBeenCalled();
    expect(off()).toBe(false);
  });
});
