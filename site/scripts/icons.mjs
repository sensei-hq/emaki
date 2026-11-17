// The site's icons from the emaki logo (emaki.svg at the repo root, a one-colour 512x512 mark). Run after the logo
// changes: `bun run icons`. Writes into static/:
//   favicon.svg           the mark, near-black, turning paper-light when the OS is dark (tabs follow the OS)
//   favicon.ico           16, 32 and 48 px on a paper tile, for browsers without SVG icons
//   apple-touch-icon.png  180 px, full paper square (iOS rounds it)
//   icon-192.png, icon-512.png   manifest icons; icon-512 is also the social share image
//   icon-maskable-512.png the mark inside the safe zone (a circle of 40% radius), for launchers that crop to a circle or squircle
//   site.webmanifest
// PNGs are drawn by Chromium (Playwright, already here for the browser tests), so no image tools are needed.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const here = (p) => new URL(p, import.meta.url);
const logo = readFileSync(here('../../emaki.svg'), 'utf-8');
const paths = [...logo.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0].replace(/\s+fill="[^"]*"/g, '')).join('');
if (!paths) throw new Error('emaki.svg has no <path> elements');
const INK = logo.match(/fill="(#[0-9a-fA-F]{6})"/)?.[1] ?? '#100F0D';
const ACCENT = '#C25237'; // the brand accent (theme-color in app.html)
const browser = await chromium.launch();
const page = await browser.newPage();
// The logo's 512 box leaves a wide margin; the icons use a square cropped to the artwork (6 units clear).
await page.setContent(logo);
const box = await page.evaluate(() => { const r = document.querySelector('svg').getBBox(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const side = Math.ceil(Math.max(box.w, box.h) + 12);
const r1 = (v) => Math.round(v * 10) / 10;
const VIEW = `${r1(box.x + box.w / 2 - side / 2)} ${r1(box.y + box.h / 2 - side / 2)} ${side} ${side}`;
const svg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" fill="${fill}">${paths}</svg>`;
// The site's paper: rokkit's kami 50 (rokkit.config.js), as a hex colour.
const PAPER = await page.evaluate(() => {
	const c = document.createElement('canvas').getContext('2d');
	c.fillStyle = 'oklch(0.978 0.007 80)';
	c.fillRect(0, 0, 1, 1);
	return '#' + [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
});

/** A size x size PNG: the mark on paper, `pad` of the side left clear on each edge, corners rounded by `radius`. */
async function png(size, { pad, radius = 0 }) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<style>html,body{margin:0;background:transparent}
		div{width:${size}px;height:${size}px;box-sizing:border-box;padding:${pad * size}px;background:${PAPER};border-radius:${radius * size}px}
		svg{display:block;width:100%;height:100%}</style><div>${svg(INK)}</div>`);
	return page.screenshot({ omitBackground: true, type: 'png' });
}

const out = (name, data) => { writeFileSync(here(`../static/${name}`), data); console.info(`wrote static/${name}`); };

out('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}"><style>path{fill:${INK}}@media (prefers-color-scheme:dark){path{fill:${PAPER}}}</style>${paths}</svg>\n`);
out('apple-touch-icon.png', await png(180, { pad: 0.08 }));
out('icon-192.png', await png(192, { pad: 0.06 }));
out('icon-512.png', await png(512, { pad: 0.06 }));
out('icon-maskable-512.png', await png(512, { pad: 0.17 }));

// favicon.ico: an icon directory whose entries are PNGs (supported by every browser that still asks for .ico).
const tiles = await Promise.all([16, 32, 48].map(async (s) => [s, await png(s, { pad: 0.04, radius: 0.2 })]));
const head = Buffer.alloc(6 + 16 * tiles.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(tiles.length, 4);
let offset = head.length;
tiles.forEach(([s, data], i) => {
	const e = 6 + i * 16;
	head[e] = s; head[e + 1] = s; head[e + 2] = 0; head[e + 3] = 0;
	head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
	head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
	offset += data.length;
});
out('favicon.ico', Buffer.concat([head, ...tiles.map(([, d]) => d)]));

out('site.webmanifest', JSON.stringify({
	name: 'emaki',
	short_name: 'emaki',
	description: 'Motion stories for articles, players and video.',
	start_url: '/',
	scope: '/',
	display: 'standalone',
	theme_color: ACCENT,
	background_color: PAPER,
	icons: [
		{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
		{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
		{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
	]
}, null, '\t') + '\n');

await browser.close();
