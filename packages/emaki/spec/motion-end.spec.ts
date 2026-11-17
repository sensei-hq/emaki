// When a scene's motion is over: the last moment any track still moves (the renderer's defaults included), so a
// narrated scene can end with its voice instead of padding silence, without cutting a movement short.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateScene, loadFilm, localizeScene, motionEnd, useSource, type SceneSpec, type TrackSpec } from '../src/index.js';

const scene = (tracks: TrackSpec[], components: SceneSpec['components'] = []): SceneSpec => ({ components, tracks });

describe('motionEnd', () => {
  it('is the latest end over the tracks, staggers and the renderer\'s defaults included', () => {
    expect(motionEnd(scene([
      { kind: 'tween', target: '.a', prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'eo', count: 3, stagger: 0.5 },
    ]))).toBe(2);
    expect(motionEnd(scene([{ kind: 'effect', effect: 'fade', target: '.b', t0: 1, count: 2, stagger: 0.2 }]))).toBeCloseTo(1.7); // d = 0.5
    expect(motionEnd(scene([{ kind: 'effect', effect: 'pop', target: '.c', t0: 2 }]))).toBeCloseTo(2.4); // 0.4 s pop
    expect(motionEnd(scene([{ kind: 'effect', effect: 'push', target: '.d', t0: 0, dur: 9, from: 1, to: 1.1 }]))).toBe(9);
    expect(motionEnd(scene([{ kind: 'effect', effect: 'swap', target: '.e', indices: [0], at: 3.5 }]))).toBe(3.5);
    expect(motionEnd(scene([{ kind: 'effect', effect: 'growBars', target: '.f', count: 2, t0s: [1, 2.5], dur: 0.8, easing: 'eo', base: 0, hs: [1, 1], bs: [0, 0] }]))).toBeCloseTo(3.3);
    expect(motionEnd(scene([{ kind: 'effect', effect: 'counter', target: '.g', values: [1, 2, 3], t0: 0, t1: 2, easing: 'eo', stagger: 0.25, format: 'int' }]))).toBe(2.5);
  });

  it('counts the words a words track or a heading animates, so a longer translation ends later', () => {
    const words = (text: string) => scene(
      [{ kind: 'effect', effect: 'words', target: '.t', t0: 1 }],
      [{ type: 'text', id: 't', text, split: true }],
    );
    expect(motionEnd(words('one two three'))).toBeCloseTo(1 + 2 * 0.11 + 0.5);
    expect(motionEnd(words('uno dos tres cuatro cinco'))).toBeCloseTo(1 + 4 * 0.11 + 0.5);
    const head = scene([{ kind: 'effect', effect: 'showHead', target: '.h', t0: 2 }], [{ type: 'head', id: 'h', line: 'a b', sub: 's' }]);
    expect(motionEnd(head)).toBeCloseTo(2 + 0.9 + 0.5); // the sub arrives last
  });

  it('leaves out the closing mark\'s breathing, which never stops', () => {
    expect(motionEnd(scene([{ kind: 'effect', effect: 'settle', target: '.m', t0: 1, t1: 2, rt1: 2.4 }]))).toBe(2.4);
  });

  it('is a scene with no tracks: zero', () => {
    expect(motionEnd(scene([]))).toBe(0);
  });
});

describe('the sample film', () => {
  const dir = join(process.cwd(), 'packages/emaki-cli/templates/content/films/measure-the-right-work');
  const json = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf-8'));
  const settles = (spec: SceneSpec) => new Set(spec.tracks.flatMap((t) => (t.kind === 'effect' && t.effect === 'settle' ? [t.target] : [])));
  const still = (spec: SceneSpec, t: number) => {
    const quiet = settles(spec);
    return JSON.stringify(evaluateScene(spec, t).map((o) => (quiet.has(o.selector) ? { ...o, style: { ...o.style, transform: '' } } : o)));
  };

  for (const file of readdirSync(dir).filter((f) => /^scene-.*\.json$/.test(f)))
    for (const locale of ['en', 'es'])
      it(`${file} (${locale}) draws its final frame from motionEnd on`, () => {
        const spec = localizeScene(json(file) as SceneSpec, json(`strings/${locale}.json`));
        const end = motionEnd(spec);
        expect(end).toBeGreaterThan(0);
        expect(still(spec, end)).toBe(still(spec, end + 30));
      });
});

describe('a timing shorter than the design', () => {
  it('is the scene\'s running time: fit has already kept it past the last movement', async () => {
    useSource({
      films: async () => [{ slug: 'f', json: { title: 'F', background: '#fff', scenes: [{ id: 'a', name: 'A', dur: 8 }, { id: 'b', name: 'B', dur: 5 }] } }],
      css: async () => '', scene: async () => null, score: async () => null,
      timing: async () => ({ scenes: { a: { dur: 6.2 } } }),
    });
    const f = (await loadFilm('f'))!;
    expect(f.scenes.map((s) => [s.design, s.dur])).toEqual([[8, 6.2], [5, 5]]);
  });
});
