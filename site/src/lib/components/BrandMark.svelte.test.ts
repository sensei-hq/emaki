import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import BrandMark from './BrandMark.svelte';
import logo from '../../../../emaki.svg?raw';

test('is the emaki logo, drawn in the text colour so it follows light and dark', async () => {
	const screen = await render(BrandMark, { class: 'h-7 w-7' });
	const svg = screen.container.querySelector('svg')!;
	expect(svg.getAttribute('viewBox')).toBe('0 0 512 512');
	const d = (s: string) => [...s.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
	expect(d(svg.outerHTML)).toEqual(d(logo));
	const fills = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
	expect(fills.every((f) => f === 'currentColor')).toBe(true);
	expect(svg.getAttribute('aria-hidden')).toBe('true');
});
