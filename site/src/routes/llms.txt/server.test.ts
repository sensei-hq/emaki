import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { GET as FULL } from '../llms-full.txt/+server';
import { pages } from '$lib/docs';
import { SITE_URL } from '$lib/seo';

describe('/llms.txt and /llms-full.txt', () => {
	it('lists every docs page at its absolute URL, as UTF-8 text', async () => {
		const r = GET();
		expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		const body = await r.text();
		expect(body.startsWith('# emaki')).toBe(true);
		for (const p of pages) expect(body).toContain(`${SITE_URL}/docs/${p.slug}`);
		expect(body).toContain('npx @senseihq/emaki-cli init');
	});
	it('concatenates every page in order', async () => {
		const body = await FULL().text();
		let at = -1;
		for (const p of pages) {
			const i = body.indexOf(p.raw);
			expect(i, p.slug).toBeGreaterThan(at);
			at = i;
		}
	});
	it('serves the site from emaki.sensei-hq.com', () => expect(SITE_URL).toBe('https://emaki.sensei-hq.com'));
});
