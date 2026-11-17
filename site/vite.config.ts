import { sveltekit } from '@sveltejs/kit/vite';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { readFileSync } from 'node:fs';

// One version for everything: the footer shows the release from the root package.json (`bun run bump`).
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(version) },
	plugins: [UnoCSS(), sveltekit()],
	// Pre-bundle up front: in browser tests Vite otherwise discovers these mid-run and re-optimizes, and the test that
	// triggered it loads a second module graph (Svelte fails with "reading 'nodes'"). CI always starts cold.
	optimizeDeps: {
		include: ['@rokkit/ui', '@rokkit/app', '@rokkit/states', '@rokkit/actions', '@senseihq/emaki', '@senseihq/emaki-svelte', 'marked']
	},
	test: {
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
					include: ['src/**/*.svelte.{test,spec}.ts'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.ts']
				}
			}
		]
	}
});
