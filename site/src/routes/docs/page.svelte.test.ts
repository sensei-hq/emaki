import { render } from 'vitest-browser-svelte';
import { expect, test, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { url: new URL('https://emaki.sensei-hq.com/docs') } }));

import Docs from './+page.svelte';
import { pages } from '$lib/docs';

test('links every docs page, grouped into guides and packages', async () => {
	const screen = await render(Docs);
	for (const p of pages) await expect.element(screen.getByRole('link', { name: new RegExp(p.title) })).toHaveAttribute('href', `/docs/${p.slug}`);
	await expect.element(screen.getByRole('heading', { name: 'Guides' })).toBeInTheDocument();
	await expect.element(screen.getByRole('heading', { name: 'Packages' })).toBeInTheDocument();
});
