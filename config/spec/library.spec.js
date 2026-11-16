// sensei.library.json must describe what this repo actually ships: every public package, every bundled skill and
// agent at the path it names, and the docs index.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const lib = JSON.parse(readFileSync('sensei.library.json', 'utf-8'))
const pkgs = readdirSync('packages').map((d) => JSON.parse(readFileSync(`packages/${d}/package.json`, 'utf-8'))).filter((p) => !p.private)

describe('sensei.library.json', () => {
	it('has the required identity and a tag ref', () => {
		expect(lib.library).toBe('emaki')
		expect(lib.ecosystem).toBe('npm')
		expect(lib.ref).toMatch(/^v\d+\.\d+\.\d+/)
	})
	it('lists exactly the public packages', () => expect([...lib.packages].sort()).toEqual(pkgs.map((p) => p.name).sort()))
	it('points at skills, agents and docs that exist', () => {
		for (const x of [...lib.skills, ...lib.agents]) expect(existsSync(x.path), x.path).toBe(true)
		const shipped = readdirSync('packages/emaki-cli/plugin/skills')
		expect(lib.skills.map((s) => s.name).sort()).toEqual(shipped.sort())
		expect(existsSync(`${lib.llms.path}/index.txt`)).toBe(true)
	})
})
