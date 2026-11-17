// What CI runs and when: the poster (python, standard library only) has its own unit tests, which CI runs on every
// push and PR; and the publish workflow makes the GitHub release only for a tag (a re-run dispatched on a branch
// publishes what is missing and has no tag to release).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const check = readFileSync('.github/workflows/check.yml', 'utf-8')
const publish = readFileSync('.github/workflows/publish.yml', 'utf-8')
/** The YAML of the step named `name`, up to the next step. */
const step = (yml, name) => {
	const from = yml.indexOf(`- name: ${name}`)
	if (from < 0) return ''
	const next = yml.indexOf('\n      - ', from + 1)
	return yml.slice(from, next < 0 ? undefined : next)
}

describe('check.yml', () => {
	it('runs the poster\'s python tests', () => {
		expect(step(check, 'Poster (python)')).toContain("python3 -B -m unittest discover -s packages/emaki-posting/spec -p 'test_*.py'")
	})
})

describe('publish.yml', () => {
	it('creates the GitHub release only when the run is for a tag', () => {
		expect(step(publish, 'Create GitHub release')).toMatch(/if: startsWith\(github\.ref, 'refs\/tags\/'\)/)
	})
})
