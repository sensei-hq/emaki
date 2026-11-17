import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import BrandMark from './BrandMark.svelte';
import logo from '../../../../emaki.svg?raw';

test('is the emaki logo, cropped to the artwork, drawn in the text colour so it follows light and dark', async () => {
	const screen = await render(BrandMark, { class: 'h-7 w-7' });
	const svg = screen.container.querySelector('svg')!;
	// Cropped to the artwork (the logo's 512 box has a wide margin): at most 6 units clear on any side.
	const [x, y, w, h] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
	const b = svg.getBBox();
	expect(x).toBeLessThanOrEqual(b.x); expect(y).toBeLessThanOrEqual(b.y);
	expect(x + w).toBeGreaterThanOrEqual(b.x + b.width); expect(y + h).toBeGreaterThanOrEqual(b.y + b.height);
	expect(Math.max(b.x - x, b.y - y, x + w - b.x - b.width, y + h - b.y - b.height)).toBeLessThanOrEqual(6);
	const d = (s: string) => [...s.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
	expect(d(svg.outerHTML)).toEqual(d(logo));
	const fills = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
	expect(fills.every((f) => f === 'currentColor')).toBe(true);
	expect(svg.getAttribute('aria-hidden')).toBe('true');
});
