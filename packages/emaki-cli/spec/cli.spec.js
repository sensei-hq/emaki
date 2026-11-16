// The CLI's steps as functions, in throwaway project folders. Nothing here needs ffmpeg, a browser or a network.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
	captions, detectFramework, fit, init, installPlugin, listAgents, listSkills, manifest, newFilm, parseFrontmatter,
	project, PROVIDERS, provider, setVoice, ttsCheck, validate, voiceConfig, MotionError
} from '../src/api.js'

const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'motion-cli-')); dirs.push(d); return d }
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }) })
const json = (p) => JSON.parse(readFileSync(p, 'utf-8'))

describe('init', () => {
	it('detects the framework from package.json', () => {
		const d = tmp()
		expect(detectFramework(d)).toBe('vanilla')
		writeFileSync(join(d, 'package.json'), JSON.stringify({ devDependencies: { '@sveltejs/kit': '2', svelte: '5' } }))
		expect(detectFramework(d)).toBe('sveltekit')
		writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { next: '15', react: '19' } }))
		expect(detectFramework(d)).toBe('next')
	})
	it('writes the sample, the config, the source and the capture route, and never overwrites', () => {
		const d = tmp()
		writeFileSync(join(d, 'package.json'), JSON.stringify({ devDependencies: { '@sveltejs/kit': '2' } }))
		const r = init({ cwd: d })
		expect(r.packages).toEqual(['@senseihq/emaki', '@senseihq/emaki-svelte'])
		for (const f of ['content/site.json', 'content/films/measure-the-right-work/film.json', 'emaki.config.json', 'src/lib/emaki-source.ts', 'src/routes/show/[film]/+page.svelte'])
			expect(existsSync(join(d, f)), f).toBe(true)
		expect(json(join(d, 'emaki.config.json')).coversDir).toBe('static/covers')
		expect(readFileSync(join(d, '.gitignore'), 'utf-8')).toMatch(/^production\/$/m)
		writeFileSync(join(d, 'src/lib/emaki-source.ts'), 'mine')
		expect(init({ cwd: d }).kept).toContain('src/lib/emaki-source.ts')
		expect(readFileSync(join(d, 'src/lib/emaki-source.ts'), 'utf-8')).toBe('mine')
	})
	it('every capture route passes ?src= and ?mode= through (parity runs and dark renders)', () => {
		for (const [fw, file] of [['sveltekit', 'src/routes/show/[film]/+page.ts'], ['next', 'app/show/[film]/page.tsx'], ['vanilla', 'motion.ts']]) {
			const d = tmp()
			init({ cwd: d, framework: fw, sample: false })
			const text = readFileSync(join(d, file), 'utf-8')
			expect(text, fw).toMatch(/get\('src'\)/)
			expect(text, fw).toMatch(/get\('mode'\)/)
		}
		const d = tmp()
		init({ cwd: d, framework: 'sveltekit', sample: false })
		expect(readFileSync(join(d, 'src/routes/show/[film]/+page.svelte'), 'utf-8')).toMatch(/src=\{data\.src\}.*mode=\{data\.mode\}/)
	})
	it('the sample content validates', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const r = validate(project(d))
		expect(r.problems, r.lines.join('\n')).toBe(0)
	})
})

describe('plugin', () => {
	it('bundles skills and agents with frontmatter', () => {
		expect(listSkills().map((s) => s.name)).toEqual(expect.arrayContaining(['emaki', 'story-build', 'story-media', 'story-review', 'story-localize', 'story-publish']))
		expect(listAgents().map((a) => a.name)).toEqual(expect.arrayContaining(['story-planner', 'scene-builder', 'visual-reviewer']))
		for (const s of listSkills()) expect(s.description.length, s.name).toBeGreaterThan(20)
		expect(parseFrontmatter('---\nname: x\ndescription: y z\n---\nbody')).toEqual({ name: 'x', description: 'y z' })
		expect(parseFrontmatter('---\nname: x\ndescription: >\n  one\n  two\nmetadata:\n  v: 1\n---\n')).toEqual({ name: 'x', description: 'one two' })
	})
	it('installs into .claude and skips what exists', () => {
		const d = tmp()
		const first = installPlugin({ cwd: d })
		expect(first.skills.every((s) => s.status === 'added')).toBe(true)
		expect(existsSync(join(d, '.claude/skills/emaki/SKILL.md'))).toBe(true)
		expect(existsSync(join(d, '.claude/agents/scene-builder.md'))).toBe(true)
		expect(existsSync(join(d, '.claude/emaki/PLAYBOOK.md'))).toBe(true)
		expect(installPlugin({ cwd: d }).skills.every((s) => s.status === 'skipped')).toBe(true)
	})
	it('the shipped plugin no longer points at the old kit or python tools', () => {
		const d = tmp()
		installPlugin({ cwd: d })
		const all = ['skills', 'agents', 'emaki'].flatMap((x) => {
			const walk = (p) => existsSync(p) ? (readFileSync.length && require_ls(p)) : []
			return walk(join(d, '.claude', x))
		})
		for (const f of all.filter((f) => f.endsWith('.md'))) expect(readFileSync(f, 'utf-8'), f).not.toMatch(/motion\.py|kit\/core|tools\/tts\.py/)
	})
})

import { readdirSync, statSync } from 'node:fs'
function require_ls(p) {
	return readdirSync(p).flatMap((e) => (statSync(join(p, e)).isDirectory() ? require_ls(join(p, e)) : [join(p, e)]))
}

describe('films', () => {
	it('scaffolds a film every locale can validate, and lists it in the manifest', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const p = project(d)
		newFilm(p, 'spot-the-phish', { scenes: 'hook,signs,report', title: 'Spot the phish', date: '2026-12-01' })
		expect(json(join(d, 'content/films/index.json'))).toContain('spot-the-phish')
		expect(existsSync(join(d, 'content/stories/es/spot-the-phish.json'))).toBe(true)
		expect(json(join(d, 'content/films/spot-the-phish/film.json')).scenes.map((s) => s.id)).toEqual(['hook', 'signs', 'report', 'close'])
		const r = validate(p, 'spot-the-phish')
		expect(r.problems, r.lines.join('\n')).toBe(0)
		expect(() => newFilm(p, 'spot-the-phish', {})).toThrow(MotionError)
		expect(manifest(p).count).toBe(2)
	})
	it('reports a missing string in one locale', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const f = join(d, 'content/films/measure-the-right-work/strings/es.json'), s = json(f)
		delete s[Object.keys(s)[0]]
		writeFileSync(f, JSON.stringify(s))
		const r = validate(project(d), 'measure-the-right-work')
		expect(r.lines.join('\n')).toMatch(/strings\/es\.json: missing/)
	})
	it('the sample film and a new film come with a dark look', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const p = project(d)
		newFilm(p, 'night-shift')
		for (const slug of ['measure-the-right-work', 'night-shift']) {
			expect(json(join(d, `content/films/${slug}/film.json`)).dark?.background, slug).toMatch(/^#/)
			expect(readFileSync(join(d, `content/films/${slug}/look.css`), 'utf-8'), slug).toContain('#stage[data-mode="dark"]')
		}
		expect(validate(p).problems).toBe(0)
	})
	it('flags a dark block with no dark styles, and dark styles with no dark block', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const dir = join(d, 'content/films/measure-the-right-work'), look = join(dir, 'look.css'), film = join(dir, 'film.json')
		const css = readFileSync(look, 'utf-8')
		writeFileSync(look, css.split('\n').filter((l) => !l.includes('data-mode="dark"')).join('\n'))
		expect(validate(project(d), 'measure-the-right-work').lines.join('\n')).toMatch(/film\.json has a dark block but look\.css never styles #stage\[data-mode="dark"\]/)
		writeFileSync(look, css)
		const f = json(film); delete f.dark; writeFileSync(film, JSON.stringify(f))
		expect(validate(project(d), 'measure-the-right-work').lines.join('\n')).toMatch(/look\.css styles #stage\[data-mode="dark"\] but film\.json has no dark block/)
	})
})

describe('voice', () => {
	it('merges voice blocks default → language → locale, and starts fresh on a provider switch', () => {
		const cfg = { voice: { default: { provider: 'piper', model: 'a.onnx' }, es: { model: 'es.onnx' }, 'es-MX': { provider: 'azure', voice: 'es-MX-DaliaNeural' } } }
		expect(voiceConfig(cfg, 'es')).toEqual({ provider: 'piper', model: 'es.onnx' })
		expect(voiceConfig(cfg, 'es-MX')).toEqual({ provider: 'azure', voice: 'es-MX-DaliaNeural' })
		expect(voiceConfig(cfg, 'fr')).toEqual({ provider: 'piper', model: 'a.onnx' })
	})
	it('records a choice and refuses to store keys', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const p = project(d)
		const r = setVoice(p, 'es', 'openai', { voice: 'coral', api_key: 'sk-nope' })
		expect(r.dropped).toEqual(['api_key'])
		expect(json(join(d, 'emaki.config.json')).voice.es).toEqual({ provider: 'openai', voice: 'coral' })
		expect(() => setVoice(p, 'es', 'nope')).toThrow(/unknown provider/)
	})
	it('knows every provider and says what a cloud one is missing', () => {
		expect(Object.keys(PROVIDERS)).toEqual(['piper', 'kokoro', 'macos', 'espeak', 'elevenlabs', 'openai', 'azure', 'google', 'polly', 'manual'])
		const saved = process.env.ELEVENLABS_API_KEY
		delete process.env.ELEVENLABS_API_KEY
		expect(() => provider('elevenlabs').check({ voice_id: 'x' }, 'en')).toThrow(/ELEVENLABS_API_KEY/)
		if (saved) process.env.ELEVENLABS_API_KEY = saved
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		expect(ttsCheck(project(d)).rows.every((r) => r.provider === null)).toBe(true)
	})
	it('fits scene times to the takes and spreads captions over them', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const p = project(d), slug = 'measure-the-right-work'
		const film = json(join(d, `content/films/${slug}/film.json`))
		const lines = film.scenes.map((s) => ({ scene: s.id, text: `First line for ${s.id}. Second one!` }))
		mkdirSync(join(d, `content/films/${slug}/voice`), { recursive: true })
		writeFileSync(join(d, `content/films/${slug}/voice/en.json`), JSON.stringify(lines))
		const takes = p.prod(slug, 'en', 'takes')
		mkdirSync(takes, { recursive: true })
		film.scenes.forEach((_, i) => writeFileSync(join(takes, `take-${String(i + 1).padStart(2, '0')}.wav`), ''))
		const long = film.scenes[0].dur + 5
		const r = fit(p, slug, { locale: 'en', length: (f) => (f.endsWith('take-01.wav') ? long : 1) })
		expect(r.rows[0]).toMatchObject({ longer: true, runs: Math.ceil((0.6 + long + 1.2) * 10) / 10 })
		expect(r.rows.slice(1).every((x) => !x.longer)).toBe(true)
		expect(json(join(d, `content/films/${slug}/timing.en.json`)).scenes[film.scenes[0].id].dur).toBe(r.rows[0].runs)
		const starts = new Map(film.scenes.map((s, i) => [s.id, [i * 10, 10]]))
		const cap = captions(new Map([[film.scenes[0].id, ['x', lines[0]]]]), starts, 0.6, () => 4.1)
		expect(cap.vtt).toMatch(/^WEBVTT/)
		const cues = cap.srt.split('\n').filter((l) => l.includes('-->'))
		expect(cues).toHaveLength(2)
		expect(cues[0].startsWith('00:00:00,600 --> ')).toBe(true)
		expect(cues[1].endsWith(' --> 00:00:04,600')).toBe(true)
	})
})
