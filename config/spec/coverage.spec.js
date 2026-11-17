// `bun run coverage` runs every spec project once with V8 coverage over the packages' sources and prints the table.
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
})
