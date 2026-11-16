import { render } from 'vitest-browser-svelte';
import { expect, test, vi } from 'vitest';
import ShowcaseSection from './ShowcaseSection.svelte';
import { showcase } from '$lib/data';
import { startMotion } from '$lib/emaki';

startMotion();
const stage = () => document.querySelector<HTMLElement>('[data-testid="showcase-scene"] .motion-scene > div')?.shadowRoot?.querySelector<HTMLElement>('#stage');

test('switches the scene between light and dark', async () => {
	document.documentElement.dataset.mode = 'light';
	const screen = await render(ShowcaseSection);
	await vi.waitFor(() => expect(stage()?.dataset.mode).toBe('light'), { timeout: 10000 });
	await screen.getByRole('radio', { name: 'Dark' }).click();
	await vi.waitFor(() => expect(stage()?.dataset.mode).toBe('dark'));
	await screen.getByRole('radio', { name: 'Light' }).click();
	await vi.waitFor(() => expect(stage()?.dataset.mode).toBe('light'));
});

test('redraws the scene in another language', async () => {
	const screen = await render(ShowcaseSection);
	await vi.waitFor(() => expect(stage()?.lang).toBe('en'), { timeout: 10000 });
	await screen.getByRole('radio', { name: 'Español' }).click();
	await vi.waitFor(() => expect(stage()?.lang).toBe('es'));
});

test('offers every language and mode it names', async () => {
	const screen = await render(ShowcaseSection);
	for (const x of [...showcase.locales, ...showcase.modes]) await expect.element(screen.getByRole('radio', { name: x.label })).toBeInTheDocument();
});
