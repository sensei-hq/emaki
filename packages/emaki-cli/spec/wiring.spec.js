// Every `emaki` command's wiring, run in this process the way index.js registers it: the arguments and flags each
// command hands to its step, what it prints, and how it fails (a MotionError prints "emaki: …" and exits 1; anything
// else is a bug and propagates). The set-up and campaign commands run their real steps in a throwaway project. The
// production and posting steps (browser, ffmpeg, voices, the desk, the platforms) are recorded stand-ins here; their
// own specs cover them.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sade from 'sade'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { campaignCommands } from '../src/commands/campaign.js'
import { postingCommands } from '../src/commands/posting.js'
import { productionCommands } from '../src/commands/production.js'
import { setupCommands } from '../src/commands/setup.js'
import { DAY, json, project, put, tmp } from './helpers.js'

/** Each stand-in step records [name, ...args] here and answers from `answers[name]` (a value or a function). */
const steps = vi.hoisted(() => ({ calls: [], answers: {} }))
const stub = (name) => async (...args) => {
	steps.calls.push([name, ...args])
	const a = steps.answers[name]
	return typeof a === 'function' ? a(...args) : a
}
const sync = (name) => (...args) => {
	steps.calls.push([name, ...args])
	const a = steps.answers[name]
	return typeof a === 'function' ? a(...args) : a
}
vi.mock('../src/capture.js', () => ({ sheet: stub('sheet'), render: stub('render') }))
vi.mock('../src/voice.js', () => ({
	ttsCheck: sync('ttsCheck'), setVoice: sync('setVoice'), listVoices: stub('listVoices'), voice: stub('voice'),
	fit: sync('fit'), voiceWeb: sync('voiceWeb'), build: sync('build')
}))
vi.mock('../src/stage.js', () => ({ stage: stub('stage') }))
vi.mock('../src/desk-plan.js', () => ({ productionStatus: stub('productionStatus'), deskRequests: stub('deskRequests'), deskReply: stub('deskReply') }))
vi.mock('../src/publish.js', () => ({ publish: stub('publish') }))
vi.mock('../src/carousel.js', () => ({ carousel: stub('carousel') }))

class Exit extends Error { constructor(code) { super(`exit ${code}`); this.code = code } }

/** Runs `emaki ...argv` in `cwd` in this process: { out, err, code, calls } (calls: the steps it ran, cwd dropped). */
async function emaki(cwd, ...argv) {
	const prog = sade('emaki')
	setupCommands(prog); productionCommands(prog); postingCommands(prog); campaignCommands(prog)
	const out = [], err = []
	vi.spyOn(console, 'info').mockImplementation((...a) => out.push(a.join(' ')))
	vi.spyOn(console, 'error').mockImplementation((...a) => err.push(a.join(' ')))
	vi.spyOn(process, 'exit').mockImplementation((c) => { throw new Exit(c) })
	vi.spyOn(process, 'cwd').mockReturnValue(cwd)
	steps.calls.length = 0
	process.exitCode = undefined
	let code = 0
	try {
		const r = prog.parse(['node', 'emaki', ...argv], { lazy: true })
		await r.handler(...r.args)
		code = process.exitCode ?? 0
	} catch (e) {
		if (!(e instanceof Exit)) throw e
		code = e.code
	} finally {
		process.exitCode = undefined
		vi.restoreAllMocks()
	}
	return { out: out.join('\n'), err: err.join('\n'), code, calls: steps.calls.map(([n, p, ...rest]) => [n, p?.root ?? p, ...rest]) }
}

afterEach(() => { steps.answers = {} })

describe('emaki init and the plugin', () => {
	it('init sets the project up, installs the plugin and says what to do next', async () => {
		const d = tmp()
		const r = await emaki(d, 'init', '--framework', 'vanilla')
		expect(r.code).toBe(0)
		expect(r.out).toMatch(/^framework: vanilla\n {2}wrote content\/ \(sample film/)
		expect(r.out).toMatch(/added skill emaki/)
		expect(r.out).toMatch(/Next:\n {2}npm i @senseihq\/emaki\n/)
		expect(existsSync(join(d, '.claude/emaki/PLAYBOOK.md'))).toBe(true)
	})

	it('init --no-sample --no-plugin writes only the project files, and keeps what exists on a second run', async () => {
		const d = tmp()
		await emaki(d, 'init', '--framework', 'vanilla', '--no-sample', '--no-plugin')
		expect(existsSync(join(d, 'content'))).toBe(false)
		expect(existsSync(join(d, '.claude'))).toBe(false)
		const again = await emaki(d, 'init', '--framework', 'vanilla', '--no-plugin')
		expect(again.out).toMatch(/kept emaki\.config\.json \(exists\)/)
		expect(again.out).not.toMatch(/added skill/)
	})

	it('plugin install copies the plugin, and --force copies it again', async () => {
		const d = tmp()
		expect((await emaki(d, 'plugin', 'install')).out).toMatch(/added agent /)
		expect((await emaki(d, 'plugin', 'install')).out).toMatch(/skipped skill emaki \(exists; --force to overwrite\)/)
		expect((await emaki(d, 'plugin', 'install', '--force')).out).not.toMatch(/skipped/)
	})

	it('skills and agents list the catalog, and add named ones or --all', async () => {
		const d = tmp()
		const list = await emaki(d, 'skills')
		expect(list.out).toMatch(/^emaki\n {5}\S/)
		expect(list.out).toMatch(/Install with: emaki skills add <name> \[\.\.\.\] {3}\(or --all\)$/)
		expect((await emaki(d, 'skills', 'add', 'emaki', 'story-build')).out).toBe('  added skill emaki\n  added skill story-build')
		const all = await emaki(d, 'skills', 'add', '--all', '--force')
		expect(all.out).toMatch(/added skill story-review/)
		const ghost = await emaki(d, 'skills', 'add', 'ghost')
		expect([ghost.err, ghost.code]).toEqual(['  unknown skill: ghost', 1])

		expect((await emaki(d, 'agents')).out).toMatch(/Install with: emaki agents add <name> \[\.\.\.\] {3}\(or --all\)$/)
		const [agent] = (await emaki(d, 'agents', 'add', '--all')).out.split('\n')
		expect(agent).toMatch(/^ {2}added agent \S+/)
		const name = agent.replace('  added agent ', '')
		expect((await emaki(d, 'agents', 'add', name)).out).toBe(`  skipped agent ${name} (exists; --force to overwrite)`)
		expect((await emaki(d, 'agents', 'add', name, '--force')).out).toBe(`  added agent ${name}`)
	})
})

describe('emaki manifest, validate, migrate and new', () => {
	it('manifest writes the film list', async () => {
		const d = project()
		expect((await emaki(d, 'manifest')).out).toBe('1 films → content/films/index.json')
		expect(json(join(d, 'content/films/index.json'))).toEqual(['demo'])
	})

	it('validate prints each problem and fails, or says ok', async () => {
		const d = project()
		const bad = await emaki(d, 'validate', 'demo')
		expect(bad.code).toBe(1)
		expect(bad.out).toMatch(/problem\(s\)$/)
		const ok = await emaki(tmp(), 'validate')
		expect([ok.out, ok.code]).toEqual(['ok', 0])
	})

	it('migrate moves a site, lists what it kept on a second run, and validates the result', async () => {
		const w = tmp()
		put(w, 'src/lib/content/articles/index.json', [{ slug: 'a', title: 'A', dek: 'D', publish_date: '2026-01-01' }])
		put(w, 'src/lib/content/articles/a.json', { sections: [{ id: 's', title: 'S', body: ['p'] }] })
		const d = tmp()
		const first = await emaki(d, 'migrate', w, '--locale', 'en')
		expect(first.out).toMatch(/^ {2}wrote content\/stories\/index\.json$/m)
		expect(first.out).toMatch(/migrated; emaki validate: ok$/)
		expect(first.code).toBe(0)
		const second = await emaki(d, 'migrate', w)
		expect(second.out).toMatch(/^ {2}kept 2 existing file\(s\)$/m)

		const broken = tmp()
		put(w, 'src/lib/content/articles/index.json', [{ slug: 'b', publish_date: 'soon' }])
		put(w, 'src/lib/content/articles/b.json', {})
		const r = await emaki(broken, 'migrate', w)
		expect(r.out).toMatch(/problem\(s\) left: fix them, then `emaki validate`$/)
		expect(r.code).toBe(1)
	})

	it('new scaffolds a story and its film', async () => {
		const d = project()
		const r = await emaki(d, 'new', 'second', '--scenes', 'hook,how', '--title', 'Second', '--date', '2026-12-01')
		expect(r.out).toBe('scaffolded second: 3 scenes, 1 locale(s). Next: write the scenes, then `emaki sheet second`.')
		expect(json(join(d, 'content/films/second/film.json')).title).toBe('Second')
	})

	it('a MotionError prints "emaki: …" and exits 1', async () => {
		const r = await emaki(project(), 'new', 'demo')
		expect([r.err, r.code]).toEqual(['emaki: content/films/demo already exists', 1])
	})
})

describe('emaki production steps', () => {
	it('sheet and render pass the locale (default: the site\'s), the url and their options', async () => {
		const d = project()
		expect((await emaki(d, 'sheet', 'demo', '--at', 'hook:2')).calls).toEqual([['sheet', d, 'demo', { locale: 'en', url: undefined, at: 'hook:2' }]])
		expect((await emaki(d, 'render', 'demo', '--locale', 'es', '--url', 'http://localhost:5173', '--o', 'portrait', '--fps', '24', '--from', '2', '--to', '9', '--out', 'x.mp4', '--music', 'none', '--audio-only', '--cover-only')).calls).toEqual([
			['render', d, 'demo', { locale: 'es', url: 'http://localhost:5173', o: 'portrait', fps: 24, from: 2, to: 9, out: 'x.mp4', music: 'none', audioOnly: true, coverOnly: true }]
		])
		expect((await emaki(d, 'render', 'demo')).calls).toEqual([
			['render', d, 'demo', { locale: 'en', url: undefined, o: 'both', fps: 30, from: 0, to: undefined, out: undefined, music: 'synth', audioOnly: false, coverOnly: false }]
		])
	})

	it('tts-check prints each locale\'s provider and the offline engines', async () => {
		steps.answers.ttsCheck = { rows: [
			{ locale: 'en', provider: 'piper', label: 'Piper', ready: true },
			{ locale: 'es', provider: 'openai', label: 'OpenAI', ready: false, note: 'set OPENAI_API_KEY' },
			{ locale: 'fr' }
		], offline: ['piper', 'espeak'] }
		expect((await emaki(project(), 'tts-check')).out).toBe([
			'en: piper (Piper) ready', 'es: openai (OpenAI) not ready: set OPENAI_API_KEY', 'fr: no provider set', 'offline engines on this machine: piper, espeak'
		].join('\n'))
		steps.answers.ttsCheck = { rows: [], offline: [] }
		expect((await emaki(project(), 'tts-check')).out).toBe('offline engines on this machine: none')
	})

	it('set-voice needs --provider, passes --opt pairs, and says which keys it dropped', async () => {
		const d = project()
		expect((await emaki(d, 'set-voice')).err).toBe('emaki: --provider is required')
		steps.answers.setVoice = { dropped: ['api_key'], block: { provider: 'openai', voice: 'nova' } }
		const r = await emaki(d, 'set-voice', '--locale', 'en', '--provider', 'openai', '--opt', 'voice=nova', '--opt', 'api_key=x')
		expect(r.calls).toEqual([['setVoice', d, 'en', 'openai', { voice: 'nova', api_key: 'x' }]])
		expect(r.out).toBe('dropped "api_key": keys belong in environment variables, not emaki.config.json\nvoice.en = {"provider":"openai","voice":"nova"}')
	})

	it('voices lists what the provider offers; voice passes --only, --provider and --opt', async () => {
		const d = project()
		steps.answers.listVoices = ['alloy', 'nova']
		const v = await emaki(d, 'voices', '--provider', 'openai')
		expect([v.out, v.calls]).toEqual(['alloy\nnova', [['listVoices', d, 'en', 'openai']]])
		expect((await emaki(d, 'voice', 'demo', '--only', '2,5', '--opt', 'voice=nova')).calls).toEqual([
			['voice', d, 'demo', { locale: 'en', only: '2,5', provider: undefined, opts: { voice: 'nova' } }]
		])
	})

	it('fit prints a row per scene, marking longer, shorter and missing takes, and where it wrote', async () => {
		const row = (scene, take, runs, x = {}) => ({ scene, design: 10, holds: 0, take, runs, ...x })
		steps.answers.fit = { rows: [row('hook', 12, 12.5, { longer: true }), row('idea', 8, 8.5, { shorter: true }), row('close', 0, 10)], total: 31, written: true, path: 'content/films/demo/timing.en.json' }
		const d = project()
		const r = await emaki(d, 'fit', 'demo', '--locale', 'en')
		expect(r.out).toBe([
			'scene        design  holds   take   runs',
			'hook           10.0    0.0   12.0   12.5  ← longer',
			'idea           10.0    0.0    8.0    8.5  ← shorter',
			'close          10.0    0.0    0.0   10.0  (no take)',
			'total 31.0 s (en)',
			'wrote content/films/demo/timing.en.json'
		].join('\n'))
		expect(r.calls).toEqual([['fit', d, 'demo', { locale: 'en', check: false }]])
		steps.answers.fit = { rows: [], total: 0, written: false }
		const check = await emaki(d, 'fit', 'demo', '--check')
		expect(check.out.split('\n').at(-1)).toBe('total 0.0 s (en)')
		expect(check.calls).toEqual([['fit', d, 'demo', { locale: 'en', check: true }]])
	})

	it('voice-web logs each file, the takes it removed and the timing', async () => {
		steps.answers.voiceWeb = (p, slug, o) => { o.log('a.m4a'); return { removed: ['b.m4a'], timing: 'timing.en.json' } }
		expect((await emaki(project(), 'voice-web', 'demo')).out).toBe('wrote a.m4a\nremoved b.m4a (no take)\nwrote timing.en.json')
	})

	it('build passes --no-captions, --check and --out', async () => {
		const d = project()
		expect((await emaki(d, 'build', 'demo', '--no-captions', '--check', '--out', 'o')).calls).toEqual([['build', d, 'demo', { locale: 'en', noCaptions: true, check: true, out: 'o' }]])
		expect((await emaki(d, 'build', 'demo')).calls).toEqual([['build', d, 'demo', { locale: 'en', noCaptions: false, check: false, out: undefined }]])
	})

	it('an error that is not a MotionError is a bug: it propagates with its stack', async () => {
		steps.answers.build = () => { throw new TypeError('boom') }
		await expect(emaki(project(), 'build', 'demo')).rejects.toThrow(TypeError)
	})
})

describe('emaki stage, publish and carousel', () => {
	it('stage splits --channels on commas and repeats, and passes --dry-run', async () => {
		const d = project()
		expect((await emaki(d, 'stage', 'demo', '--channels', 'youtube, x', '--channels', 'instagram_reel', '--dry-run')).calls).toEqual([
			['stage', d, 'demo', { locale: undefined, channels: ['youtube', 'x', 'instagram_reel'], dryRun: true }]
		])
		expect((await emaki(d, 'stage', 'demo', '--locale', 'en')).calls).toEqual([['stage', d, 'demo', { locale: 'en', channels: undefined, dryRun: false }]])
	})

	it('stage status, requests and reply call the desk plan', async () => {
		const d = project()
		expect((await emaki(d, 'stage', 'status', 'demo', '--locale', 'en')).calls).toEqual([['productionStatus', d, 'demo', { locale: 'en' }]])
		expect((await emaki(d, 'stage', 'requests')).calls).toEqual([['deskRequests', d]])
		expect((await emaki(d, 'stage', 'reply', '7', 'On it', '--working')).calls).toEqual([['deskReply', d, '7', 'On it', { status: 'working' }]])
		expect((await emaki(d, 'stage', 'reply', '7', '--done')).calls).toEqual([['deskReply', d, '7', '', { status: 'done' }]])
		expect((await emaki(d, 'stage', 'reply', '7', 'Note')).calls).toEqual([['deskReply', d, '7', 'Note', { status: undefined }]])
		const both = await emaki(d, 'stage', 'reply', '7', 'x', '--working', '--done')
		expect([both.err, both.code, both.calls]).toEqual(['emaki: --working or --done, not both', 1, []])
	})

	it('publish needs a slug unless --verify, and passes every flag (an --update id as text)', async () => {
		const d = project()
		expect((await emaki(d, 'publish', 'youtube')).err).toBe('emaki: a slug is required (or --verify)')
		expect((await emaki(d, 'publish', 'youtube', 'demo', '--update', '12345', '--privacy', 'public', '--force-new', '--description-mode', 'replace', '--dry-run')).calls).toEqual([
			['publish', d, 'youtube', 'demo', { locale: undefined, privacy: 'public', update: '12345', forceNew: true, descriptionMode: 'replace', videoUrl: undefined, coverUrl: undefined, dryRun: true, verify: false }]
		])
		expect((await emaki(d, 'publish', 'instagram', '--verify', '--video-url', 'v', '--cover-url', 'c')).calls).toEqual([
			['publish', d, 'instagram', undefined, { locale: undefined, privacy: 'unlisted', update: undefined, forceNew: false, descriptionMode: 'prepend', videoUrl: 'v', coverUrl: 'c', dryRun: false, verify: true }]
		])
	})

	it('carousel takes every slug named, or --all', async () => {
		const d = project()
		expect((await emaki(d, 'carousel', 'demo', 'other', '--locale', 'en')).calls).toEqual([['carousel', d, ['demo', 'other'], { all: false, locale: 'en' }]])
		expect((await emaki(d, 'carousel', '--all')).calls).toEqual([['carousel', d, [], { all: true, locale: undefined }]])
	})
})

describe('emaki campaign', () => {
	function campaign() {
		const d = project()
		put(d, 'films/campaign/calendar.csv', 'date,product,theme,title,status,script\n2026-11-16,DBD,DBD week,Title,expanded,days/day-01-demo.md\n2026-11-17,Rokkit,Rokkit week,Later,planned,\n')
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		return d
	}

	it('status prints a row per day, with the posts made so far', async () => {
		const d = campaign()
		put(d, 'films/campaign/published.json', { demo: { instagram: 'https://instagram.com/p/1' } })
		const r = await emaki(d, 'campaign', 'status', '--from', '2026-11-16', '--days', '2')
		expect(r.out.split('\n').slice(1, 3)).toEqual([
			'2026-11-16  DBD         Title                                          yes   yes     0   -   yes    0  ·I·',
			'2026-11-17  Rokkit      Later                                          (no day script yet)'
		])
	})

	it('posted records only the links given a value', async () => {
		const d = campaign()
		const r = await emaki(d, 'campaign', 'posted', 'demo', '--instagram', 'https://instagram.com/p/2', '--x')
		expect(r.out).toMatch(/^recorded demo: \{"instagram":"https:\/\/instagram\.com\/p\/2","updated":"\d{4}-\d\d-\d\d"\}\. Commit content\/stories\/index\.json/)
		expect(json(join(d, 'films/campaign/published.json')).demo).not.toHaveProperty('x')
	})

	it('due prints the day as JSON; calendar rewrites CALENDAR.md; shortfilm sets up the Short', async () => {
		const d = campaign()
		expect(JSON.parse((await emaki(d, 'campaign', 'due', '--date', '2026-11-16')).out)).toMatchObject({ date: '2026-11-16', slug: 'demo' })
		expect((await emaki(d, 'campaign', 'calendar')).out).toBe('wrote films/campaign/CALENDAR.md (2 days)')
		const fresh = campaign()
		put(fresh, 'films/campaign/days/day-03-short-one.md', DAY.replace('# Day 01', '# Day 03'))
		expect((await emaki(fresh, 'campaign', 'shortfilm', 'short-one', '--locale', 'en')).out).toBe(
			'wrote content/films/short-one/film.json: 2 beats. Next: build the scenes, then `emaki voice short-one`, `emaki fit short-one`, `emaki render short-one --o portrait`.'
		)
	})
})
