import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// `bun run coverage`: V8 coverage over the packages' sources (specs, builds and type files left out).
		coverage: {
			provider: 'v8',
			include: ['packages/*/src/**/*.{ts,js}'],
			exclude: ['**/*.d.ts'],
			reporter: ['text', 'html', 'json-summary'],
			reportsDirectory: 'coverage'
		},
		projects: [
			{ test: { name: 'config', include: ['config/spec/**/*.spec.js'], environment: 'node' } },
			{ test: { name: 'emaki', include: ['packages/emaki/spec/**/*.spec.ts'], environment: 'jsdom' } },
			{ test: { name: 'posting', include: ['packages/emaki-posting/spec/**/*.spec.ts'], environment: 'node' } },
			{ test: { name: 'cli', include: ['packages/emaki-cli/spec/**/*.spec.js'], environment: 'node' } },
			{ test: { name: 'react', include: ['packages/emaki-react/spec/**/*.spec.ts'], environment: 'jsdom' } },
			{ test: { name: 'vue', include: ['packages/emaki-vue/spec/**/*.spec.ts'], environment: 'jsdom' } },
			// Runes need the compiler (components and *.svelte.ts modules, specs included) and Svelte's browser build. Rooted
			// in the package, so the plugin's deduped `svelte` resolves to the package's own.
			{
				root: 'packages/emaki-svelte',
				plugins: [svelte({ configFile: false })],
				resolve: { conditions: ['browser'] },
				test: { name: 'svelte', include: ['spec/**/*.spec.ts'], environment: 'jsdom' }
			}
		]
	}
})
