// The JSON scene's components as markup: ports of the W builders (the catalog test checks them against shared.js),
// one renderer per component type, split into the SVG and HTML layers. Pure string building, no DOM.
import { K } from './effects.js';
import type { BarsSpec, ComponentSpec, HeadSpec, LogoSpec, NodeSpec } from './scene-schema.js';

// W.glyph (shared.js): the tile glyphs, drawn with a stroke style `s` or a fill style `f`. Anything else is a wave.
const GLYPHS: Record<string, (s: string, f: string) => string> = {
  spark: (_s, f) => `<path d="M0 -34 Q4 -4 34 0 Q4 4 0 34 Q-4 4 -34 0 Q-4 -4 0 -34 Z" ${f}/>`,
  brace: (s) => `<path d="M-12 -30 Q-24 -30 -24 -18 V-8 Q-24 0 -32 0 Q-24 0 -24 8 V18 Q-24 30 -12 30 M12 -30 Q24 -30 24 -18 V-8 Q24 0 32 0 Q24 0 24 8 V18 Q24 30 12 30" ${s}/>`,
  ring: (s, f) => `<circle r="26" ${s}/><circle r="9" ${f}/>`,
  tri: (s) => `<path d="M0 -30 L28 22 H-28 Z" ${s}/>`,
  grid: (_s, f) => `<g ${f}><rect x="-28" y="-28" width="22" height="22" rx="5"/><rect x="6" y="-28" width="22" height="22" rx="5"/><rect x="-28" y="6" width="22" height="22" rx="5"/><rect x="6" y="6" width="22" height="22" rx="11"/></g>`,
  db: (s) => `<g ${s}><ellipse cx="0" cy="-20" rx="28" ry="10"/><path d="M-28 -20 V20 Q0 34 28 20 V-20 M-28 0 Q0 14 28 0"/></g>`,
  lock: (s, f) => `<path d="M-16 -6 V-18 Q-16 -32 0 -32 Q16 -32 16 -18 V-6" ${s}/><rect x="-26" y="-6" width="52" height="38" rx="8" ${f}/>`,
  crown: (_s, f) => `<path d="M-30 20 L-30 -18 L-14 0 L0 -26 L14 0 L30 -18 L30 20 Z" ${f}/>`,
  list: (s, f) => `<g ${s}><path d="M-12 -22 H28 M-12 0 H28 M-12 22 H18"/></g><g ${f}><circle cx="-26" cy="-22" r="5"/><circle cx="-26" cy="0" r="5"/><circle cx="-26" cy="22" r="5"/></g>`,
  check: (s) => `<circle r="28" ${s}/><path d="M-13 1 L-3 11 L15 -9" ${s}/>`,
  steps: (s, f) => `<path d="M-30 24 H-10 V6 H10 V-12 H30" ${s}/><circle cx="30" cy="-26" r="6" ${f}/>`,
  doc: (s) => `<path d="M-22 -30 H10 L24 -16 V30 H-22 Z" ${s}/>`,
};
const wave = (s: string) => `<path d="M-30 6 Q-15 -20 0 6 T30 6" ${s}/>`;

function glyph(kind: string, color: string): string {
  const s = `style="fill:none;stroke:${color};stroke-width:9;stroke-linecap:round;stroke-linejoin:round"`;
  const f = `style="fill:${color}"`;
  return Object.hasOwn(GLYPHS, kind) ? GLYPHS[kind](s, f) : wave(s);
}

/** The colour each tone paints with (bars also take 'ink'); anything else falls back. */
const TONES: Record<string, string> = { hot: 'var(--accent)', ok: 'var(--jade)' };
const BAR_TONES: Record<string, string> = { ...TONES, ink: 'var(--main)' };
const toneColor = (tone: string | undefined, palette: Record<string, string>, fallback: string) =>
  (tone !== undefined && Object.hasOwn(palette, tone) ? palette[tone] : fallback);

// W.node (shared.js): a tile centred on (0,0), lit from above.
function node(c: NodeSpec): string {
  const cls = c.id, z = c.size || 156, h = z / 2, band = toneColor(c.tone, TONES, 'var(--main)');
  return '<g class="' + cls + '">' +
    '<rect x="' + -h + '" y="' + (-h + 12) + '" width="' + z + '" height="' + z + '" rx="' + z * 0.19 + '" style="fill:var(--shade)"/>' +
    '<rect x="' + -h + '" y="' + -h + '" width="' + z + '" height="' + z + '" rx="' + z * 0.19 + '" style="fill:var(--tile);stroke:var(--hair);stroke-width:3"/>' +
    '<rect class="' + cls + '-band" x="' + -h * 0.6 + '" y="' + -h + '" width="' + h * 1.2 + '" height="10" rx="5" style="fill:' + band + '"/>' +
    '<g transform="translate(0 4) scale(' + z / 156 + ')">' + glyph(c.kind, c.tone === 'hot' ? 'var(--accent)' : 'var(--main)') + '</g></g>';
}

// W.board (the canonical shared.js): washi paper with a faint dot grid.
const board = (id: string) =>
  `<defs><pattern id="${id}" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="24" cy="24" r="2.4" style="fill:var(--dot)"/></pattern></defs>` +
  `<g class="board"><rect x="-400" y="-300" width="2720" height="1680" fill="url(#${id})"/></g>`;

/** Words as inline-block spans of `cls` (each keeps its trailing space), so word tracks address them by index. */
const wordSpans = (ws: string[], cls: string) =>
  ws.map((w, i) => `<span class="${cls}" style="display:inline-block;white-space:pre">${w}${i < ws.length - 1 ? ' ' : ''}</span>`).join('');

// W.head (shared.js), with the line pre-split into word spans so showHead addresses them by index.
// Text is plain (escaped); words with markup stay in .js scenes until the catalog covers them.
const head = (c: HeadSpec) =>
  `<div class="words ${c.id}" style="${c.style ?? ''}">${c.eyebrow ? `<p class="eyebrow">${K.esc(c.eyebrow)}</p>` : ''}` +
  `<h2 class="line">${wordSpans(K.esc(c.line).split(' '), 'line-word')}</h2>${c.sub ? `<p class="sub">${K.esc(c.sub)}</p>` : ''}</div>`;

// W.wire (shared.js): a quadratic curve from a to b bending through c.
const wire = (id: string, a: [number, number], c: [number, number], b: [number, number], color?: string) =>
  `<path class="${id}" pathLength="1" d="M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}" style="fill:none;stroke:${color || 'var(--wire)'};stroke-width:6;stroke-linecap:round"/>`;

// W.checks (shared.js): a list of ticked rows.
const checks = (id: string, items: string[], style?: string) =>
  `<div class="checks ${id}" style="${style ?? ''}">${items.map((s) => `<div class="chk"><i></i><span>${s}</span></div>`).join('')}</div>`;

// W.bars (shared.js): code lines as rounded bars.
const bars = ({ id, x, y, rows, gap, h }: BarsSpec) =>
  rows.map(([i, w, tone], k) => '<rect class="' + id + '" x="' + (x + i) + '" y="' + (y + k * (gap || 34)) + '" width="' + w + '" height="' + (h || 12) + '" rx="' + (h || 12) / 2 +
    '" style="fill:' + toneColor(tone, BAR_TONES, 'var(--hair)') + '"/>').join('');

// Brand marks: SVG files (viewBox 0 0 512 512) registered by the app at start-up (registerLogo), so the core never
// depends on a bundler feature to find them.
const logos = new Map<string, string>();
/** Registers a mark under `name` for { "type": "logo", "name": ... } components. `svg` is the whole file's text. */
export function registerLogo(name: string, svg: string) { logos.set(name, svg); }

// W.logo (shared.js): the mark drawn inside an SVG at (x, y), centred, size px.
function logo({ id, name, x, y, size }: LogoSpec): string {
  const raw = logos.get(name);
  if (!raw) throw new Error(`unknown logo '${name}': call registerLogo('${name}', svgText) first`);
  const art = raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg class="${id}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 512 512" style="overflow:visible">${art}</svg>`;
}

/** An HTML element of `tag` with the component's class (plus `cls`) and style. */
const element = (c: { id: string; cls?: string; style?: string }, tag: string, body: string) =>
  `<${tag} class="${c.id}${c.cls ? ' ' + c.cls : ''}"${c.style ? ` style="${c.style}"` : ''}>${body}</${tag}>`;

type Layers = { svg: string; html: string };
const svg = (s: string): Layers => ({ svg: s, html: '' });
const html = (h: string): Layers => ({ svg: '', html: h });
type ComponentOf<T extends ComponentSpec['type']> = Extract<ComponentSpec, { type: T }>;

/** Every component type's markup. */
const RENDER: { [T in ComponentSpec['type']]: (c: ComponentOf<T>) => Layers } = {
  board: (c) => svg(board(c.id)),
  node: (c) => svg(c.x !== undefined && c.y !== undefined ? `<g class="${c.id}-pos" transform="translate(${c.x} ${c.y})">${node(c)}</g>` : node(c)),
  wire: (c) => svg(wire(c.id, c.a, c.c, c.b, c.color)),
  bars: (c) => svg(bars(c)),
  logo: (c) => svg(logo(c)),
  head: (c) => html(head(c)),
  checks: (c) => html(checks(c.id, c.items, c.style)),
  group: (c) => svg(`<g class="${c.id}"${c.style ? ` style="${c.style}"` : ''}>${c.children.map((ch) => renderComponent(ch).svg).join('')}</g>`),
  svg: (c) => svg(c.body),
  raw: (c) => html(c.html),
  text: (c) => html(element(c, c.tag ?? 'p', c.html ? c.text : c.split ? wordSpans(K.esc(c.text.trim()).split(/\s+/), `${c.id}-w`) : K.esc(c.text))),
  box: (c) => html(element(c, c.tag ?? 'div', c.children.map((ch) => renderComponent(ch as ComponentSpec).html).join(''))),
};

/** The component types the catalog draws. */
export const COMPONENT_TYPES: ReadonlySet<string> = new Set(Object.keys(RENDER));

/** A component's markup, split into the SVG and HTML layers. Pure; the catalog test pins it. */
export function renderComponent(c: ComponentSpec): { svg: string; html: string } {
  const fn = RENDER[c.type] as ((c: ComponentSpec) => Layers) | undefined;
  return fn?.(c) as Layers;
}

/**
 * Orders components into the camera and the ground, preserving the spec's svg/html interleave
 * order (paint order matters: chart bars paint over their card). Consecutive SVG parts
 * coalesce into one svg.art block, as the scene modules' markup does.
 */
export function layoutComponents(cs: ComponentSpec[]): { cam: string; ground: string } {
  const cam: string[] = [], ground: string[] = [];
  let svgBuf: string[] = [];
  const flush = () => {
    if (svgBuf.length) cam.push(`<svg class="art" viewBox="0 0 1920 1080">${svgBuf.join('')}</svg>`);
    svgBuf = [];
  };
  for (const c of cs) {
    const r = renderComponent(c);
    if (r.svg && !r.html) svgBuf.push(r.svg);
    else { flush(); ((c as { at?: string }).at === 'ground' ? ground : cam).push(r.svg + r.html); }
  }
  flush();
  return { cam: cam.join(''), ground: ground.join('') };
}
