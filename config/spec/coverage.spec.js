// `bun run coverage` runs every spec project once with V8 coverage over the packages' sources and prints the table;
// below 100% it fails, and CI runs it.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../../vitest.config.js'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))

describe('coverage', () => {
	it('has a root script', () => expect(pkg.scripts.coverage).toBe('vitest run --coverage'))
	it('uses the V8 provider at the vitest version it runs with', () => {
		const want = readFileSync('node_modules/vitest/package.json', 'utf-8').match(/"version": "([^"]+)"/)[1]
		expect(pkg.devDependencies['@vitest/coverage-v8']).toBe(want)
	})
	it('measures the packages\' sources, not their specs or builds, and prints a text summary', () => {
		const c = config.test.coverage
		expect(c.provider).toBe('v8')
		expect(c.include).toEqual(['packages/*/src/**/*.{ts,js}'])
		expect(c.reporter).toEqual(expect.arrayContaining(['text', 'html']))
	})
	it('fails below 100% of lines, branches, functions and statements', () => {
		expect(config.test.coverage.thresholds).toEqual({ lines: 100, branches: 100, functions: 100, statements: 100 })
	})
	it('is the gate CI runs on every push and PR', () => {
		const check = readFileSync('.github/workflows/check.yml', 'utf-8')
		expect(check).toMatch(/- name: Coverage\n\s+run: bun run coverage/)
	})
})
