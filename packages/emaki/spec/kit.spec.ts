// Characterization: the scene kit's math and DOM helpers, pinned as they are (JS scenes depend on every value).
import { describe, expect, it, vi } from 'vitest';
import { createKit } from '../src/kit.js';

const stage = () => document.createElement('div');
const kitOn = (s = stage()) => {
  const onScene = vi.fn(), onScore = vi.fn();
  return { kit: createKit({ stage: s, W: 1920, H: 1080, onScene, onScore }), onScene, onScore, s };
};
const xs = [-0.5, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1, 1.5];

describe('scene kit', () => {
  it('keeps its shape: size, stage and timing fields', () => {
    const { kit, s } = kitOn();
    expect({ W: kit.W, H: kit.H, dur: kit.dur, start: kit.start, stage: kit.stage === s }).toEqual({ W: 1920, H: 1080, dur: 0, start: 0, stage: true });
  });

  it('computes the same easings and helpers at every point', () => {
    const { kit: k } = kitOn();
    const table = {
      clamp01: xs.map(k.clamp01), eo: xs.map(k.eo), ei: xs.map(k.ei), eio: xs.map(k.eio), eoq: xs.map(k.eoq), eox: xs.map(k.eox),
      eob: xs.map((x) => k.eob(x)), eob2: xs.map((x) => k.eob(x, 2.5)), spring: xs.map(k.spring),
      clamp: xs.map((x) => k.clamp(x, 0.2, 0.8)), seg: xs.map((x) => k.seg(x, 0.25, 0.75)), lerp: xs.map((x) => k.lerp(10, 20, x)),
      smoothstep: xs.map((x) => k.smoothstep(0.1, 0.9, x)), step: xs.map((x) => k.step(x, 0.5)), pulse: xs.map((x) => k.pulse(x, 0.25, 0.9)),
      breathe: xs.map((x) => k.breathe(x)), breathe2: xs.map((x) => k.breathe(x, 0.1, 2)),
    };
    expect(table).toMatchSnapshot();
  });

  it('draws the same random and noise sequences per seed', () => {
    const { kit: k } = kitOn();
    for (const seed of [0, 1, 42, -7]) {
      const r = k.rng(seed);
      const n = k.vnoise(seed);
      expect({ rng: Array.from({ length: 5 }, r), noise: [-3.5, -1, 0, 0.3, 1.7, 255.5, 300.25].map(n) }).toMatchSnapshot(`seed ${seed}`);
    }
  });

  it('builds elements: h, el with every option, esc and css', () => {
    const { kit: k, s } = kitOn();
    expect(k.h('  <p class="a">hi</p> ').outerHTML).toBe('<p class="a">hi</p>');
    const child = document.createElement('i');
    expect(k.el('div', { class: 'c', style: 'color: red;', text: 'txt', attrs: { 'data-x': '1', role: 'note' } }, [child]).outerHTML)
      .toBe('<div class="c" style="color: red;" data-x="1" role="note">txt<i></i></div>');
    expect(k.el('span', { html: '<b>b</b>' }).outerHTML).toBe('<span><b>b</b></span>');
    expect(k.el('span', { text: 0 }).outerHTML).toBe('<span>0</span>');
    expect(k.el('br').outerHTML).toBe('<br>');
    expect(k.esc(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
    k.css('.x { color: red }');
    expect(s.innerHTML).toBe('<style>.x { color: red }</style>');
  });

  it('TextFx splits words once and fades them in from the right and out to the left', () => {
    const { kit: k } = kitOn();
    const p = document.createElement('p');
    p.textContent = 'one two three';
    k.TextFx.fadeFromRight(p, 0.3, 0);
    expect(p.innerHTML).toMatchSnapshot('in, defaults');
    k.TextFx.fadeFromRight(p, 0.3, 0, { stagger: 0.2, dur: 1, dx: 50 });
    expect(p.innerHTML).toMatchSnapshot('in, options');
    k.TextFx.fadeOutLeft(p, 0.2, 0);
    expect(p.innerHTML).toMatchSnapshot('out, defaults');
    k.TextFx.fadeOutLeft(p, 0.2, 0, { stagger: 0.1, dur: 0.5, dx: 10 });
    expect(p.innerHTML).toMatchSnapshot('out, options');
    expect(p.children).toHaveLength(3);
  });

  it('hands scenes and scores to its owner', () => {
    const { kit: k, onScene, onScore } = kitOn();
    const def = { render() {} }, fn = () => {};
    k.scene('a', def);
    k.score(fn);
    expect(onScene).toHaveBeenCalledWith('a', def, k);
    expect(onScore).toHaveBeenCalledWith(fn);
  });
});
