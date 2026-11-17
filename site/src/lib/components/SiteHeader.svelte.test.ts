import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { expect, test } from 'vitest';
import SiteHeader from './SiteHeader.svelte';
import { brand, nav } from '$lib/data';

test('links home, every nav section and the call to action', async () => {
	// The nav and the call to action show from md up; on a phone they are display:none (out of the a11y tree).
	await page.viewport(1280, 800);
	const screen = await render(SiteHeader);
	await expect.element(screen.getByRole('link', { name: brand.name })).toHaveAttribute('href', '/#top');
	for (const l of nav.links) await expect.element(screen.getByRole('link', { name: l.label, exact: true })).toHaveAttribute('href', l.href);
	await expect.element(screen.getByRole('link', { name: nav.cta.label })).toHaveAttribute('href', nav.cta.href);
});

test('has a theme switch', async () => {
	const screen = await render(SiteHeader);
	await expect.element(screen.getByRole('button').first()).toBeInTheDocument();
});
