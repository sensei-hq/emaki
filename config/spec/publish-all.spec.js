// config/publish-all.sh, run against stand-in `npm` and `bun` commands: it publishes core-first, skips a version
// already on npm (so a release that stopped halfway can be re-run), and stops at the first package that fails.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

function run({ published = [], failIn = '' } = {}) {
	const bin = mkdtempSync(join(tmpdir(), 'publish-all-'))
	const log = join(bin, 'log')
	writeFileSync(log, '')
	// npm view <name>@<version> version → prints the version only when it is "published".
	writeFileSync(join(bin, 'npm'), `#!/bin/sh\ncase " $PUBLISHED " in *" $2 "*) echo "\${2##*@}";; esac\n`)
	// bun publish → records the package dir; fails in $FAIL_IN.
	writeFileSync(join(bin, 'bun'), `#!/bin/sh\necho "$(basename "$PWD")" >> "${log}"\n[ "$(basename "$PWD")" != "$FAIL_IN" ]\n`)
	for (const f of ['npm', 'bun']) chmodSync(join(bin, f), 0o755)
	const r = spawnSync('sh', ['config/publish-all.sh'], {
		encoding: 'utf-8',
		env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`, PUBLISHED: published.join(' '), FAIL_IN: failIn }
	})
	return { status: r.status, out: r.stdout + r.stderr, published: readFileSync(log, 'utf-8').split('\n').filter(Boolean) }
}

const version = JSON.parse(readFileSync('packages/emaki/package.json', 'utf-8')).version
const ORDER = ['emaki', 'emaki-svelte', 'emaki-react', 'emaki-vue', 'emaki-posting', 'emaki-cli']

describe('publish-all.sh', () => {
	it('publishes every package, core first', () => {
		const r = run()
		expect(r.status, r.out).toBe(0)
		expect(r.published).toEqual(ORDER)
	})
	it('skips versions already on npm, so a half-finished release can be re-run', () => {
		const r = run({ published: ['emaki', 'emaki-svelte', 'emaki-posting', 'emaki-cli'].map((d) => `@senseihq/${d}@${version}`) })
		expect(r.status, r.out).toBe(0)
		expect(r.published).toEqual(['emaki-react', 'emaki-vue'])
		expect(r.out).toContain(`@senseihq/emaki@${version} is already on npm`)
	})
	it('stops at the first package that fails', () => {
		const r = run({ failIn: 'emaki-react' })
		expect(r.status).not.toBe(0)
		expect(r.published).toEqual(['emaki', 'emaki-svelte', 'emaki-react'])
	})
})
