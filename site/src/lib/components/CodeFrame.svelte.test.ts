import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import CodeFrame from './CodeFrame.svelte';

test('shows a file’s code under its name, with a copy button', async () => {
	const screen = await render(CodeFrame, { filename: 'terminal', code: 'npx @senseihq/emaki-cli init' });
	await expect.element(screen.getByText('terminal')).toBeInTheDocument();
	await expect.element(screen.getByText('npx @senseihq/emaki-cli init')).toBeInTheDocument();
	await expect.element(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeInTheDocument();
});
