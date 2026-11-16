// Mounting one scene of a film into a host element, in its own shadow root (so film CSS and page CSS never meet),
// in one of three layouts: landscape (16:9 show and video), portrait (9:16 show and video) and figure (the article
// illustration: the scene's artwork only, its words left to the article). JSON scenes are preferred; a scene written
// as code (scene-<id>.js) is the escape hatch and runs in a sandboxed per-mount `window`.
import { createKit, type Kit, type SceneDef } from './kit.js';
import { mountJsonScene } from './renderer.js';
import { getSource, warp } from './registry.js';
import { dirOf, fallbackChain, mergeChain } from './i18n.js';
import type { PortraitSpec } from './scene-schema.js';
import { SIZES, type FilmMeta, type Layout, type Mode, type Mounted } from './types.js';

/** Fonts, as CSS variables the scenes use. Override with setFontStack() to match your brand. */
let fontStack = "--display:'Fraunces',Georgia,serif;--sans:'Inter',system-ui,sans-serif;--serif:'Noto Serif JP','Fraunces',serif;--mono:'JetBrains Mono',ui-monospace,monospace;";
export function setFontStack(cssVars: string) { fontStack = cssVars; }

/** The film's scene text for `locale`, merged along its fallback chain (fr-CA → fr → default). */
export async function filmStrings(slug: string, locale: string) {
  const src = getSource();
  if (!src.strings) return {};
  const chain = fallbackChain(locale);
  return mergeChain(await Promise.all(chain.map((l) => src.strings!(slug, l))));
}

/** Figure layout: the artwork only, framed on the region the scene marks as art (portrait.crop). */
function figureLayout(stage: HTMLElement, W: number, H: number, spec: PortraitSpec) {
  const ground = stage.querySelector<HTMLElement>('.ground');
  if (!ground) return;
  const lifted = (spec.hoist ?? []).flatMap((s) => [...ground.querySelectorAll<HTMLElement>(s)]);
  const wordsOnly = spec.frame[1] < 50;
  const inner = document.createElement('div');
  [...ground.children].forEach((el) => { if (!lifted.includes(el as HTMLElement)) inner.appendChild(el); });
  let s = W / 1920, x = 0, y = (H - 1080 * s) / 2;
  if (!wordsOnly) {
    lifted.forEach((el) => (el.style.display = 'none'));
    const [cx, cy, cw, ch] = spec.crop;
    s = Math.min((W * 0.94) / cw, (H * 0.9) / ch);
    x = (W - cw * s) / 2 - cx * s;
    y = (H - ch * s) / 2 - cy * s;
  } else lifted.forEach((el) => inner.appendChild(el));
  inner.style.cssText = `position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(4)})`;
  ground.appendChild(inner);
}

/** Renders scene `sceneId` of film `f` into `host`. Returns a handle: render(t) draws running time t; destroy() clears. */
export async function mountScene(host: HTMLElement, f: FilmMeta, sceneId: string, layout: Layout, opts: { locale?: string; src?: 'json' | 'js'; mode?: Mode } = {}): Promise<Mounted> {
  const src = getSource(), locale = opts.locale ?? 'en';
  const [W, H] = SIZES[layout];
  // The newest mount on a host wins: one that a later mount overtook while loading comes back inert, and a destroy()
  // only clears the host while its own mount is the one showing (two players sharing a host never wipe each other).
  const token = {};
  const owner = host as HTMLElement & { __motionMount?: object };
  owner.__motionMount = token;
  const [look, strings, json] = await Promise.all([src.css(f.slug), filmStrings(f.slug, locale), opts.src === 'js' ? null : src.scene(f.slug, sceneId)]);
  if (owner.__motionMount !== token) return { W, H, dur: f.scenes.find((s) => s.id === sceneId)?.dur ?? 0, stage: document.createElement('div'), render: () => {}, destroy: () => {} };
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = `:host{display:block;position:relative;overflow:hidden}` +
    `#stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;transform-origin:0 0;background:${f.background};${fontStack}-webkit-font-smoothing:antialiased}` + look;
  const stage = document.createElement('div');
  stage.id = 'stage';
  stage.lang = locale;
  root.append(style, stage);
  const meta = f.scenes.find((s) => s.id === sceneId);
  if (!meta) throw new Error(`emaki: ${f.slug} has no scene "${sceneId}"`);
  const destroy = () => { if (owner.__motionMount === token) { root.innerHTML = ''; owner.__motionMount = undefined; } };

  if (json) {
    const m = mountJsonScene(stage, json, { W, H, locale, strings, dir: dirOf(locale) });
    if (layout === 'figure') {
      if (!json.portrait) throw new Error(`emaki: ${f.slug}/scene-${sceneId}.json needs a portrait block for figures`);
      figureLayout(stage, W, H, json.portrait);
    }
    return { W, H, dur: meta.dur, stage, render: (t) => m.render(warp(t, meta.holds)), destroy };
  }

  // The escape hatch: code scenes. shared.js sets window.W helpers; each scene registers with kit.scene(id, def).
  const code = await src.code?.(f.slug);
  if (!code?.scenes[sceneId]) throw new Error(`emaki: ${f.slug} has no scene-${sceneId}.json or .js`);
  const defs: Record<string, SceneDef> = {};
  const kit = createKit({ stage, W, H, onScene: (id, def) => (defs[id] = def), onScore: () => {} });
  (kit as Kit & { t?: (k: string) => string; locale?: string }).t = (k: string) => strings[k] ?? `[${k}]`;
  (kit as Kit & { locale?: string }).locale = locale;
  const win: { W?: Record<string, unknown> } = {};
  new Function('kit', 'window', `with (window) {\n${code.shared}\n}`)(kit, win);
  const helpers = win.W ?? {};
  const portrait = helpers.portrait as ((k: Kit, s: PortraitSpec) => void) | undefined;
  helpers.portrait = (k: Kit, s: PortraitSpec) => {
    if (layout === 'portrait') portrait?.(k, s);
    else if (layout === 'figure') figureLayout(stage, W, H, s);
  };
  new Function('kit', 'window', 'W', code.scenes[sceneId])(kit, win, helpers);
  const def = defs[sceneId];
  if (!def) throw new Error(`emaki: scene-${sceneId}.js did not call kit.scene('${sceneId}', ...)`);
  const inst = Object.create(def) as SceneDef;
  kit.dur = meta.dur;
  stage.setAttribute('dir', dirOf(locale));
  await inst.init?.call(inst, kit);
  return { W, H, dur: meta.dur, stage, render: (t) => inst.render.call(inst, warp(t, meta.holds), kit), destroy };
}

/** Waits for the film's fonts so the first frame is set in the right type. */
export async function fontsReady(f?: FilmMeta) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const families = Object.values(f?.fonts ?? {}).flatMap((x) => (x.weights ?? [400]).map((w) => `${w} 40px "${x.family}"`));
  await Promise.all(families.map((spec) => document.fonts.load(spec, 'Aa').catch(() => [])));
  await document.fonts.ready;
}
