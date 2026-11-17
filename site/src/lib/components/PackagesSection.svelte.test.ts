import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import PackagesSection from './PackagesSection.svelte';
import { packages } from '$lib/data';

test('links every package to npm', async () => {
	const screen = await render(PackagesSection);
	for (const p of packages.items) await expect.element(screen.getByRole('link', { name: p.name, exact: true })).toHaveAttribute('href', `https://www.npmjs.com/package/${p.name}`);
	expect(packages.items).toHaveLength(6);
});
