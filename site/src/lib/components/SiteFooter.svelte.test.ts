import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import SiteFooter from './SiteFooter.svelte';
import { footer, VERSION } from '$lib/data';

test('lists every column link, the legal line and the release', async () => {
	const screen = await render(SiteFooter);
	for (const c of footer.columns) for (const l of c.links) await expect.element(screen.getByRole('link', { name: l.label, exact: true })).toHaveAttribute('href', l.href);
	await expect.element(screen.getByText(footer.legal)).toBeInTheDocument();
	await expect.element(screen.getByText(`v${VERSION}`)).toBeInTheDocument();
});
