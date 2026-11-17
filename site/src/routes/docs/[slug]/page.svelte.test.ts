import { render } from 'vitest-browser-svelte';
import { expect, test, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { url: new URL('https://emaki.sensei-hq.com/docs/content-model') } }));

import Doc from './+page.svelte';
import { pages } from '$lib/docs';

test('renders the page with the sidebar marking it current, and links to its neighbours', async () => {
	const i = pages.findIndex((p) => p.slug === 'content-model');
	const screen = await render(Doc, { data: { slug: 'content-model' } });
	await expect.element(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
	await expect.element(screen.getByRole('link', { name: pages[i].title, exact: true })).toHaveAttribute('aria-current', 'page');
	await expect.element(screen.getByRole('link', { name: `← ${pages[i - 1].title}` })).toBeInTheDocument();
	await expect.element(screen.getByRole('link', { name: `${pages[i + 1].title} →` })).toBeInTheDocument();
});
