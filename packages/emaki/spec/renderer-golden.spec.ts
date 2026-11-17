// Characterization: the renderer's output pinned as it is, so restructuring it cannot change a frame. Every effect
// and component variant (defaults and options), the sample film's scenes in both locales over their whole running
// time, and the DOM mount with portrait, locale CSS and direction.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateScene, layoutComponents, localizeScene, motionEnd, mountJsonScene, registerLogo, renderComponent,
} from '../src/renderer.js';
import type { ComponentSpec, LocalizedSceneSpec, SceneSpec } from '../src/scene-schema.js';

const GLYPHS = ['spark', 'brace', 'ring', 'tri', 'grid', 'db', 'lock', 'crown', 'list', 'check', 'steps', 'doc', 'wave', 'other'];

const components: ComponentSpec[] = [
  { type: 'board', id: 'bd' },
  ...GLYPHS.map((kind, i): ComponentSpec => ({ type: 'node', id: `n-${kind}`, kind, tone: ['hot', 'ok', undefined][i % 3], size: i % 2 ? 120 : undefined })),
  { type: 'node', id: 'n-pos', kind: 'ring', x: 300, y: 200 },
  { type: 'wire', id: 'w1', a: [0, 0], c: [50, 80], b: [100, 0] },
  { type: 'wire', id: 'w2', a: [0, 0], c: [5, 8], b: [10, 0], color: 'red' },
  { type: 'bars', id: 'b1', x: 10, y: 20, rows: [[0, 100, 'hot'], [10, 80, 'ok'], [20, 60, 'ink'], [0, 40, 'x']] },
  { type: 'bars', id: 'b2', x: 10, y: 20, rows: [[0, 100, 'hot']], gap: 20, h: 8 },
  { type: 'logo', id: 'lg', name: 'mark', x: 100, y: 100, size: 64 },
  { type: 'head', id: 'hd', eyebrow: 'Eye & brow', line: 'Named, counted, shown <back>.', sub: 'Sub "quoted"', style: 'top:0' },
  { type: 'head', id: 'hd2', line: 'Just a line', at: 'ground' },
  { type: 'checks', id: 'ck', items: ['one', 'two'], style: 'left:0' },
  { type: 'checks', id: 'ck2', items: ['x'] },
  { type: 'group', id: 'gp', style: 'opacity:0', children: [{ type: 'svg', id: 's1', body: '<circle r="3"/>' }, { type: 'node', id: 'gn', kind: 'doc' }] },
  { type: 'group', id: 'gp2', children: [] },
  { type: 'svg', id: 's2', body: '<rect/>' },
  { type: 'raw', id: 'r1', html: '<div class="card">raw</div>' },
  { type: 'raw', id: 'r2', html: '<i>g</i>', at: 'ground' },
  // Targets for every track, so the mount applies each op kind (style, text, classes, attrs) to a real element.
  { type: 'raw', id: 'targets', html: ['e-linear', 'e-ei', 'e-eio', 'e-eoq', 'e-eox', 'e-spring', 'eob', 'tpl', 'f1', 'p1', 'mk', 'mk2', 'gb2']
    .map((c) => `<div class="${c}"></div>`).join('') + ['f2', 'p2', 'dot', 'dot2', 'dot3', 'ws', 'ws2', 'c1', 'c2'].map((c) => `<span class="${c}"></span>`.repeat(3)).join('') },
  { type: 'svg', id: 'svgtargets', body: '<circle class="at"/><circle class="at"/><circle class="at"/><rect class="gb"/><rect class="gb"/><rect class="gb"/>' },
  { type: 'text', id: 'tx', text: '  Split these  words <now> ', split: true, tag: 'h3', cls: 'big', style: 'color:red' },
  { type: 'text', id: 'tx2', text: 'Keep <b>bold</b>', html: true },
  { type: 'text', id: 'tx3', text: 'plain & simple' },
  { type: 'box', id: 'bx', tag: 'section', cls: 'card', style: 'pad:1', children: [{ type: 'text', id: 'bt', text: 'in a box', split: true }, { type: 'box', id: 'bx2', children: [{ type: 'raw', id: 'br', html: '<hr>' }] }] },
];

const spec: LocalizedSceneSpec = {
  components,
  tracks: [
    { kind: 'tween', target: '.r1', prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'eo' },
    ...(['linear', 'ei', 'eio', 'eoq', 'eox', 'spring'] as const).map((easing) => ({ kind: 'tween' as const, target: `.e-${easing}`, prop: 'opacity' as const, from: 0, to: 1, t0: 0.5, t1: 2, easing })),
    { kind: 'tween', target: '.eob', prop: 'transform', template: 'scale({v})', from: 0.5, to: 1, t0: 0, t1: 1, easing: 'eob', decimals: 3 },
    { kind: 'tween', target: '.tpl', prop: 'transform', from: 0, to: 10, t0: 0, t1: 1, easing: 'linear' },
    { kind: 'tween', target: '.at', prop: 'attr:r', from: 0, to: 20, t0: 0.2, t1: 1.2, easing: 'eio', count: 3, stagger: 0.3 },
    { kind: 'effect', effect: 'showHead', target: '.hd', t0: 0.2 },
    { kind: 'effect', effect: 'showHead', target: '.hd2', t0: 1 },
    { kind: 'effect', effect: 'push', target: '.cam', t0: 0, dur: 4, from: 1, to: 1.05 },
    { kind: 'effect', effect: 'fade', target: '.f1', t0: 0.3 },
    { kind: 'effect', effect: 'fade', target: '.f2', t0: 0.3, d: 0.8, dy: 40, count: 3, stagger: 0.2 },
    { kind: 'effect', effect: 'pop', target: '.p1', t0: 0.5 },
    { kind: 'effect', effect: 'pop', target: '.p2', t0: 0.5, base: 'translate(2px,3px)', count: 2, stagger: 0.1 },
    { kind: 'effect', effect: 'draw', target: '.w1', t0: 0.4, t1: 1.4 },
    { kind: 'effect', effect: 'draw', target: '.w2', t0: 0.4, t1: 1.4, count: 2, stagger: 0.25 },
    { kind: 'effect', effect: 'counter', target: '.c1', values: [1234567, 89], prefixes: ['$'], t0: 0, t1: 2, easing: 'eo', format: 'locale' },
    { kind: 'effect', effect: 'counter', target: '.c2', count: 1, values: [42, 7], t0: 0, t1: 1, easing: 'linear', stagger: 0.5, format: 'int' },
    { kind: 'effect', effect: 'swap', target: '.dot', indices: [0, 2], at: 1, style: { fill: 'red' }, base: { fill: 'grey' }, addClass: 'on' },
    { kind: 'effect', effect: 'swap', target: '.dot2', indices: [1], at: 1.5, addClass: 'lit' },
    { kind: 'effect', effect: 'swap', target: '.dot3', indices: [0], at: 0.5, style: { opacity: '1' } },
    { kind: 'effect', effect: 'words', target: '.ws', count: 3, t0: 0.2 },
    { kind: 'effect', effect: 'words', target: '.ws2', count: 2, t0: 0.2, stagger: 0.2, dur: 0.3, dx: 10 },
    { kind: 'effect', effect: 'words', target: '.tx', t0: 0.6 },
    { kind: 'effect', effect: 'words', target: '.bt', t0: 0.6, stagger: 0.05 },
    { kind: 'effect', effect: 'settle', target: '.mk', t0: 1, t1: 2 },
    { kind: 'effect', effect: 'settle', target: '.mk2', t0: 1, t1: 2, o: 2, scaleFrom: 0.2, scaleTo: 1.2, breatheAmp: 0.05, breatheFreq: 3, rotateFrom: 20, rotateTo: 5, rt0: 1.2, rt1: 2.8, opacityMult: 2 },
    { kind: 'effect', effect: 'growBars', target: '.gb', count: 3, t0s: [0, 0.5, 1, 9], dur: 0.8, easing: 'eob', o: 2, base: 300, hs: [100, 50, 80], bs: [0, 10, 20] },
    { kind: 'effect', effect: 'growBars', target: '.gb2', count: 1, t0s: [0.2], dur: 1, easing: 'eo', base: 10, hs: [5], bs: [1] },
  ],
  css: '.hd { color: red }',
  portrait: { hoist: ['.hd2'], frame: [100, 600], crop: [200, 100, 900, 600], css: '.pt-frame { outline: 1px }' },
  locales: { es: { css: '.es { x: 1 }' }, fr: { css: '.fr { y: 2 }' } },
};

registerLogo('mark', '<svg viewBox="0 0 512 512"><circle cx="256" cy="256" r="200"/></svg>\n');

const times = (end: number, step = 0.1) => Array.from({ length: Math.round(end / step) + 1 }, (_, i) => Number((i * step).toFixed(3)));
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

describe('renderer characterization', () => {
  it('evaluates every effect, easing and default the same at every time', () => {
    for (const locale of [undefined, 'de-DE']) {
      const frames = times(4).map((t) => `${t} ${hash(evaluateScene(spec, t, { locale }))}`);
      expect(frames).toMatchSnapshot(`frames ${locale ?? 'default'}`);
    }
  });

  it('ends motion where it did', () => {
    expect(motionEnd(spec)).toMatchSnapshot();
    const noCount: SceneSpec = { components: [], tracks: [{ kind: 'effect', effect: 'words', target: '.missing', t0: 2 }, { kind: 'effect', effect: 'showHead', target: '.none', t0: 3 }] };
    expect(motionEnd(noCount)).toBe(3);
    const counter: SceneSpec = { components: [], tracks: [{ kind: 'effect', effect: 'counter', target: '.c', count: 2, values: [1, 2, 3], t0: 0, t1: 1, easing: 'eo', stagger: 0.5, format: 'int' }] };
    expect(motionEnd(counter)).toBe(1.5);
    const draw: SceneSpec = { components: [], tracks: [{ kind: 'effect', effect: 'draw', target: '.d', t0: 0, t1: 2, count: 3, stagger: 0.5 }] };
    expect(motionEnd(draw)).toBe(3);
  });

  it('renders every component variant the same', () => {
    expect(components.map((c) => renderComponent(c))).toMatchSnapshot();
    expect(layoutComponents(components)).toMatchSnapshot();
  });

  it('throws the same authoring errors', () => {
    const words: SceneSpec = { components: [{ type: 'text', id: 'nt', text: 'a b' }], tracks: [{ kind: 'effect', effect: 'words', target: '.nt', t0: 0 }] };
    expect(() => evaluateScene(words, 0)).toThrow("words track '.nt': give a count, or target a text component with split");
    const head: SceneSpec = { components: [{ type: 'raw', id: 'h', html: '' }], tracks: [{ kind: 'effect', effect: 'showHead', target: '.h', t0: 0 }] };
    expect(() => evaluateScene(head, 0)).toThrow("showHead target '.h' is not a head component");
    expect(() => renderComponent({ type: 'logo', id: 'l', name: 'nope', x: 0, y: 0, size: 1 })).toThrow("unknown logo 'nope'");
  });

  it('mounts the DOM the same: portrait, scene and locale CSS, direction, and every op kind', () => {
    for (const [locale, W, H, dir] of [['es-MX', 1080, 1920, 'rtl'], ['fr', 1920, 1080, undefined], [undefined, 1920, 1080, undefined]] as const) {
      const host = document.createElement('div');
      const m = mountJsonScene(host, spec, { W, H, locale, dir, strings: {} });
      const html = times(3, 0.5).map((t) => { m.render(t); return `${t} ${hash(host.innerHTML)}`; });
      expect(html).toMatchSnapshot(`mount ${locale} ${W}x${H}`);
      m.destroy();
      expect(host.innerHTML).toBe('');
    }
  });

  it('mounts a spec with placeholders and no portrait host', () => {
    const host = document.createElement('div');
    const m = mountJsonScene(host, { components: [{ type: 'text', id: 't', text: '{{greet}} {{missing}}' }], tracks: [], portrait: { hoist: [], frame: [0, 1], crop: [0, 0, 1, 1] } }, { W: 100, H: 200, strings: { greet: 'hola' } });
    expect(host.innerHTML).toMatchSnapshot();
    m.destroy();
    expect(() => mountJsonScene(document.createElement('div'), { components: [], tracks: [] }, { W: 1, H: 1 })).toThrow('no components');
  });
});

describe('the sample film, frame by frame', () => {
  const dir = join(process.cwd(), 'packages/emaki-cli/templates/content/films/measure-the-right-work');
  const json = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf-8'));
  const film = json('film.json') as { scenes: { id: string; dur: number }[] };
  registerLogo('brand', readFileSync(join(dir, '../../logos/brand.svg'), 'utf-8'));
  for (const file of readdirSync(dir).filter((f) => /^scene-.*\.json$/.test(f)))
    for (const locale of ['en', 'es'])
      it(`${file} (${locale})`, () => {
        const spec = localizeScene(json(file) as LocalizedSceneSpec, json(`strings/${locale}.json`));
        const dur = film.scenes.find((s) => file === `scene-${s.id}.json`)?.dur ?? 20;
        expect({
          end: motionEnd(spec),
          layout: hash(layoutComponents(spec.components)),
          frames: hash(times(dur + 1, 0.05).map((t) => evaluateScene(spec, t, { locale }))),
        }).toMatchSnapshot();
      });
});
