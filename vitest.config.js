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
			{ test: { name: 'cli', include: ['packages/emaki-cli/spec/**/*.spec.js'], environment: 'node' } }
		]
	}
})
