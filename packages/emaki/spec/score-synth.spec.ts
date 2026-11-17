// Characterization: the synthesis graph each instrument, effect and playback window builds, recorded call by call on a
// fake AudioContext, so restructuring the synth cannot change a sound.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { play, type Ev, type Program, type Score } from '../src/score.js';

/** An AudioContext that records every node, connection, start/stop and parameter write, in order. */
function recordingContext() {
  const log: string[] = [];
  let n = 0;
  const param = (name: string) => {
    let v = 0;
    const rec = (m: string) => (...a: unknown[]) => { log.push(`${name}.${m}(${a.join(', ')})`); };
    return {
      get value() { return v; },
      set value(x: number) { v = x; log.push(`${name}=${x}`); },
      setValueAtTime: rec('setValueAtTime'), linearRampToValueAtTime: rec('linearRampToValueAtTime'),
      exponentialRampToValueAtTime: rec('exponentialRampToValueAtTime'), setTargetAtTime: rec('setTargetAtTime'),
      cancelScheduledValues: rec('cancelScheduledValues'),
      __id: name,
    };
  };
  const node = (kind: string) => {
    const id = `${kind}${n++}`;
    const base: Record<string, unknown> = {
      __id: id,
      connect: (d: { __id: string }) => { log.push(`${id} -> ${d.__id}`); return d; },
      disconnect: () => log.push(`${id} disconnect`),
      start: (...a: unknown[]) => log.push(`${id}.start(${a.map((x) => Number(x).toFixed(4)).join(', ')})`),
      stop: (...a: unknown[]) => log.push(`${id}.stop(${a.join(', ')})`),
    };
    return new Proxy(base, {
      get: (o, k: string) => (k in o ? o[k] : (o[k] = param(`${id}.${k}`))),
      set: (o, k: string, v) => { o[k] = v; log.push(`${id}.${k}=${typeof v === 'object' ? 'buffer' : v}`); return true; },
    });
  };
  const ctx = {
    sampleRate: 100, currentTime: 0, destination: node('dest'),
    createGain: () => node('gain'), createOscillator: () => node('osc'), createBiquadFilter: () => node('filter'),
    createStereoPanner: () => node('pan'), createDynamicsCompressor: () => node('comp'), createConvolver: () => node('verb'),
    createBufferSource: () => node('src'),
    createBuffer: (_c: number, len: number) => ({ length: len, getChannelData: () => new Float32Array(len) }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, log };
}

const program = (inst: string, o: Partial<Program> = {}): Program => ({ inst, gain: -3, rev: 0.4, pan: -0.2, bright: 0.7, ...o });
const score = (events: Ev[], programs: Record<string, Program> = {}, master = { gain: -6, fadeOut: 1.5 }): Score => ({ programs, events, master });
const render = (s: Score, from = 0, to = 100, at = 0.05, end = 100) => {
  const { ctx, log } = recordingContext();
  const h = play(ctx, ctx.destination, s, from, to, at, end);
  return { log, h };
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('score synthesis', () => {
  for (const inst of ['pad', 'vibes', 'bell', 'marimba', 'pluck', 'ep', 'bass', 'organ'])
    it(`builds the same voice for ${inst}`, () => {
      const s = score([
        { kind: 'note', track: 'a', midi: 60, t: 1, dur: 0.5, vel: 40 },
        { kind: 'note', track: 'a', midi: 72, t: 2, dur: 3, vel: 90 },
      ], { a: program(inst) });
      expect(render(s).log).toMatchSnapshot();
    });

  for (const name of ['click', 'tick', 'thud', 'pop', 'whoosh', 'revswell', 'roll', 'ding', 'chime', 'sparkle', 'boing'])
    it(`builds the same effect for ${name}`, () => {
      const s = score([
        { kind: 'fx', name, t: 1, dur: 0.3, vel: 50 },
        { kind: 'fx', name, t: 3, dur: 0.8, vel: 100, pitch: 70 },
      ]);
      expect(render(s).log).toMatchSnapshot();
    });

  it('plays a window: skips what is over, carries sustaining notes, stops at `to`, fades at the end, defaults a missing program', () => {
    const s = score([
      { kind: 'note', track: 'pad', midi: 48, t: 0, dur: 8, vel: 30 },
      { kind: 'note', track: 'pad', midi: 50, t: 0, dur: 4.1, vel: 30 },
      { kind: 'fx', name: 'tick', t: 1, dur: 0.1, vel: 30 },
      { kind: 'note', track: 'nobody', midi: 64, t: 5, dur: 1, vel: 60 },
      { kind: 'fx', name: 'pop', t: 6, dur: 0.2, vel: 60 },
      { kind: 'note', track: 'pad', midi: 52, t: 9, dur: 1, vel: 30 },
    ], { pad: program('marimba') }, { gain: -4, fadeOut: 2 });
    const { log, h } = render(s, 4, 9, 1, 10);
    h.stop();
    vi.advanceTimersByTime(500);
    expect(log).toMatchSnapshot();
  });

  it('does not fade when the window ends before the fade or the score has none', () => {
    const s = (fadeOut: number) => score([{ kind: 'fx', name: 'tick', t: 1, dur: 0.1, vel: 30 }], {}, { gain: 0, fadeOut });
    expect(render(s(1.5), 0, 5, 0, 10).log).toMatchSnapshot('before the fade');
    expect(render(s(0), 0, 10, 0, 10).log).toMatchSnapshot('no fade');
  });
});
