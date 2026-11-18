import { describe, expect, it } from 'vitest';
import { VOICE_LEVEL, MUTED_INSTRUMENTS, collectScore, midi } from '../src/score.js';

describe('score API', () => {
  it('reads note names, sharps and flats, takes midi numbers as they are, and reads a garbled name as A4', () => {
    expect([midi('C4'), midi('C#4'), midi('Db4'), midi(' A-1 '), midi(64), midi('H2')]).toEqual([60, 61, 61, 9, 64, 69]);
  });

  it('places notes by time or by beat at the tempo, from the tempo\'s start', () => {
    const s = collectScore(`kit.score((S, T) => {
      S.tempo(60, { t0: T.b });
      S.note('x', 60, { beat: 2, beats: 3 });
      S.note('x', 62, { t: 1 });
      S.note('x', 64);
      S.tempo(120);
      S.note('x', 65, { beat: 1, dur: 0.2, vel: 90 });
    });`, { b: 10 });
    expect(s.events.map((e) => (e.kind === 'note' ? [e.midi, e.t, e.dur, e.vel] : null))).toEqual([
      [65, 0.5, 0.2, 90], [62, 1, 0.8, 60], [64, 10, 0.8, 60], [60, 12, 3, 60],
    ]);
  });

  it('turns ticks into tick effects, takes the master level, and ignores other dialects\' pattern helpers', () => {
    const s = collectScore(`kit.score((S) => {
      S.ticks([2, 1], { vel: 20 }); S.ticks([3]);
      S.master({ gain: -3 });
      S.pattern('x'); S.drums('y'); S.drum('z');
    });`, {});
    expect(s.events).toEqual([
      { kind: 'fx', name: 'tick', t: 1, dur: 0.5, vel: 20, pitch: undefined },
      { kind: 'fx', name: 'tick', t: 2, dur: 0.5, vel: 20, pitch: undefined },
      { kind: 'fx', name: 'tick', t: 3, dur: 0.5, vel: 50, pitch: undefined },
    ]);
    expect(s.master).toEqual({ gain: -3, fadeOut: 1.5 });
  });
});

describe('score mix', () => {
  // The pad is a bed; the bells, marimba and plucks are the animation's sounds and must sit
  // clearly above it, or the beats disappear under the music (heard 2026-11-15: bed loud, beats buried;
  // still too shy after the first rebalance, so the gap widened from 3x to 4x).
  it('keeps the pad bed well below the beat voices', () => {
    expect(VOICE_LEVEL.pad).toBeLessThanOrEqual(0.15);
    for (const v of ['bell', 'marimba', 'pluck']) {
      expect(VOICE_LEVEL[v], v).toBeGreaterThan(VOICE_LEVEL.pad * 4);
    }
  });
  // Then (2026-11-15, Jerry): no background score at all, only the action tones.
  it('drops the background bed and keeps the action tones', () => {
    expect(MUTED_INSTRUMENTS).toContain('pad');
    const s = collectScore(`kit.score((S, T) => { S.program('pad', 'pad'); S.program('bell', 'vibes');
      S.chord('pad', ['D3', 'A3'], { t: 0, dur: 8 }); S.note('bell', 'A5', { t: 1 }); S.fx('click', 2); });`, {});
    expect(s.events.map((e) => (e.kind === 'note' ? e.track : e.name))).toEqual(['bell', 'click']);
  });
});
