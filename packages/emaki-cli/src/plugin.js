// The Claude plugin ships inside this package (plugin/): skills, agents, the playbook and planning templates. These
// commands copy it into a project's .claude/ so Claude Code / Cowork picks it up, the same way @rokkit/cli does.
/* eslint-disable no-console */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_DIR = (() => {
	try {
		return fileURLToPath(new URL('../plugin/', import.meta.url))
	} catch {
		return resolve(process.cwd(), 'packages/emaki-cli/plugin')
	}
})()

/** name + description from a SKILL.md or agent .md frontmatter. */
export function parseFrontmatter(md) {
	const block = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
	const field = (key) => {
		const m = block.match(new RegExp(`^${key}:[ \t]*(.*)$`, 'm'))
		if (!m) return ''
		if (!/^[>|][-+]?$/.test(m[1].trim())) return m[1].trim()
		// A folded (>) or literal (|) block: the indented lines that follow.
		const rest = block.slice(m.index + m[0].length + 1).split('\n')
		const lines = []
		for (const l of rest) { if (l && !/^\s/.test(l)) break; lines.push(l.trim()) }
		return lines.join(m[1].startsWith('|') ? '\n' : ' ').trim()
	}
	return { name: field('name'), description: field('description') }
}

export function listSkills({ dir = PLUGIN_DIR } = {}) {
	const root = join(dir, 'skills')
	if (!existsSync(root)) return []
	return readdirSync(root)
		.filter((e) => existsSync(join(root, e, 'SKILL.md')))
		.map((e) => ({ ...parseFrontmatter(readFileSync(join(root, e, 'SKILL.md'), 'utf-8')), folder: e }))
		.filter((s) => s.name)
		.sort((a, b) => a.name.localeCompare(b.name))
}

export function listAgents({ dir = PLUGIN_DIR } = {}) {
	const root = join(dir, 'agents')
	if (!existsSync(root)) return []
	return readdirSync(root)
		.filter((e) => e.endsWith('.md'))
		.map((e) => ({ ...parseFrontmatter(readFileSync(join(root, e), 'utf-8')), file: e }))
		.filter((a) => a.name)
		.sort((a, b) => a.name.localeCompare(b.name))
}

/** Copies skills into <cwd>/.claude/skills/<name>/ (idempotent unless force). */
export function installSkills(names, { cwd = process.cwd(), force = false, dir = PLUGIN_DIR } = {}) {
	const catalog = new Map(listSkills({ dir }).map((s) => [s.name, s]))
	const target = resolve(cwd, '.claude', 'skills')
	return names.map((name) => {
		const s = catalog.get(name)
		if (!s) return { name, status: 'unknown' }
		const dest = join(target, name)
		if (existsSync(dest) && !force) return { name, status: 'skipped' }
		mkdirSync(target, { recursive: true })
		cpSync(join(dir, 'skills', s.folder), dest, { recursive: true })
		return { name, status: 'added' }
	})
}

/** Copies agents into <cwd>/.claude/agents/<name>.md. */
export function installAgents(names, { cwd = process.cwd(), force = false, dir = PLUGIN_DIR } = {}) {
	const catalog = new Map(listAgents({ dir }).map((a) => [a.name, a]))
	const target = resolve(cwd, '.claude', 'agents')
	return names.map((name) => {
		const a = catalog.get(name)
		if (!a) return { name, status: 'unknown' }
		const dest = join(target, `${name}.md`)
		if (existsSync(dest) && !force) return { name, status: 'skipped' }
		mkdirSync(target, { recursive: true })
		cpSync(join(dir, 'agents', a.file), dest)
		return { name, status: 'added' }
	})
}

/** The whole plugin into the project: every skill and agent, plus the playbook and planning templates under
 *  .claude/emaki/ (the skills read them from there). */
export function installPlugin({ cwd = process.cwd(), force = false, dir = PLUGIN_DIR } = {}) {
	const skills = installSkills(listSkills({ dir }).map((s) => s.name), { cwd, force, dir })
	const agents = installAgents(listAgents({ dir }).map((a) => a.name), { cwd, force, dir })
	const home = resolve(cwd, '.claude', 'emaki')
	const extras = []
	for (const f of ['PLAYBOOK.md', 'README.md', 'templates', 'modules']) {
		const src = join(dir, f), dest = join(home, f)
		if (!existsSync(src)) continue
		if (existsSync(dest) && !force) { extras.push({ name: f, status: 'skipped' }); continue }
		mkdirSync(home, { recursive: true })
		cpSync(src, dest, { recursive: true })
		extras.push({ name: f, status: 'added' })
	}
	return { skills, agents, extras }
}

export function report(kind, results) {
	for (const r of results) {
		if (r.status === 'added') console.info(`  added ${kind} ${r.name}`)
		else if (r.status === 'skipped') console.info(`  skipped ${kind} ${r.name} (exists; --force to overwrite)`)
		else { console.error(`  unknown ${kind}: ${r.name}`); process.exitCode = 1 }
	}
}
