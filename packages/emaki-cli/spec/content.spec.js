// The content contracts where the project leaves things out: no films or stories folder yet, a story without its body,
// film, title or tags, a site without a url, a day script without the labels asked for, a migrated film whose
// narration has gaps, init for each framework, and the YouTube words for a film shorter than one chapter.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
	chapters, init, mergeDescription, migrate, newFilm, project as load, recordLinks, scenePlan, storyFor, storyUrl, validate,
	validateStory, MotionError
} from '../src/api.js'
import { campaignDir, channelCopy, field, topicOf } from '../src/day-script.js'
import { filmSlugs } from '../src/films.js'
import { json, put, tmp } from './helpers.js'

/** A project folder with only the given files. */
function bare(files = {}) {
	const d = tmp()
	for (const [rel, data] of Object.entries(files)) put(d, rel, data)
	return d
}

describe('the project', () => {
	it('names its own root "." and refuses a film it does not have', () => {
		const p = load(bare())
		expect(p.rel(p.root)).toBe('.')
		expect(() => p.filmDir('ghost')).toThrow(/no film "ghost" in content\/films\//)
	})
})

describe('films and stories with parts missing', () => {
	it('finds no films and no problems in a project with no content yet', () => {
		const p = load(bare())
		expect(filmSlugs(p)).toEqual([])
		expect(validate(p)).toEqual({ lines: [], problems: 0 })
	})

	it('refuses a slug that is not lower-case letters, digits and dashes', () => {
		expect(() => newFilm(load(bare()), 'Bad Slug')).toThrow(MotionError)
	})

	it('starts the stories index when the first film is scaffolded', () => {
		const d = bare()
		newFilm(load(d), 'first', { date: '2026-01-02' })
		expect(json(join(d, 'content/stories/index.json'))).toEqual([{ slug: 'first', publish_date: '2026-01-02', kind: 'film', tags: [], minutes: 4 }])
	})

	it('asks a film story without sections for them, and a story without a publish date for one', () => {
		const d = bare({
			'content/films/f/film.json': { title: 'F', scenes: [{ id: 'hook', dur: 5 }] },
			'content/stories/en/f.json': { title: 'F', dek: 'D', takeaway: 'T' }
		})
		expect(validateStory(load(d), { slug: 'f' })).toEqual(['publish_date must be YYYY-MM-DD', 'en: sections is empty'])
	})
})

describe('a story as the media pipeline reads it', () => {
	it('refuses a story when there is no stories index at all', () => {
		expect(() => storyFor(load(bare()), 'x', 'en')).toThrow(/x is not in content\/stories\/index\.json/)
	})

	it('falls back to the entry, then the film, then the slug for the title; to an empty dek and no tags', () => {
		const d = bare({ 'content/stories/index.json': [{ slug: 'a', title: 'Entry title', dek: 'Entry dek' }, { slug: 'b' }, { slug: 'c' }] })
		put(d, 'content/films/b/film.json', { title: 'Film title', scenes: [] })
		const p = load(d)
		expect(storyFor(p, 'a', 'en')).toMatchObject({ title: 'Entry title', dek: 'Entry dek', tags: [] })
		expect(storyFor(p, 'b', 'en')).toMatchObject({ title: 'Film title', dek: '' })
		expect(storyFor(p, 'c', 'en')).toMatchObject({ title: 'c', dek: '' })
	})

	it('links a story at {url}/{locale}/stories/{slug} by default, and without a site url from the root', () => {
		expect(storyUrl(load(bare({ 'content/site.json': { url: 'https://s.example/', locales: ['en'], defaultLocale: 'en' } })), 'a', 'en')).toBe('https://s.example/en/stories/a')
		expect(storyUrl(load(bare()), 'a', 'es')).toBe('/es/stories/a')
	})

	it('refuses to record links for a piece the index does not have, and links a Short\'s id as /shorts/', () => {
		const d = bare({ 'content/stories/index.json': [{ slug: 's', video: 'short' }] })
		const p = load(d)
		expect(() => recordLinks(p, 'ghost', { x: 'https://x.com/1' })).toThrow(/ghost is not in/)
		expect(recordLinks(p, 's', { youtube: 'abc' })).toMatchObject({ youtube: 'abc', social: { youtube: 'https://www.youtube.com/shorts/abc' } })
	})
})

describe('the YouTube words', () => {
	it('makes one chapter of a film shorter than ten seconds', () => {
		expect(chapters([{ at: 0, dur: 3, name: 'A' }, { at: 3, dur: 4, name: 'B' }])).toEqual([[0, 'A + B']])
	})

	it('names a scene by its id when it has no name, and reads a timing file without scenes as no timing', () => {
		const d = bare({ 'content/films/f/film.json': { scenes: [{ id: 'hook', dur: 4 }] }, 'content/films/f/timing.en.json': {} })
		expect(scenePlan(load(d), 'f', 'en')).toEqual([{ id: 'hook', name: 'hook', at: 0, dur: 4 }])
	})

	it('prepends our text to nothing when the video has no description yet', () => {
		expect(mergeDescription(undefined, 'Ours\n')).toBe('Ours\n')
		expect(mergeDescription('Ours\n\n---\n\nTheirs', 'Ours')).toBe('Ours\n\n---\n\nTheirs\n')
	})
})

describe('a day script with labels left out', () => {
	it('reads the campaign folder as campaign/ when the config names none', () => {
		const p = load(bare())
		expect(campaignDir(p)).toBe(join(p.root, 'campaign'))
	})

	it('gives an empty field, thread and topic for a script that has none', () => {
		const md = '# A plain heading\n\n**Caption:** Hello\n'
		expect(field(md, 'Title', 'YouTube title')).toBe('')
		expect(channelCopy(md)).toEqual({ youtube: { title: '', description: '', tags: [] }, caption: 'Hello', x: { text: '', thread: [] } })
		expect(topicOf(md)).toBe('')
	})
})

describe('init for each framework', () => {
	it('writes src/emaki-source.ts for Svelte, React and Vue, and nothing of its own for Nuxt', () => {
		for (const fw of ['svelte', 'react', 'vue']) {
			const d = tmp()
			expect(init({ cwd: d, framework: fw, sample: false }).wrote, fw).toContain('src/emaki-source.ts')
		}
		const d = tmp()
		expect(init({ cwd: d, framework: 'nuxt', sample: false }).wrote).toEqual(['emaki.config.json', '.gitignore (production/)'])
	})

	it('adds production/ on a line of its own to a .gitignore that does not end in a newline', () => {
		const d = tmp()
		writeFileSync(join(d, '.gitignore'), 'node_modules')
		init({ cwd: d, framework: 'vanilla', sample: false })
		expect(readFileSync(join(d, '.gitignore'), 'utf-8')).toBe('node_modules\n# motion stories: takes, renders, sheets (never deployed)\nproduction/\n')
	})
})

describe('migrate with gaps in the narration', () => {
	it('writes an empty line and no say for a scene without them, and copies no takes when there are none', () => {
		const d = tmp(), w = tmp()
		put(w, 'src/lib/motion/films/f/film.json', { title: 'F', scenes: [{ id: 'hook', dur: 5 }] })
		put(w, 'films/f/film.json', { scenes: [{ id: 'hook' }] })
		const r = migrate(load(d), w)
		expect(json(join(d, 'content/films/f/voice/en.json'))).toEqual([{ scene: 'hook', text: '', say: null }])
		expect(r.wrote.some((f) => f.includes('takes'))).toBe(false)
	})
})
