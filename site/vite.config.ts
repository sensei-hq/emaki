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
