// The Claude plugin's catalog and installer against plugin folders of the spec's own: frontmatter without a block, a
// field or with a literal block; a plugin with no skills, agents or extras; names that are not in the catalog; and the
// lines `emaki plugin install` / `skills add` / `agents add` print for each result.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installAgents, installPlugin, installSkills, listAgents, listSkills, parseFrontmatter } from '../src/api.js'
import { report } from '../src/plugin.js'
import { put, tmp } from './helpers.js'

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined })

describe('plugin frontmatter', () => {
	it('reads nothing from a file without a frontmatter block, or a field it does not have', () => {
		expect(parseFrontmatter('# just a heading\n')).toEqual({ name: '', description: '' })
		expect(parseFrontmatter('---\nname: only\n---\n')).toEqual({ name: 'only', description: '' })
	})

	it('keeps the line breaks of a literal (|) block and folds a folded (>) one', () => {
		expect(parseFrontmatter('---\nname: lit\ndescription: |\n  first\n  second\nother: x\n---\n').description).toBe('first\nsecond')
		expect(parseFrontmatter('---\nname: fold\ndescription: >-\n  first\n  second\n---\n').description).toBe('first second')
	})
})

describe('a plugin folder with nothing in it', () => {
	it('lists no skills and no agents, and installs nothing', () => {
		const dir = tmp(), cwd = tmp()
		expect(listSkills({ dir })).toEqual([])
		expect(listAgents({ dir })).toEqual([])
		expect(installPlugin({ cwd, dir })).toEqual({ skills: [], agents: [], extras: [] })
	})

	it('calls a skill or agent that is not in the catalog unknown, and copies nothing for it', () => {
		const dir = tmp(), cwd = tmp()
		put(dir, 'skills/real/SKILL.md', '---\nname: real\ndescription: A skill.\n---\n')
		put(dir, 'agents/helper.md', '---\nname: helper\ndescription: An agent.\n---\n')
		expect(installSkills(['real', 'ghost'], { cwd, dir })).toEqual([{ name: 'real', status: 'added' }, { name: 'ghost', status: 'unknown' }])
		expect(installAgents(['ghost'], { cwd, dir })).toEqual([{ name: 'ghost', status: 'unknown' }])
	})

	it('installs only the extras the plugin ships', () => {
		const dir = tmp(), cwd = tmp()
		put(dir, 'PLAYBOOK.md', '# Playbook')
		expect(installPlugin({ cwd, dir }).extras).toEqual([{ name: 'PLAYBOOK.md', status: 'added' }])
		expect(installPlugin({ cwd, dir }).extras).toEqual([{ name: 'PLAYBOOK.md', status: 'skipped' }])
	})
})

describe('report', () => {
	it('prints added and skipped results, and an unknown name as an error that fails the command', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => {}), error = vi.spyOn(console, 'error').mockImplementation(() => {})
		report('skill', [{ name: 'a', status: 'added' }, { name: 'b', status: 'skipped' }])
		expect(info.mock.calls.map((c) => c[0])).toEqual(['  added skill a', '  skipped skill b (exists; --force to overwrite)'])
		expect(process.exitCode).toBeUndefined()
		report('agent', [{ name: 'ghost', status: 'unknown' }])
		expect(error.mock.calls.map((c) => c[0])).toEqual(['  unknown agent: ghost'])
		expect(process.exitCode).toBe(1)
	})
})
