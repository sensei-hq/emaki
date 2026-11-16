import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import UsageSection from './UsageSection.svelte';
import { usage } from '$lib/data';

test('shows each framework’s code when its tab is picked', async () => {
	const screen = await render(UsageSection);
	for (const t of usage.tabs) {
		await screen.getByRole('tab', { name: t.label }).click();
		await expect.element(screen.getByRole('tab', { name: t.label })).toHaveAttribute('aria-selected', 'true');
		expect(document.querySelector('#usage pre')?.textContent).toBe(t.code);
	}
});
