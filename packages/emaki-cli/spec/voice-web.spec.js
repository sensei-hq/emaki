// emaki voice-web: the takes, encoded for the browser as content/films/<slug>/voice/<locale>/<scene>.m4a, and each
// narrated scene's voice start recorded in timing.<locale>.json, so the site plays the narration the videos carry.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { init, project, voiceWeb } from '../src/api.js'
import { webVoiceArgs } from '../src/media.js'

const dirs = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'emaki-vw-')); dirs.push(d); return d }
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }) })
const json = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const slug = 'measure-the-right-work'

/** A project whose film has takes for its first two scenes (in `locale`). */
function narrated(locale = 'en') {
	const d = tmp()
	init({ cwd: d, framework: 'vanilla' })
	const p = project(d), film = json(join(d, `content/films/${slug}/film.json`))
	writeFileSync(join(d, `content/films/${slug}/voice/${locale}.json`), JSON.stringify(film.scenes.map((s) => ({ scene: s.id, text: `Line for ${s.id}.` }))))
	const takes = p.prod(slug, locale, 'takes')
	mkdirSync(takes, { recursive: true })
	writeFileSync(join(takes, 'take-01.wav'), 'a')
	writeFileSync(join(takes, 'take-02.m4a'), 'b')
	return { d, p, film, takes }
}
const encoded = []
const encode = (src, dst) => { encoded.push([src, dst]); writeFileSync(dst, `m4a of ${src}`) }

describe('voice-web', () => {
	it('encodes each take as voice/<locale>/<scene>.m4a and records where the voice starts', () => {
		const { d, p, film, takes } = narrated()
		encoded.length = 0
		const r = voiceWeb(p, slug, { locale: 'en', encode })
		const [a, b, c] = film.scenes.map((s) => s.id)
		const out = (id) => join(d, `content/films/${slug}/voice/en/${id}.m4a`)
		expect(encoded).toEqual([[join(takes, 'take-01.wav'), out(a)], [join(takes, 'take-02.m4a'), out(b)]])
		expect(r.wrote).toEqual([`content/films/${slug}/voice/en/${a}.m4a`, `content/films/${slug}/voice/en/${b}.m4a`])
		const t = json(join(d, `content/films/${slug}/timing.en.json`)).scenes
		expect(t[a].voice).toBe(p.lead)
		expect(t[b].voice).toBe(p.lead)
		expect(t[c]?.voice).toBeUndefined()
	})

	it('keeps what fit wrote, and drops the narration of a scene whose take is gone', () => {
		const { d, p, film, takes } = narrated()
		const [a, b] = film.scenes.map((s) => s.id)
		const tp = join(d, `content/films/${slug}/timing.en.json`)
		writeFileSync(tp, JSON.stringify({ scenes: { [a]: { dur: 9, holds: [[1, 0.5]] } } }))
		voiceWeb(p, slug, { locale: 'en', encode })
		rmSync(join(takes, 'take-02.m4a'))
		const r = voiceWeb(p, slug, { locale: 'en', encode })
		expect(json(tp).scenes).toEqual({ [a]: { dur: 9, holds: [[1, 0.5]], voice: p.lead } })
		expect(existsSync(join(d, `content/films/${slug}/voice/en/${b}.m4a`))).toBe(false)
		expect(r.removed).toEqual([`content/films/${slug}/voice/en/${b}.m4a`])
	})

	it('says what to do when the locale has no takes', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		expect(() => voiceWeb(project(d), slug, { locale: 'en', encode })).toThrow(/no takes.*emaki voice/)
	})

	it('encodes mono AAC, levelled for speech, ready to stream', () => {
		const args = webVoiceArgs('in.wav', 'out.m4a')
		expect(args.slice(0, 2)).toEqual(['-y', '-v'])
		expect(args).toEqual(expect.arrayContaining(['-i', 'in.wav', '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart']))
		expect(args.join(' ')).toMatch(/loudnorm=I=-16/)
		expect(args.at(-1)).toBe('out.m4a')
	})
})

describe('the sample film', () => {
	it('ships narration in every locale it has lines for, and init copies it', () => {
		const d = tmp()
		init({ cwd: d, framework: 'vanilla' })
		const dir = join(d, `content/films/${slug}`)
		const design = Object.fromEntries(json(join(dir, 'film.json')).scenes.map((s) => [s.id, s.dur]))
		for (const locale of ['en', 'es']) {
			const lines = json(join(dir, `voice/${locale}.json`))
			const t = json(join(dir, `timing.${locale}.json`)).scenes
			for (const { scene } of lines) {
				expect(existsSync(join(dir, `voice/${locale}/${scene}.m4a`)), `${locale}/${scene}.m4a`).toBe(true)
				expect(t[scene].voice).toBeGreaterThan(0)
				expect(t[scene].dur ?? design[scene]).toBeGreaterThan(t[scene].voice)
			}
		}
	})
})

describe('init', () => {
	it('the Vite source globs the narration as URLs and the voiceover scripts as JSON', () => {
		const d = tmp()
		writeFileSync(join(d, 'package.json'), JSON.stringify({ devDependencies: { '@sveltejs/kit': '2' } }))
		init({ cwd: d })
		const src = readFileSync(join(d, 'src/lib/emaki-source.ts'), 'utf-8')
		expect(src).toContain("voice: import.meta.glob('/content/films/*/voice/*/*.m4a', { eager: true, query: '?url', import: 'default' })")
		expect(src).toContain("voiceText: import.meta.glob('/content/films/*/voice/*.json', { eager: true, import: 'default' })")
	})
})
