import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import FeaturesSection from './FeaturesSection.svelte';
import { features } from '$lib/data';

test('shows a card for every feature on the dot grid', async () => {
	const screen = await render(FeaturesSection);
	await expect.element(screen.getByRole('heading', { level: 2 })).toHaveTextContent(features.title);
	for (const f of features.items) await expect.element(screen.getByRole('heading', { name: f.title })).toBeInTheDocument();
	const section = document.querySelector('#features')!;
	expect(getComputedStyle(section, '::before').backgroundImage).toContain('radial-gradient');
});
