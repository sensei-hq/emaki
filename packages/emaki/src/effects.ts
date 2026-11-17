// The JSON scene's tracks as pure functions of t: each track kind evaluates to style ops (FRAMES) and knows when its
// motion is over (ENDS). The two tables sit side by side so their defaults stay together. Easing math is kit.ts's.
import { createKit, type Kit } from './kit.js';
import type { EffectTrack, SceneSpec, TweenTrack, WordsTrack } from './scene-schema.js';
import { findComponent, headOf, idOf, wordCount } from './scene-query.js';

/** One evaluated write: element `index` of `selector` gets style/text/classes/attrs. */
export interface FrameOp {
  selector: string;
  index: number;
  style?: Record<string, string>;
  text?: string;
  classes?: { add?: string[]; remove?: string[] };
  attrs?: Record<string, string>;
}

// Only the kit's pure functions are used (seg, easings, lerp, esc); the stub stage is never touched.
export const K: Kit = createKit({ stage: null as unknown as HTMLElement, W: 1920, H: 1080, onScene: () => {}, onScore: () => {} });

/** Compact numbers (4 decimals max); browsers render these identically to the modules' raw floats. */
export const fmt = (n: number) => String(Number(n.toFixed(4)));

const ease = (name: TweenTrack['easing'], x: number, o?: number) =>
  name === 'linear' ? K.clamp01(x) : name === 'eob' ? K.eob(x, o ?? 1.4) : K[name](x);

/** `count` ops for elements 0 … count-1 of `selector`, op i's writes built from its index. */
function each(count: number, selector: string, op: (i: number) => Omit<FrameOp, 'selector' | 'index'>): FrameOp[] {
  const ops: FrameOp[] = [];
  for (let i = 0; i < count; i++) ops.push({ selector, index: i, ...op(i) });
  return ops;
}

/** What a track evaluates against besides t: the scene (for word counts and headings) and the number locale. */
export interface EffectContext { spec: SceneSpec; locale: string }

export function tween(tr: TweenTrack, t: number): FrameOp[] {
  const gap = tr.stagger ?? 0;
  const f = tr.decimals === undefined ? fmt : (v: number) => v.toFixed(tr.decimals);
  const write = (v: string): Pick<FrameOp, 'style' | 'attrs'> =>
    tr.prop === 'opacity' ? { style: { opacity: v } }
      : tr.prop === 'transform' ? { style: { transform: (tr.template ?? '{v}').replace('{v}', v) } }
        : { attrs: { [tr.prop.slice('attr:'.length)]: v } };
  return each(tr.count ?? 1, tr.target, (i) => write(f(K.lerp(tr.from, tr.to, ease(tr.easing, K.seg(t, tr.t0 + i * gap, tr.t1 + i * gap))))));
}

// W.showHead (shared.js) + TextFx.fadeFromRight defaults (stagger 0.11, dur 0.5, dx 30).
function showHead(target: string, t0: number, t: number, head: { eyebrow?: string; line: string; sub?: string }): FrameOp[] {
  const part = (selector: string, d: number): FrameOp => {
    const p = K.eo(K.seg(t, t0 + d, t0 + d + 0.5));
    return { selector, index: 0, style: { opacity: fmt(p), transform: `translateX(${fmt(K.lerp(26, 0, p))}px)` } };
  };
  const line = each(head.line.split(' ').length, `${target} .line-word`, (i) => {
    const p = K.eo((t - (t0 + 0.15) - i * 0.11) / 0.5);
    return { style: { opacity: fmt(p), transform: `translateX(${((1 - p) * 30).toFixed(2)}px)` } };
  });
  return [...(head.eyebrow ? [part(`${target} .eyebrow`, 0)] : []), ...line, ...(head.sub ? [part(`${target} .sub`, 0.9)] : [])];
}

// TextFx.fadeFromRight (kit.ts) over pre-split word spans.
function words(tr: Omit<WordsTrack, 'kind' | 'effect'> & { count: number }, t: number): FrameOp[] {
  const { target, t0, stagger = 0.11, dur = 0.5, dx = 30 } = tr;
  return each(tr.count, target, (i) => {
    const p = K.eo((t - t0 - i * stagger) / dur);
    return { style: { opacity: fmt(p), transform: `translateX(${((1 - p) * dx).toFixed(2)}px)` } };
  });
}

/** A words track's word spans: the ones it counts, or a split text component's (`<target>-w`, one per word). */
function wordsOf(tr: WordsTrack, spec: SceneSpec) {
  if (tr.count !== undefined) return { ...tr, count: tr.count };
  const txt = findComponent(spec.components, idOf(tr.target));
  if (!txt || txt.type !== 'text' || !txt.split) throw new Error(`words track '${tr.target}': give a count, or target a text component with split`);
  return { ...tr, target: `${tr.target}-w`, count: wordCount(txt.text) };
}

type EffectOf<E extends EffectTrack['effect']> = Extract<EffectTrack, { effect: E }>;
type PerEffect<R> = { [E in EffectTrack['effect']]: (tr: EffectOf<E>, t: number, ctx: EffectContext) => R };

/** Every effect's ops at t. The W.* names are the shared.js helpers each one ports, formula for formula. */
export const FRAMES: PerEffect<FrameOp[]> = {
  // W.push: a slow camera scale that never reverses.
  push: (tr, t) => [
    { selector: tr.target, index: 0, style: { transform: `scale(${fmt(K.lerp(tr.from, tr.to, K.eio(K.seg(t, tr.t0, tr.t0 + tr.dur))))})` } },
  ],
  // W.fade: fade and rise in from t0.
  fade: ({ target, t0, d = 0.5, dy = 18, count = 1, stagger = 0 }, t) => each(count, target, (i) => {
    const p = K.eo(K.seg(t, t0 + i * stagger, t0 + i * stagger + d));
    return { style: { opacity: p.toFixed(3), transform: `translateY(${K.lerp(dy, 0, p).toFixed(1)}px)` } };
  }),
  // W.pop: appear with an overshooting scale.
  pop: ({ target, t0, base = '', count = 1, stagger = 0 }, t) => each(count, target, (i) => {
    const p = K.seg(t, t0 + i * stagger, t0 + i * stagger + 0.4);
    return { style: { opacity: K.eo(p).toFixed(3), transform: `${base} scale(${K.lerp(0.5, 1, K.eob(p, 1.8)).toFixed(3)})`.trim() } };
  }),
  // W.draw: draw an SVG path (pathLength="1") between t0 and t1.
  draw: ({ target, t0, t1, count = 1, stagger = 0 }, t) => each(count, target, (i) => (
    { style: { strokeDasharray: '1 1', strokeDashoffset: fmt(1 - K.eio(K.seg(t, t0 + i * stagger, t1 + i * stagger))) } }
  )),
  words: (tr, t, { spec }) => words(wordsOf(tr, spec), t),
  // Counting numbers: values[i] eased over a staggered window, locale-formatted with a prefix.
  counter: (o, t, { locale }) => each(o.count ?? o.values.length, o.target, (i) => {
    const v = Math.round(o.values[i] * ease(o.easing, K.seg(t, o.t0 + i * (o.stagger ?? 0), o.t1 + i * (o.stagger ?? 0))));
    return { text: (o.prefixes?.[i] ?? '') + (o.format === 'locale' ? v.toLocaleString(locale) : String(v)) };
  }),
  // Conditional restyle/reclass from a time (dots that turn red, cards that light up), restoring the base before it
  // so seeking backwards is exact.
  swap: (o, t) => {
    const on = t >= o.at;
    return o.indices.map((i) => {
      const op: FrameOp = { selector: o.target, index: i };
      if (o.style ?? o.base) op.style = { ...(on ? o.style : o.base) };
      if (o.addClass) op.classes = on ? { add: [o.addClass] } : { remove: [o.addClass] };
      return op;
    });
  },
  // Every scene-close's mark: overshooting settle, breathing scale, rotate-in.
  settle: (o, t) => {
    const s = K.eob(K.seg(t, o.t0, o.t1), o.o ?? 1.4);
    const scale = K.lerp(o.scaleFrom ?? 0.7, o.scaleTo ?? 1, s) * (1 + (o.breatheAmp ?? 0.012) * Math.sin(t * (o.breatheFreq ?? 1.6)));
    const rot = K.lerp(o.rotateFrom ?? -14, o.rotateTo ?? 0, K.eo(K.seg(t, o.rt0 ?? o.t0, o.rt1 ?? o.t1)));
    return [{ selector: o.target, index: 0, style: { opacity: fmt(K.clamp01(s * (o.opacityMult ?? 1.5))), transform: `scale(${fmt(scale)}) rotate(${rot.toFixed(2)}deg)` } }];
  },
  // Chart bars: per-bar start times, y/height attributes from stacked heights.
  growBars: (o, t) => each(o.count, o.target, (i) => {
    const h = Math.max(0, o.hs[i] * ease(o.easing, K.seg(t, o.t0s[i], o.t0s[i] + o.dur), o.o));
    return { attrs: { y: (o.base - o.bs[i] - h).toFixed(1), height: h.toFixed(1) } };
  }),
  showHead: (tr, t, { spec }) => {
    const head = headOf(spec, tr.target);
    if (!head) throw new Error(`showHead target '${tr.target}' is not a head component`);
    return showHead(tr.target, tr.t0, t, head);
  },
};

/** How long after its first element the last one of `n`, `stagger` apart, starts. */
export const after = (n: number | undefined, stagger: number | undefined) => ((n ?? 1) - 1) * (stagger ?? 0);

/** When each effect stops moving, with the same defaults FRAMES uses. Background motion (the camera push) is 0. */
export const ENDS: PerEffect<number> = {
  push: () => 0,
  fade: (tr) => tr.t0 + after(tr.count, tr.stagger) + (tr.d ?? 0.5),
  pop: (tr) => tr.t0 + after(tr.count, tr.stagger) + 0.4,
  draw: (tr) => tr.t1 + after(tr.count, tr.stagger),
  counter: (tr) => tr.t1 + after(tr.count ?? tr.values.length, tr.stagger),
  swap: (tr) => tr.at,
  settle: (tr) => Math.max(tr.t1, tr.rt1 ?? tr.t1),
  growBars: (tr) => Math.max(...tr.t0s.slice(0, tr.count)) + tr.dur,
  words: (tr, _t, { spec }) => {
    const txt = tr.count === undefined ? findComponent(spec.components, idOf(tr.target)) : undefined;
    const n = tr.count ?? (txt?.type === 'text' ? wordCount(txt.text) : 1);
    return tr.t0 + (n - 1) * (tr.stagger ?? 0.11) + (tr.dur ?? 0.5);
  },
  showHead: (tr, _t, { spec }) => {
    const head = headOf(spec, tr.target);
    if (!head) return tr.t0;
    const line = 0.15 + (head.line.split(' ').length - 1) * 0.11 + 0.5;
    return tr.t0 + Math.max(line, head.eyebrow ? 0.5 : 0, head.sub ? 1.4 : 0);
  },
};

/** Runs the table entry for `tr`'s effect (undefined for an effect the table does not know). */
export function perEffect<R>(table: PerEffect<R>, tr: EffectTrack, t: number, ctx: EffectContext): R | undefined {
  const fn = table[tr.effect] as ((tr: EffectTrack, t: number, ctx: EffectContext) => R) | undefined;
  return fn?.(tr, t, ctx);
}
