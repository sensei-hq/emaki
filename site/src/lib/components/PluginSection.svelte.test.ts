import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import PluginSection from './PluginSection.svelte';
import { plugin } from '$lib/data';

test('lists the plugin’s skills and agents', async () => {
	const screen = await render(PluginSection);
	for (const s of plugin.skills) await expect.element(screen.getByText(s.body)).toBeInTheDocument();
	for (const a of plugin.agents) await expect.element(screen.getByText(a, { exact: true })).toBeInTheDocument();
});
