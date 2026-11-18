// How the site deploys: Workers Builds runs `wrangler deploy -c site/wrangler.jsonc` for main and
// `wrangler preview -c site/wrangler.jsonc` for every other branch. The preview command refuses a config without a
// `previews` block (it may be empty), so every pull request's build would fail without one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const jsonc = (text: string) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const config = jsonc(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf-8'));

describe('wrangler.jsonc', () => {
	it('names the emaki Worker and serves the adapter-cloudflare output', () => {
		expect(config.name).toBe('emaki');
		expect(config.main).toBe('.svelte-kit/cloudflare/_worker.js');
		expect(config.assets.directory).toBe('.svelte-kit/cloudflare');
	});

	it('has a previews block, so wrangler preview can build a pull request', () => {
		expect(config.previews).toEqual({});
	});
});
