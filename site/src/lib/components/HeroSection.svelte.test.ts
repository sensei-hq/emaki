import { render } from 'vitest-browser-svelte';
import { expect, test, vi } from 'vitest';
import HeroSection from './HeroSection.svelte';
import { hero } from '$lib/data';
import { startMotion } from '$lib/emaki';

startMotion();
const stage = () => document.querySelector<HTMLElement>('[data-testid="hero-film"] .ms-stage')?.shadowRoot?.querySelector<HTMLElement>('#stage');

test('renders the title, lede and both calls to action', async () => {
	const screen = await render(HeroSection);
	await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent(hero.title);
	await expect.element(screen.getByText(hero.lede)).toBeInTheDocument();
	await expect.element(screen.getByRole('link', { name: hero.primaryCta.label })).toHaveAttribute('href', hero.primaryCta.href);
	await expect.element(screen.getByRole('link', { name: hero.secondaryCta.label })).toHaveAttribute('href', hero.secondaryCta.href);
});

test('plays the sample film live, following the page into dark mode', async () => {
	document.documentElement.dataset.mode = 'light';
	await render(HeroSection);
	await vi.waitFor(() => expect(stage()?.dataset.mode).toBe('light'), { timeout: 10000 });
	document.documentElement.dataset.mode = 'dark';
	await vi.waitFor(() => expect(stage()?.dataset.mode).toBe('dark'));
	document.documentElement.dataset.mode = 'light';
});
