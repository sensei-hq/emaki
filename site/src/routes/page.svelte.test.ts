import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { expect, test, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { url: new URL('https://emaki.sensei-hq.com/') } }));

import Page from './+page.svelte';
import { startMotion } from '$lib/emaki';

startMotion();
const SECTIONS = ['features', 'packages', 'showcase', 'usage', 'plugin', 'start'];
const noOverflow = () => vi.waitFor(() => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth + 1));

test('renders every section without horizontal overflow on a desktop', async () => {
	await page.viewport(1280, 800);
	await render(Page);
	for (const id of SECTIONS) expect(document.querySelector(`#${id}`), id).not.toBeNull();
	await noOverflow();
});

test('does not overflow on a phone either', async () => {
	await page.viewport(414, 896);
	await render(Page);
	await noOverflow();
});
