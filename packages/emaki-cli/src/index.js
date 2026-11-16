#!/usr/bin/env node
/* eslint-disable no-console */
// emaki: set a project up for motion stories, install the Claude plugin, and run the production steps
// (validate, sheet, voice, fit, render, build) per film and per locale.
import sade from 'sade'
import pkg from '../package.json' with { type: 'json' }
import { project } from './config.js'
import { manifest, newFilm, validate } from './films.js'
import { migrate } from './migrate.js'
import { MotionError, parseOpts } from './util.js'

const prog = sade('emaki')
prog.version(pkg.version)

/** Runs a command; a MotionError prints its message and exits 1, anything else is a bug and shows its stack. */
const act = (fn) => async (...args) => {
	try {
		await fn(...args)
	} catch (e) {
		if (e instanceof MotionError) {
			console.error(`emaki: ${e.message}`)
			process.exit(1)
		}
		throw e
	}
}
const P = () => project()
const loc = (o, p) => o.locale ?? p.site.defaultLocale

prog.command('init')
	.describe('Set this project up: sample content, emaki.config.json, the film source and the /show capture route.')
	.option('--framework', 'sveltekit | svelte | react | next | vue | nuxt | vanilla (default: detected)')
	.option('--content', 'Content folder', 'content')
	.option('--no-sample', 'Skip the sample film')
	.option('--plugin', 'Also install the Claude plugin (skills, agents, playbook)', true)
	.action(act(async (o) => {
		const { init } = await import('./init.js')
		const r = init({ framework: o.framework, content: o.content, sample: o.sample !== false })
		console.info(`framework: ${r.framework}`)
		r.wrote.forEach((f) => console.info(`  wrote ${f}`))
		r.kept.forEach((f) => console.info(`  kept ${f} (exists)`))
		if (o.plugin !== false) {
			const { installPlugin, report } = await import('./plugin.js')
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
		const { installPlugin, report } = await import('./plugin.js')
		const x = installPlugin({ force: o.force })
		report('skill', x.skills); report('agent', x.agents); report('file', x.extras)
	}))

prog.command('skills [sub]')
	.describe('List the bundled skills, or add some: emaki skills add <name...> | --all')
	.option('--all', 'Every skill', false)
	.option('--force', 'Overwrite', false)
	.action(act(async (sub, o) => {
		const { listSkills, installSkills, report } = await import('./plugin.js')
		if (sub === 'add') return report('skill', installSkills(o.all ? listSkills().map((s) => s.name) : o._, { force: o.force }))
		for (const s of listSkills()) console.info(`${s.name}\n     ${s.description}`)
		console.info('\nInstall with: emaki skills add <name> [...]   (or --all)')
	}))

prog.command('agents [sub]')
	.describe('List the bundled agents, or add some: emaki agents add <name...> | --all')
	.option('--all', 'Every agent', false)
	.option('--force', 'Overwrite', false)
	.action(act(async (sub, o) => {
		const { listAgents, installAgents, report } = await import('./plugin.js')
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

prog.command('sheet <slug>')
	.describe('Contact sheet: each scene\'s final picture in both orientations (needs Playwright).')
	.option('--locale', 'Locale (default: the site default)')
	.option('--url', 'A running site (default: start the dev server)')
	.option('--at', 'scene:t,scene:t instead of each scene\'s final picture')
	.action(act(async (slug, o) => {
		const { sheet } = await import('./capture.js')
		const p = P()
		await sheet(p, slug, { locale: loc(o, p), url: o.url, at: o.at })
	}))

prog.command('tts-check')
	.describe('Which voice provider each locale uses, whether it is ready here, and which offline engines exist.')
	.action(act(async () => {
		const { ttsCheck } = await import('./voice.js')
		const r = ttsCheck(P())
		for (const x of r.rows) console.info(`${x.locale}: ${x.provider ? `${x.provider} (${x.label}) ${x.ready ? 'ready' : `not ready: ${x.note}`}` : 'no provider set'}`)
		console.info(`offline engines on this machine: ${r.offline.join(', ') || 'none'}`)
	}))

prog.command('set-voice')
	.describe('Choose the voice provider for a locale (or "default"); options with --opt key=value. Keys stay in env vars.')
	.option('--locale', 'Locale, a language, or default', 'default')
	.option('--provider', 'piper | kokoro | macos | espeak | elevenlabs | openai | azure | google | polly | manual')
	.option('--opt', 'key=value (voice, voice_id, model, instructions, rate, …); repeatable')
	.action(act(async (o) => {
		const { setVoice } = await import('./voice.js')
		if (!o.provider) throw new MotionError('--provider is required')
		const r = setVoice(P(), o.locale, o.provider, parseOpts(o.opt))
		r.dropped.forEach((k) => console.info(`dropped "${k}": keys belong in environment variables, not emaki.config.json`))
		console.info(`voice.${o.locale} = ${JSON.stringify(r.block)}`)
	}))

prog.command('voices')
	.describe('List the voices a provider offers for a locale.')
	.option('--locale', 'Locale (default: the site default)')
	.option('--provider', 'Override the configured provider')
	.action(act(async (o) => {
		const { listVoices } = await import('./voice.js')
		const p = P()
		for (const v of await listVoices(p, loc(o, p), o.provider)) console.info(v)
	}))

prog.command('voice <slug>')
	.describe('Synthesise the takes from voice/<locale>.json with the configured provider.')
	.option('--locale', 'Locale (default: the site default)')
	.option('--only', 'Take numbers, e.g. 2,5')
	.option('--provider', 'Override the configured provider for this run')
	.option('--opt', 'key=value override, e.g. voice=nova; repeatable')
	.action(act(async (slug, o) => {
		const { voice } = await import('./voice.js')
		const p = P()
		await voice(p, slug, { locale: loc(o, p), only: o.only, provider: o.provider, opts: parseOpts(o.opt) })
	}))

prog.command('fit <slug>')
	.describe('Fit each scene\'s running time to its take: timing.<locale>.json.')
	.option('--locale', 'Locale (default: the site default)')
	.option('--check', 'Report only; write nothing', false)
	.action(act(async (slug, o) => {
		const { fit } = await import('./voice.js')
		const p = P()
		const r = fit(p, slug, { locale: loc(o, p), check: o.check })
		console.info(`${'scene'.padEnd(12)} ${'design'.padStart(6)} ${'holds'.padStart(6)} ${'take'.padStart(6)} ${'runs'.padStart(6)}`)
		for (const x of r.rows)
			console.info(`${x.scene.padEnd(12)} ${x.design.toFixed(1).padStart(6)} ${x.holds.toFixed(1).padStart(6)} ${x.take.toFixed(1).padStart(6)} ${x.runs.toFixed(1).padStart(6)}${x.longer ? '  ← longer' : ''}${x.take ? '' : '  (no take)'}`)
		console.info(`total ${r.total.toFixed(1)} s (${loc(o, p)})${r.written ? `\nwrote ${r.path}` : ''}`)
	}))

prog.command('render <slug>')
	.describe('Capture the picture frame by frame (with the score) and the covers (needs Playwright + ffmpeg).')
	.option('--locale', 'Locale (default: the site default)')
	.option('--url', 'A running site (default: start the dev server)')
	.option('--o', 'both | landscape | portrait', 'both')
	.option('--fps', 'Frames per second', 30)
	.action(act(async (slug, o) => {
		const { render } = await import('./capture.js')
		const p = P()
		await render(p, slug, { locale: loc(o, p), url: o.url, o: o.o, fps: Number(o.fps) })
	}))

prog.command('build <slug>')
	.describe('Final videos: picture + voice + ducked score, captions (.srt/.vtt and burned in), -14 LUFS.')
	.option('--locale', 'Locale (default: the site default)')
	.option('--no-captions', 'Do not burn captions in')
	.action(act(async (slug, o) => {
		const { build } = await import('./voice.js')
		const p = P()
		build(p, slug, { locale: loc(o, p), noCaptions: o.captions === false })
	}))

prog.parse(process.argv)
