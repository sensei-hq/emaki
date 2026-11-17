// The JSON scene renderer: evaluates a SceneSpec to style ops as a pure function of t (evaluateScene, no DOM,
// unit-testable) and mounts it (mountJsonScene, a thin DOM layer). The tracks' formulas live in effects.ts and the
// components' markup in components.ts. Text is localised before mounting (localizeScene): {{key}} placeholders are
// filled from the film's strings for the active locale.
import { COMPONENT_TYPES, layoutComponents } from './components.js';
import { ENDS, FRAMES, after, perEffect, tween, type EffectContext, type FrameOp } from './effects.js';
import type { ComponentSpec, LocalizedSceneSpec, SceneSpec, TrackSpec } from './scene-schema.js';

export type { FrameOp } from './effects.js';
export { layoutComponents, registerLogo, renderComponent } from './components.js';

/** Fills {{key}} placeholders in every string of the spec from `strings`. Unknown keys stay visible as [key]. */
export function localizeScene<T>(spec: T, strings: Record<string, string>): T {
  const fill = (s: string) => s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k: string) => strings[k] ?? `[${k}]`);
  const walk = (v: unknown): unknown =>
    typeof v === 'string' ? fill(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)])) : v;
  return walk(spec) as T;
}

/** Every {{key}} the spec uses (for validation: each must exist in every locale's strings). */
export function sceneKeys(spec: unknown): string[] {
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) keys.add(m[1]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(spec);
  return [...keys];
}

const EFFECTS: ReadonlySet<string> = new Set(Object.keys(FRAMES));

/** Authoring errors, as strings; empty means the spec is usable. */
export function validateScene(spec: SceneSpec): string[] {
  const issues: string[] = [];
  if (!spec.components.length) issues.push('no components');
  const checkComponent = (c: ComponentSpec) => {
    if (!COMPONENT_TYPES.has(c.type)) issues.push(`component ${c.id}: unknown type '${c.type}'`);
    if (c.type === 'group') c.children.forEach(checkComponent);
    if (c.type === 'box') (c.children as ComponentSpec[]).forEach(checkComponent);
  };
  (spec.components as ComponentSpec[]).forEach(checkComponent);
  spec.tracks.forEach((tr, i) => {
    if (tr.kind === 'effect' && !EFFECTS.has(tr.effect)) issues.push(`track ${i}: unknown effect '${(tr as { effect: string }).effect}'`);
  });
  return issues;
}

/** Throws the spec's authoring errors, all of them in one message. */
function assertValid(spec: SceneSpec) {
  const issues = validateScene(spec);
  if (issues.length) throw new Error(issues.join('; '));
}

/** Every style op the spec produces at time t. Pure: the same (spec, t) always gives the same ops. */
export function evaluateScene(spec: SceneSpec, t: number, opts: { locale?: string } = {}): FrameOp[] {
  assertValid(spec);
  const ctx: EffectContext = { spec, locale: opts.locale ?? 'en-US' };
  return spec.tracks.flatMap((tr: TrackSpec) => (tr.kind === 'tween' ? tween(tr, t) : perEffect(FRAMES, tr, t, ctx)!));
}

/** When the scene's motion is over: the latest time any track still moves, with the same defaults evaluateScene
 *  uses (keep the two together). Background motion is left out: the closing mark's breathing (it never stops) and
 *  the camera push (a slow drift sized to fill the scene, fine to cut away from). Pass a localised spec: word counts
 *  set when text arrives. Scene seconds. */
export function motionEnd(spec: SceneSpec): number {
  const ctx: EffectContext = { spec, locale: 'en-US' };
  const end = (tr: TrackSpec): number =>
    tr.kind === 'tween' ? tr.t1 + after(tr.count, tr.stagger) : perEffect(ENDS, tr, 0, ctx)!;
  return spec.tracks.reduce((m, tr) => Math.max(m, end(tr)), 0);
}

// ── Mount (thin DOM layer; Playwright's coverage, not unit) ───────────────────────────────

/** Appends a <style> with `css` to `host` (nothing for no CSS). */
function addStyle(host: HTMLElement, css: string | undefined) {
  if (!css) return;
  const st = document.createElement('style');
  st.textContent = css;
  host.appendChild(st);
}

// W.portrait (shared.js), ported to the mount host: lift hoisted words out, frame the crop band.
function applyPortrait(host: HTMLElement, ground: HTMLElement, spec: NonNullable<SceneSpec['portrait']>, PW: number) {
  const lifted = spec.hoist.flatMap((s) => [...ground.querySelectorAll(s)]);
  const inner = document.createElement('div');
  inner.className = 'pt-inner';
  [...ground.children].forEach((el) => { if (!lifted.includes(el)) inner.appendChild(el); });
  const [fy, fh] = spec.frame, [cx, cy, cw, ch] = spec.crop;
  const s = Math.min(PW / cw, fh / ch);
  const frame = document.createElement('div');
  frame.className = 'pt-frame';
  frame.style.cssText = `position:absolute;left:0;top:${fy}px;width:${PW}px;height:${fh}px;overflow:hidden`;
  inner.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;transform:translate(' +
    `${((PW - cw * s) / 2 - cx * s).toFixed(1)}px,${((fh - ch * s) / 2 - cy * s).toFixed(1)}px) scale(${s.toFixed(4)})`;
  frame.appendChild(inner);
  ground.appendChild(frame);
  lifted.forEach((el) => ground.appendChild(el));
  addStyle(host, spec.css);
}

/** The spec's extra CSS for `locale`, else for its language (es-MX, then es). */
function localeCss(raw: LocalizedSceneSpec, locale: string | undefined) {
  if (!locale) return undefined;
  return raw.locales?.[locale]?.css ?? raw.locales?.[locale.split('-')[0]]?.css;
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Writes one evaluated op to its element, if the element exists. */
function applyOp(host: HTMLElement, o: FrameOp) {
  const el = host.querySelectorAll(o.selector)[o.index] as HTMLElement | SVGElement | undefined;
  if (!el) return;
  if (o.text !== undefined) el.textContent = o.text;
  for (const [k, v] of Object.entries(o.style ?? {})) (el as HTMLElement).style.setProperty(kebab(k), v);
  for (const c of o.classes?.add ?? []) el.classList.add(c);
  for (const c of o.classes?.remove ?? []) el.classList.remove(c);
  for (const [k, v] of Object.entries(o.attrs ?? {})) el.setAttribute(k, v);
}

/** Build the spec's DOM once; render(t) applies the evaluated ops. Missing targets are skipped.
 *  `strings` fills {{key}} placeholders; `locale` picks the spec's per-locale CSS and number format; `dir` sets the
 *  text direction (rtl languages). */
export function mountJsonScene(host: HTMLElement, raw: LocalizedSceneSpec, opts: { W: number; H: number; locale?: string; strings?: Record<string, string>; dir?: 'ltr' | 'rtl' }) {
  const spec = opts.strings ? localizeScene(raw, opts.strings) : raw;
  assertValid(spec);
  host.innerHTML = '';
  const laid = layoutComponents(spec.components);
  const ground = document.createElement('div');
  ground.className = 'ground';
  ground.innerHTML = `<div class="cam json-cam">${laid.cam}</div>${laid.ground}`;
  host.appendChild(ground);
  addStyle(host, spec.css);
  if (spec.portrait && opts.H > opts.W) applyPortrait(host, ground, spec.portrait, opts.W);
  addStyle(host, localeCss(raw, opts.locale));
  if (opts.dir) host.setAttribute('dir', opts.dir);
  return {
    render(t: number) {
      for (const o of evaluateScene(spec, t, { locale: opts.locale })) applyOp(host, o);
    },
    destroy() { host.innerHTML = ''; },
  };
}
