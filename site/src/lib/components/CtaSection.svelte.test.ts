import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import CtaSection from './CtaSection.svelte';
import { start } from '$lib/data';

test('gives the init command and both next steps', async () => {
	const screen = await render(CtaSection);
	await expect.element(screen.getByText(start.code)).toBeInTheDocument();
	await expect.element(screen.getByRole('link', { name: start.primaryCta.label })).toHaveAttribute('href', start.primaryCta.href);
	await expect.element(screen.getByRole('link', { name: start.secondaryCta.label })).toHaveAttribute('href', start.secondaryCta.href);
});
