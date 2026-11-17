// The `emaki` executable (src/index.js) loaded in this process: it names the package's version, and registers the
// command groups in the order --help lists them (set-up, production, posting, campaign).
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json' with { type: 'json' }

const argv = process.argv
afterEach(() => { process.argv = argv; vi.restoreAllMocks(); vi.resetModules() })

/** Loads index.js afresh as `emaki ...args` and returns what it printed. */
async function run(...args) {
	const out = []
	vi.spyOn(console, 'log').mockImplementation((...a) => out.push(a.join(' ')))
	process.argv = ['node', 'emaki', ...args]
	await import('../src/index.js')
	return out.join('\n')
}

describe('the emaki executable', () => {
	it('prints the package version', async () => {
		expect(await run('--version')).toBe(`emaki, ${pkg.version}`)
	})

	it('lists the command groups in order: set-up, production, posting, campaign', async () => {
		const help = await run('--help')
		const lines = help.split('\n').map((l) => l.trim())
		const at = (c) => lines.findIndex((l) => l.startsWith(`${c} `))
		const order = ['init', 'validate', 'sheet', 'build', 'stage', 'publish', 'carousel', 'campaign status', 'campaign calendar'].map(at)
		expect(order.every((n) => n >= 0)).toBe(true)
		expect([...order].sort((a, b) => a - b)).toEqual(order)
	})
})
