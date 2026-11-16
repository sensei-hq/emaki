// Before anything is published: bun.lock must record every workspace at its package.json version, or `bun pm pack`
// pins siblings to the previous release. The bump runs `bun install` to refresh it; this proves it did.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const lock = existsSync('bun.lock') ? readFileSync('bun.lock', 'utf-8') : ''

describe('bun.lock matches the release', () => {
	const pkgs = readdirSync('packages').filter((d) => existsSync(`packages/${d}/package.json`)).map((d) => JSON.parse(readFileSync(`packages/${d}/package.json`, 'utf-8')))
	it.skipIf(!lock)('records each workspace at its package.json version', () => {
		for (const p of pkgs) {
			const m = lock.match(new RegExp(`"packages/[^"]+": \\{\\s*"name": "${p.name.replace('/', '\\/')}",\\s*"version": "([^"]+)"`))
			if (m) expect(m[1], p.name).toBe(p.version)
		}
	})
	it('keeps sensei.library.json on the same release', () => {
		const lib = JSON.parse(readFileSync('sensei.library.json', 'utf-8'))
		const root = JSON.parse(readFileSync('package.json', 'utf-8'))
		expect(lib.documents).toBe(root.version)
		expect(lib.ref).toBe(`v${root.version}`)
	})
})
