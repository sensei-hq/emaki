// The CLI's steps as functions, in throwaway project folders. Nothing here needs ffmpeg, a browser or a network.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
	captions, detectFramework, fit, init, installPlugin, listAgents, listSkills, manifest, newFilm, parseFrontmatter,
	migrate, project, PROVIDERS, provider, setVoice, ttsCheck, validate, voiceConfig, MotionError
} from '../src/api.js'
import { buildPlan } from '../src/media.js'
import { scenePlan } from '../src/youtube-text.js'
import { localizeScene, motionEnd } from '@senseihq/emaki'

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
	it('detects each framework in priority order (kit, svelte, next, nuxt, react, vue)', () => {
		const d = tmp()
		const fw = (dependencies, devDependencies) => {
			writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies, devDependencies }))
			return detectFramework(d)
		}
		expect(fw({ svelte: '5', react: '19' })).toBe('svelte')
		expect(fw({ nuxt: '3', vue: '3' })).toBe('nuxt')
		expect(fw(undefined, { react: '19', vue: '3' })).toBe('react')
		expect(fw({ vue: '3' })).toBe('vue')
		expect(fw({ lodash: '4' })).toBe('vanilla')
		expect(fw()).toBe('vanilla')
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

describe('validate', () => {
	const write = (root, rel, data) => {
		mkdirSync(join(root, rel, '..'), { recursive: true })
		writeFileSync(join(root, rel), typeof data === 'string' ? data : JSON.stringify(data))
	}
	it('reports every film and story problem, in order', () => {
		const d = tmp()
		write(d, 'content/site.json', { locales: ['en', 'es', 'fr'], defaultLocale: 'en' })
		const F = 'content/films/bad'
		write(d, `${F}/film.json`, { scenes: [{ id: 'a', dur: 5 }, { id: 'b', dur: 0 }, { id: 'c', dur: 60 }, { id: 'd', dur: 3 }, { id: 'e', dur: 4 }] })
		write(d, `${F}/scene-a.json`, { portrait: {}, components: [{ id: 'x', text: '{{a.k}}' }, { id: 'x' }] })
		write(d, `${F}/scene-b.json`, { text: ['{{b.k}}', { deep: '{{ b.j }}' }] })
		write(d, `${F}/scene-c.js`, 'scene')
		write(d, `${F}/scene-e.json`, { portrait: null })
		write(d, `${F}/strings/en.json`, { 'a.k': 'A', 'z.unused': 'Z', 'y.unused': 'Y' })
		write(d, `${F}/voice/en.json`, [{ scene: 'a' }, { scene: 'c' }])
		write(d, `${F}/strings/es.json`, Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`u${String(i).padStart(2, '0')}`, 'x'])))
		const G = 'content/films/plain'
		write(d, `${G}/film.json`, { cover: { scene: 'a' }, dark: {}, scenes: [{ id: 'a', dur: 1 }] })
		write(d, `${G}/look.css`, '#stage {}')
		write(d, `${G}/scene-a.json`, { portrait: {} })
		write(d, 'content/stories/index.json', [
			{ slug: 'bad', publish_date: '2026-1-2' },
			{ slug: 'plain', publish_date: '2026-01-02', film: 'bad' },
			{ slug: 'lone', publish_date: '2026-01-03' }
		])
		write(d, 'content/stories/en/bad.json', { title: 'T', dek: '', sections: [], takeaway: 'x' })
		write(d, 'content/stories/es/bad.json', { title: 'T', dek: 'D', sections: [{ id: 'a' }, { id: 'zz' }, { id: 'more' }, { id: 'sources' }, { id: 'q', motion: 'a' }, { id: 'r', figure: 'a' }] })
		write(d, 'content/stories/en/plain.json', { title: 'P', dek: 'D', sections: [{ id: 'nope' }], takeaway: 'y' })
		write(d, 'content/stories/en/lone.json', { title: 'L', dek: 'D', sections: [{ id: 'nope' }] })
		const r = validate(project(d))
		expect(r.lines).toEqual([
			'film bad: look.css is missing',
			'film bad: scene a: duplicate component ids',
			'film bad: scene b: no portrait block (needed for 9:16 and article figures)',
			'film bad: scene b: dur 0 looks wrong',
			'film bad: scene c: dur 60 looks wrong',
			'film bad: scene d: no scene-d.json (or .js)',
			'film bad: the last scene should be "close" (the punchline card is the cover), or film.json should name its cover',
			'film bad: strings/en.json: missing b.j, b.k',
			'film bad: strings/en.json: unused y.unused, z.unused',
			'film bad: voice/en.json: no line for b, d, e',
			'film bad: strings/es.json: missing a.k, b.j, b.k',
			'film bad: strings/es.json: unused u00, u01, u02, u03, u04, u05, u06, u07 …',
			'film bad: strings/fr.json is missing',
			'film plain: film.json has a dark block but look.css never styles #stage[data-mode="dark"]',
			'story bad: publish_date must be YYYY-MM-DD',
			'story bad: en: dek is empty',
			'story bad: en: sections is empty',
			'story bad: es: a film story needs a takeaway (the closing line)',
			'story bad: (info) es: section zz has no figure (no scene of that id)',
			'story bad: (info) stories/fr/bad.json not translated yet',
			'story plain: (info) en: section nope has no figure (no scene of that id)',
			'story plain: (info) stories/es/plain.json not translated yet',
			'story plain: (info) stories/fr/plain.json not translated yet',
			'story lone: (info) stories/es/lone.json not translated yet',
			'story lone: (info) stories/fr/lone.json not translated yet'
		])
		expect(r.problems).toBe(18)
		expect(validate(project(d), 'plain').lines).toEqual([
			'film plain: film.json has a dark block but look.css never styles #stage[data-mode="dark"]',
			'story plain: (info) en: section nope has no figure (no scene of that id)',
			'story plain: (info) stories/es/plain.json not translated yet',
			'story plain: (info) stories/fr/plain.json not translated yet'
		])
		rmSync(join(d, 'content/stories/en/lone.json'))
		expect(validate(project(d)).lines.slice(-3)).toEqual([
			'story lone: stories/en/lone.json is missing',
			'story lone: (info) stories/es/lone.json not translated yet',
			'story lone: (info) stories/fr/lone.json not translated yet'
		])
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

describe('scenes fit their narration', () => {
	const slug = 'measure-the-right-work'
	/** A fresh project whose takes for `locale` all last `seconds` (or per scene, from a function of the id). */
	function narrated(seconds, locale = 'en') {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const p = project(d), dir = join(d, `content/films/${slug}`), film = json(join(dir, 'film.json'))
		writeFileSync(join(dir, `voice/${locale}.json`), JSON.stringify(film.scenes.map((s) => ({ scene: s.id, text: 'Line.' }))))
		const takes = p.prod(slug, locale, 'takes')
		mkdirSync(takes, { recursive: true })
		film.scenes.forEach((s, i) => writeFileSync(join(takes, `take-${String(i + 1).padStart(2, '0')}.wav`), s.id))
		const len = (f) => (typeof seconds === 'function' ? seconds(readFileSync(f, 'utf-8')) : seconds)
		return { d, p, dir, film, len }
	}
	const up = (v) => Math.ceil(v * 10 - 1e-9) / 10
	const settleOf = (dir, id, locale = 'en') =>
		up(motionEnd(localizeScene(json(join(dir, `scene-${id}.json`)), json(join(dir, `strings/${locale}.json`)))))

	it('a short take ends its scene with the voice, but never before the last movement', () => {
		const { p, dir, film, len } = narrated(1)
		const r = fit(p, slug, { locale: 'en', length: len })
		const need = up(0.6 + 1 + 1.2)
		for (const [i, s] of film.scenes.entries())
			expect(r.rows[i].runs, s.id).toBe(Math.min(s.dur, Math.max(settleOf(dir, s.id), need)))
		expect(r.rows.some((x) => x.runs < x.design)).toBe(true)
		const tm = json(join(dir, 'timing.en.json')).scenes
		for (const x of r.rows) expect(tm[x.scene]?.dur, x.scene).toBe(x.runs < x.design ? x.runs : undefined)
	})

	it('a scene without narration keeps its design time', () => {
		const { p, film, len } = narrated((id) => (id === 'hook' ? 0 : 1))
		const r = fit(p, slug, { locale: 'en', length: len })
		expect(r.rows[0]).toMatchObject({ scene: 'hook', runs: film.scenes[0].dur })
	})

	it('film.json "settle" says when a scene\'s motion is over (JS scenes have no tracks to read)', () => {
		const { p, dir, film, len } = narrated(1)
		film.scenes[0].settle = 4.25
		writeFileSync(join(dir, 'film.json'), JSON.stringify(film))
		expect(fit(p, slug, { locale: 'en', length: len }).rows[0].runs).toBe(4.3)
	})

	it('the build and the chapters run each scene for its fitted time', () => {
		const { d, p, dir, film, len } = narrated(1)
		fit(p, slug, { locale: 'en', length: len })
		const tm = json(join(dir, 'timing.en.json')).scenes
		const short = film.scenes.find((s) => tm[s.id]?.dur < s.dur)
		const plan = buildPlan(film, tm, new Map(), { lead: 0.6, tail: 1.2 })
		expect(plan.rows.find((r) => r.id === short.id).dur).toBe(tm[short.id].dur)
		expect(scenePlan(p, slug, 'en').find((r) => r.id === short.id).dur).toBe(tm[short.id].dur)
		expect(d).toBeTruthy()
	})
})

// A miniature of the sensei-hq.com website's layout (issue #1, gap 4): films in src/lib/motion/films with base.css,
// articles flat in src/lib/content/articles with title/dek in the index, narration and takes in films/<slug>/.
function website() {
	const w = tmp(), put = (rel, text) => { mkdirSync(join(w, rel, '..'), { recursive: true }); writeFileSync(join(w, rel), text) }
	const F = 'src/lib/motion/films/demo'
	put(`${F}/film.json`, JSON.stringify({ title: 'Demo', background: '#F3F0E9', scenes: [{ id: 'hook', name: 'Hook', dur: 6 }, { id: 'close', name: 'Close', dur: 5 }] }))
	put(`${F}/base.css`, '#stage { --ground:#fff }')
	put(`${F}/shared.js`, 'window.W = {};')
	put(`${F}/scene-hook.js`, 'kit.scene("hook", { render() {} });')
	put(`${F}/scene-close.js`, 'kit.scene("close", { render() {} });')
	put(`${F}/score.js`, 'export default {};')
	put(`${F}/timing.json`, JSON.stringify({ scenes: { hook: { dur: 6.5 } } }))
	put('src/lib/motion/logos/brand.svg', '<svg/>')
	put('src/lib/content/articles/index.json', JSON.stringify([{ slug: 'demo', title: 'Demo story', dek: 'What the reader gets.', kanji: '守', kanjiGloss: 'Mamoru · to protect', series: 'Explainer films', app: 'practice', tags: ['a'], publish_date: '2026-01-02', minutes: 4, social: { youtube: '' } }]))
	put('src/lib/content/articles/demo.json', JSON.stringify({ sections: [{ id: 'hook', title: 'Hook', body: ['x'] }], takeaway: 'Pause.' }))
	put('films/demo/film.json', JSON.stringify({ slug: 'demo', scenes: [{ id: 'hook', text: 'Hello.', say: null, take: 'take-01' }, { id: 'close', text: 'Bye.', say: 'Bye!', take: 'take-02' }] }))
	put('films/demo/takes/take-01.wav', 'RIFF1')
	put('films/demo/takes/take-02.wav', 'RIFF2')
	return w
}

describe('migrate', () => {
	it('moves the website layout into content/ and production/, and the result validates', () => {
		const w = website(), d = tmp()
		init({ cwd: d, framework: 'vanilla', sample: false })
		const r = migrate(project(d), w)
		const film = join(d, 'content/films/demo')
		expect(readFileSync(join(film, 'look.css'), 'utf-8')).toBe('#stage { --ground:#fff }')
		expect(existsSync(join(film, 'base.css'))).toBe(false)
		for (const f of ['film.json', 'shared.js', 'scene-hook.js', 'scene-close.js', 'score.js', 'timing.json']) expect(existsSync(join(film, f)), f).toBe(true)
		expect(existsSync(join(d, 'content/logos/brand.svg'))).toBe(true)
		const [entry] = json(join(d, 'content/stories/index.json'))
		expect(entry).toMatchObject({ slug: 'demo', kanji: '守', app: 'practice', publish_date: '2026-01-02', minutes: 4 })
		for (const k of ['title', 'dek', 'kanjiGloss', 'series']) expect(entry, k).not.toHaveProperty(k)
		expect(json(join(d, 'content/stories/en/demo.json'))).toMatchObject({ title: 'Demo story', dek: 'What the reader gets.', kanjiGloss: 'Mamoru · to protect', series: 'Explainer films', takeaway: 'Pause.' })
		expect(json(join(film, 'voice/en.json'))).toEqual([{ scene: 'hook', text: 'Hello.', say: null }, { scene: 'close', text: 'Bye.', say: 'Bye!' }])
		expect(readFileSync(join(d, 'production/demo/en/takes/take-02.wav'), 'utf-8')).toBe('RIFF2')
		expect(r.wrote.length).toBeGreaterThan(5)
		const v = validate(project(d))
		expect(v.problems, v.lines.join('\n')).toBe(0)
	})
	it('never overwrites: a second run keeps what is there', () => {
		const w = website(), d = tmp()
		init({ cwd: d, framework: 'vanilla', sample: false })
		migrate(project(d), w)
		writeFileSync(join(d, 'content/films/demo/look.css'), 'mine')
		const r = migrate(project(d), w)
		expect(readFileSync(join(d, 'content/films/demo/look.css'), 'utf-8')).toBe('mine')
		expect(r.kept).toContain('content/films/demo/look.css')
		expect(r.wrote).toEqual([])
	})
	it('refuses a folder that is not the website', () => expect(() => migrate(project(tmp()), tmp())).toThrow(MotionError))
	it('migrates a partial site: articles only, a missing body, takes for a film it did not move, an existing site.json', () => {
		const w = tmp(), d = tmp()
		const put = (root, rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text) }
		put(w, 'src/lib/content/articles/index.json', JSON.stringify([{ slug: 'a', title: 'A', tags: [] }, { slug: 'gone', title: 'Gone' }]))
		put(w, 'src/lib/content/articles/a.json', JSON.stringify({ sections: [] }))
		put(w, 'films/a/film.json', JSON.stringify({ scenes: [{ id: 'hook' }] }))
		put(w, 'films/a/takes/take-01.wav', 'RIFF')
		put(w, 'films/a/takes/notes.txt', 'x')
		put(w, 'films/b/film.json', JSON.stringify({}))
		put(w, 'films/b/takes/take-01.wav', 'RIFFB')
		put(w, 'films/stray/readme.md', 'no film.json')
		put(d, 'content/site.json', JSON.stringify({ name: 'Mine', url: '', locales: ['es'], defaultLocale: 'es' }))
		const r = migrate(project(d), w, { locale: 'es' })
		expect(json(join(d, 'content/stories/index.json'))).toEqual([{ slug: 'a', tags: [] }, { slug: 'gone' }])
		expect(json(join(d, 'content/stories/es/a.json'))).toEqual({ title: 'A', sections: [] })
		expect(existsSync(join(d, 'content/stories/es/gone.json'))).toBe(false)
		expect(existsSync(join(d, 'content/films/a/voice/es.json'))).toBe(false)
		expect(readFileSync(join(d, 'production/a/es/takes/take-01.wav'), 'utf-8')).toBe('RIFF')
		expect(existsSync(join(d, 'production/a/es/takes/notes.txt'))).toBe(false)
		expect(readFileSync(join(d, 'production/b/es/takes/take-01.wav'), 'utf-8')).toBe('RIFFB')
		expect(existsSync(join(d, 'production/stray'))).toBe(false)
		expect(json(join(d, 'content/site.json')).name).toBe('Mine')
		expect(r).toEqual({
			wrote: ['content/stories/index.json', 'content/stories/es/a.json', 'production/a/es/takes/take-01.wav', 'production/b/es/takes/take-01.wav'],
			kept: []
		})
	})
	it('migrates a site with films and logos but no articles, and writes a site.json', () => {
		const w = tmp(), d = tmp()
		const put = (rel, text) => { mkdirSync(join(w, rel, '..'), { recursive: true }); writeFileSync(join(w, rel), text) }
		put('src/lib/motion/films/x/film.json', JSON.stringify({ scenes: [] }))
		put('src/lib/motion/films/x/assets/pic.svg', '<svg/>')
		put('src/lib/motion/films/notafilm/base.css', 'x')
		const r = migrate(project(d), w, { locale: 'fr' })
		expect(readFileSync(join(d, 'content/films/x/assets/pic.svg'), 'utf-8')).toBe('<svg/>')
		expect(existsSync(join(d, 'content/films/notafilm'))).toBe(false)
		expect(existsSync(join(d, 'content/logos'))).toBe(false)
		expect(json(join(d, 'content/site.json'))).toEqual({ name: '', url: '', locales: ['fr'], defaultLocale: 'fr' })
		expect(r.wrote).toEqual(['content/films/x/assets/pic.svg', 'content/films/x/film.json', 'content/site.json'])
	})
	it('validate counts an explicit figure as a figure, and lets a film that names its cover end on any scene', () => {
		const w = website(), d = tmp()
		init({ cwd: d, framework: 'vanilla', sample: false })
		migrate(project(d), w)
		const body = join(d, 'content/stories/en/demo.json'), b = json(body)
		b.sections.push({ id: 'pillars', title: 'Pillars', body: ['y'], figure: 'pillars' })
		writeFileSync(body, JSON.stringify(b))
		const filmPath = join(d, 'content/films/demo/film.json'), f = json(filmPath)
		f.scenes.reverse()
		writeFileSync(filmPath, JSON.stringify(f))
		expect(validate(project(d)).lines.join('\n')).toMatch(/last scene should be "close"/)
		f.cover = { scene: 'close' }
		writeFileSync(filmPath, JSON.stringify(f))
		const r = validate(project(d))
		expect(r.lines.join('\n')).not.toMatch(/last scene should be "close"|section pillars/)
	})
})

