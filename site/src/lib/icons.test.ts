// The site's icons come from the emaki logo (emaki.svg at the repo root): the tab icon (favicon.svg, following the
// OS into dark mode, plus favicon.ico for browsers without SVG icons), the home-screen icons and the web manifest.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OG_IMAGE } from './seo';

const root = new URL('../../', import.meta.url);
const file = (p: string) => new URL(p, root);
const read = (p: string) => readFileSync(file(p));
const logo = readFileSync(new URL('../emaki.svg', root), 'utf-8');
const firstPath = logo.match(/<path d="([^"]{40})/)![1];

/** Width and height of a PNG, from its IHDR chunk. */
const pngSize = (b: Buffer) => (b.subarray(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null);

describe('icons', () => {
	it('favicon.svg is the emaki logo, and turns light when the OS is dark', () => {
		const svg = read('static/favicon.svg').toString();
		expect(svg).toContain(firstPath);
		expect(svg).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
	});

	it('favicon.ico carries 16, 32 and 48 px images', () => {
		const b = read('static/favicon.ico');
		expect([b.readUInt16LE(0), b.readUInt16LE(2)]).toEqual([0, 1]);
		const sizes = Array.from({ length: b.readUInt16LE(4) }, (_, i) => b[6 + i * 16] || 256);
		expect(sizes.sort((x, y) => x - y)).toEqual([16, 32, 48]);
	});

	it('the web manifest names the app and lists icons that exist at the sizes it claims', () => {
		const m = JSON.parse(read('static/site.webmanifest').toString());
		expect(m).toMatchObject({ name: 'emaki', short_name: 'emaki', start_url: '/', display: 'standalone' });
		expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
		expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
		for (const icon of m.icons) {
			const src = icon.src.replace(/^\//, '');
			expect(existsSync(file(`static/${src}`)), src).toBe(true);
			const [w, h] = pngSize(read(`static/${src}`))!;
			expect(`${w}x${h}`).toBe(icon.sizes);
		}
		const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
		expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
		expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
	});

	it('the apple touch icon is 180 px', () => {
		expect(pngSize(read('static/apple-touch-icon.png'))).toEqual([180, 180]);
	});

	it('app.html links every icon and the manifest', () => {
		const html = read('src/app.html').toString();
		for (const tag of [
			'<link rel="icon" href="%sveltekit.assets%/favicon.ico" sizes="48x48" />',
			'<link rel="icon" href="%sveltekit.assets%/favicon.svg" type="image/svg+xml" />',
			'<link rel="apple-touch-icon" href="%sveltekit.assets%/apple-touch-icon.png" />',
			'<link rel="manifest" href="%sveltekit.assets%/site.webmanifest" />'
		])
			expect(html).toContain(tag);
	});

	it('the share image is a raster icon (social cards do not render SVG)', () => {
		expect(OG_IMAGE).toMatch(/\/icon-512\.png$/);
		expect(existsSync(file('static/icon-512.png'))).toBe(true);
	});
});
