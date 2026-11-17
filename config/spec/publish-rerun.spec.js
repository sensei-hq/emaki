// A release that stopped halfway is re-run, and the re-run skips what is already on npm. A skipped package is not built
// by its own publish, so every package is built first, or a wrapper compiled against a skipped core fails (TS2307).
// And a package that fails to publish fails the run, so a partial release never looks green.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/publish.yml', 'utf-8')
const script = readFileSync('config/publish-all.sh', 'utf-8')
const publishStep = workflow.slice(workflow.indexOf('- name: Publish packages'))

describe('a re-run release', () => {
	it('publish.yml builds every package before the publish loop', () => {
		const build = workflow.indexOf('run: bun run build:all')
		expect(build).toBeGreaterThan(-1)
		expect(build).toBeLessThan(workflow.indexOf('- name: Publish packages'))
	})
	it('publish.yml fails the job when a package did not publish, after trying the rest', () => {
		expect(publishStep).not.toMatch(/::warning::Failed to publish/)
		expect(publishStep).toMatch(/failed\+=\("\$\{PKG_NAME\}"\)/)
		expect(publishStep).toMatch(/::error::Not published: .*\n\s*exit 1/)
	})
	it('publish-all.sh builds every package before the publish loop', () => {
		const build = script.indexOf('bun run build:all')
		expect(build).toBeGreaterThan(-1)
		expect(build).toBeLessThan(script.indexOf('for d in'))
	})
})
