// emaki init, plugin install, skills, agents, manifest, validate, migrate, new: setting a project up and keeping its
// content in shape.
import { project } from '../config.js'
import { manifest, newFilm, validate } from '../films.js'
import { migrate } from '../migrate.js'
import { act, P } from './run.js'

/** The commands that set a project up and check its content. */
export function setupCommands(prog) {
	prog.command('init')
		.describe('Set this project up: sample content, emaki.config.json, the film source and the /show capture route.')
		.option('--framework', 'sveltekit | svelte | react | next | vue | nuxt | vanilla (default: detected)')
		.option('--content', 'Content folder', 'content')
		.option('--no-sample', 'Skip the sample film')
		.option('--plugin', 'Also install the Claude plugin (skills, agents, playbook)', true)
		.action(act(async (o) => {
			const { init } = await import('../init.js')
			const r = init({ framework: o.framework, content: o.content, sample: o.sample !== false })
			console.info(`framework: ${r.framework}`)
			r.wrote.forEach((f) => console.info(`  wrote ${f}`))
			r.kept.forEach((f) => console.info(`  kept ${f} (exists)`))
			if (o.plugin !== false) {
				const { installPlugin, report } = await import('../plugin.js')
				const x = installPlugin()
				report('skill', x.skills); report('agent', x.agents); report('file', x.extras)
			}
			console.info(`\nNext:\n  npm i ${r.packages.join(' ')}\n  npm i -D playwright && npx playwright install chromium   (sheet, render)\n  npx emaki validate && npx emaki tts-check`)
			console.info('Then in Claude: "build our motion stories" (the emaki skill interviews you and plans the work).')
		}))

	prog.command('plugin install')
		.describe('Install the Claude plugin into .claude/: every skill and agent, plus the playbook and templates.')
		.option('--force', 'Overwrite what exists', false)
		.action(act(async (o) => {
			const { installPlugin, report } = await import('../plugin.js')
			const x = installPlugin({ force: o.force })
			report('skill', x.skills); report('agent', x.agents); report('file', x.extras)
		}))

	prog.command('skills [sub]')
		.describe('List the bundled skills, or add some: emaki skills add <name...> | --all')
		.option('--all', 'Every skill', false)
		.option('--force', 'Overwrite', false)
		.action(act(async (sub, o) => {
			const { listSkills, installSkills, report } = await import('../plugin.js')
			if (sub === 'add') return report('skill', installSkills(o.all ? listSkills().map((s) => s.name) : o._, { force: o.force }))
			for (const s of listSkills()) console.info(`${s.name}\n     ${s.description}`)
			console.info('\nInstall with: emaki skills add <name> [...]   (or --all)')
		}))

	prog.command('agents [sub]')
		.describe('List the bundled agents, or add some: emaki agents add <name...> | --all')
		.option('--all', 'Every agent', false)
		.option('--force', 'Overwrite', false)
		.action(act(async (sub, o) => {
			const { listAgents, installAgents, report } = await import('../plugin.js')
			if (sub === 'add') return report('agent', installAgents(o.all ? listAgents().map((a) => a.name) : o._, { force: o.force }))
			for (const a of listAgents()) console.info(`${a.name}\n     ${a.description}`)
			console.info('\nInstall with: emaki agents add <name> [...]   (or --all)')
		}))

	prog.command('manifest')
		.describe('Write content/films/index.json (the fetch loader reads it).')
		.action(act(() => { const r = manifest(P()); console.info(`${r.count} films → ${r.path}`) }))

	prog.command('validate [slug]')
		.describe('Check the contracts: files, scene ids, {{keys}} in every locale, voice lines, story bodies.')
		.action(act((slug) => {
			const r = validate(P(), slug)
			r.lines.forEach((l) => console.info(l))
			console.info(r.problems ? `${r.problems} problem(s)` : 'ok')
			if (r.problems) process.exitCode = 1
		}))

	prog.command('migrate <from>')
		.describe('Move a sensei-hq.com-style site (src/lib/motion, src/lib/content/articles, films/) into content/ and production/. Never overwrites.')
		.option('--locale', 'The locale the site was written in', 'en')
		.action(act((from, o) => {
			const p = P(), r = migrate(p, from, { locale: o.locale })
			r.wrote.forEach((f) => console.info(`  wrote ${f}`))
			if (r.kept.length) console.info(`  kept ${r.kept.length} existing file(s)`)
			const v = validate(project())
			v.lines.forEach((l) => console.info(l))
			console.info(v.problems ? `${v.problems} problem(s) left: fix them, then \`emaki validate\`` : 'migrated; emaki validate: ok')
			if (v.problems) process.exitCode = 1
		}))

	prog.command('new <slug>')
		.describe('Scaffold a story and its film in every locale.')
		.option('--scenes', 'Scene ids, comma separated (close is added last)', 'hook,idea,how')
		.option('--title', 'Film title')
		.option('--date', 'Publish date YYYY-MM-DD (default today)')
		.action(act((slug, o) => {
			const r = newFilm(P(), slug, { scenes: o.scenes, title: o.title, date: o.date })
			console.info(`scaffolded ${r.slug}: ${r.scenes} scenes, ${r.locales} locale(s). Next: write the scenes, then \`emaki sheet ${r.slug}\`.`)
		}))
}
