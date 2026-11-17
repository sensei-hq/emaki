import adapterAuto from '@sveltejs/adapter-auto';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';

// On Cloudflare (CF_PAGES=1, or Workers Builds' WORKERS_CI) build with adapter-cloudflare, which wrangler.jsonc
// deploys; everywhere else adapter-auto picks the target. Every route is prerendered, so the output is static.
const onCloudflare = !!process.env.CF_PAGES || !!process.env.WORKERS_CI;

/** @type {import('@sveltejs/kit').Config} */
export default {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: { adapter: onCloudflare ? adapterCloudflare() : adapterAuto() }
};
