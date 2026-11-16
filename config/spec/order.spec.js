// Every loop that builds or publishes the packages must visit a package only after the siblings it depends on: a
// wrapper compiled before the core has a dist fails with TS2307, and one published before it points npm at nothing.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scripts = JSON.parse(readFileSync('package.json', 'utf-8')).scripts
const workflow = readFileSync('.github/workflows/publish.yml', 'utf-8')
const pkgs = readdirSync('packages').map((dir) => ({ dir, ...JSON.parse(readFileSync(`packages/${dir}/package.json`, 'utf-8')) }))
const dirOf = Object.fromEntries(pkgs.map((p) => [p.name, p.dir]))
const siblings = (p) => Object.keys({ ...p.dependencies, ...p.devDependencies, ...p.peerDependencies }).filter((n) => dirOf[n])

const loops = {
	'build:all': scripts['build:all'].match(/for d in ([\w -]+); do/)?.[1],
	'publish:all': scripts['publish:all'].match(/for d in ([\w -]+); do/)?.[1],
	'publish.yml': workflow.match(/PACKAGES=\(([\w -]+)\)/)?.[1]
}

describe('package loops run in dependency order', () => {
	for (const [name, list] of Object.entries(loops)) {
		it(`${name} names its packages explicitly`, () => expect(list, name).toBeTruthy())
		it(`${name} covers every public package once, after its siblings`, () => {
			const order = (list ?? '').trim().split(/\s+/)
			expect([...order].sort()).toEqual(pkgs.filter((p) => !p.private).map((p) => p.dir).sort())
			for (const p of pkgs.filter((x) => order.includes(x.dir)))
				for (const dep of siblings(p)) expect(order.indexOf(dirOf[dep]), `${p.dir} after ${dirOf[dep]}`).toBeLessThan(order.indexOf(p.dir))
		})
	}
})
