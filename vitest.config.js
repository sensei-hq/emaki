import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			{ test: { name: 'config', include: ['config/spec/**/*.spec.js'], environment: 'node' } },
			{ test: { name: 'emaki', include: ['packages/emaki/spec/**/*.spec.ts'], environment: 'jsdom' } },
			{ test: { name: 'posting', include: ['packages/emaki-posting/spec/**/*.spec.ts'], environment: 'node' } },
			{ test: { name: 'cli', include: ['packages/emaki-cli/spec/**/*.spec.js'], environment: 'node' } }
		]
	}
})
