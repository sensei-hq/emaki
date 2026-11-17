// The campaign commands where the campaign folder is thin: no calendar yet or an empty one, the plugin template's
// columns (no theme, maybe no title), no stories index, carousels already rendered, a voiceover table that repeats a
// scene id, and "today" taken from the site's time zone. Also the carousel's own browser (Playwright, stubbed here).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { calendarRows, campaignCalendar, campaignDue, campaignPosted, campaignStatus, carousel, project as load, shortFilm, todayIn } from '../src/api.js'
import { DAY, json, project, put, tmp } from './helpers.js'

const browser = vi.hoisted(() => ({ shots: [], closed: 0 }))
vi.mock('../src/capture.js', () => ({
	chromium: async () => ({
		launch: async () => ({
			newPage: async ({ viewport }) => ({
				setContent: async (html) => browser.shots.push({ viewport, html }),
				screenshot: async ({ path }) => browser.shots.push({ path })
			}),
			close: async () => { browser.closed++ }
		})
	})
}))

/** A project whose campaign folder is campaign/ (the default) with only the given calendar. */
function withCalendar(csv) {
	const d = tmp()
	put(d, 'content/site.json', { url: 'https://site.example', locales: ['en'], defaultLocale: 'en' })
	if (csv !== undefined) put(d, 'campaign/calendar.csv', csv)
	return d
}

describe('the calendar', () => {
	it('says where to start one when there is none', () => {
		expect(() => calendarRows(load(withCalendar()))).toThrow(/no campaign\/calendar\.csv; start one from the plugin's modules\/campaign\/calendar\.csv/)
	})

	it('reads a calendar without topic, theme or title columns as empty text', () => {
		expect(calendarRows(load(withCalendar('date,slug\n2026-11-16,demo\n')))).toEqual([
			{ date: '2026-11-16', topic: '', theme: '', title: '', slug: 'demo', script: null }
		])
	})

	it('refuses to write CALENDAR.md from a calendar with no days', () => {
		expect(() => campaignCalendar(load(withCalendar('date,slug,topic,title\n')))).toThrow(/calendar\.csv has no days/)
	})

	it('heads a week by its topic alone when it has no theme', () => {
		const d = withCalendar('date,slug,topic,title\n2026-11-16,demo,DBD,Title\n')
		campaignCalendar(load(d))
		expect(readFileSync(join(d, 'campaign/CALENDAR.md'), 'utf-8')).toMatch(/^## Week 1 · 2026-11-16 · DBD$/m)
	})
})

describe('status, due and posted from today', () => {
	it('starts the status at today in the site\'s time zone, without a stories index, counting rendered slides', () => {
		const d = project()
		const today = todayIn('America/Chicago')
		put(d, 'films/campaign/calendar.csv', `date,slug,topic,title\n${today},demo,DBD,Title\n`)
		put(d, 'films/campaign/carousels/demo/slide-01.png', 'PNG')
		put(d, 'films/campaign/carousels/demo/slide-02.png', 'PNG')
		put(d, 'films/campaign/carousels/demo/notes.txt', 'x')
		put(d, 'content/stories/index.json', [])
		const p = load(d)
		const [row] = campaignStatus(p)
		expect(row).toMatchObject({ date: today, slug: 'demo', carousel: 2, story: false })
		expect(campaignDue(p)).toMatchObject({ date: today, slug: 'demo' })
	})

	it('reads a site without a time zone in UTC', () => {
		const d = withCalendar(`date,slug,topic,title\n${todayIn('UTC')},demo,DBD,Title\n`)
		expect(campaignStatus(load(d))).toHaveLength(1)
	})

	it('reads no stories at all when the index is missing', () => {
		const d = withCalendar(`date,slug,topic,title\n2026-11-16,demo,DBD,Title\n`)
		expect(campaignStatus(load(d), { from: '2026-11-16' })[0].story).toBe(false)
		expect(() => campaignPosted(load(d), 'demo', { x: 'https://x.com/1' })).toThrow(/demo is not in content\/stories\/index\.json/)
	})

	it('stamps a recorded post with today in the site\'s time zone', () => {
		const d = project()
		expect(campaignPosted(load(d), 'demo', { x: 'https://x.com/1' })).toEqual({ x: 'https://x.com/1', updated: todayIn('America/Chicago') })
	})
})

describe('a Short\'s film from its day script', () => {
	it('gives a repeated on-screen id the beat number, so every scene id is unique', () => {
		const d = project()
		put(d, 'films/campaign/days/day-02-twice.md', '# Day 02 · Tue Nov 17 · DBD: Twice\n\n| # | Voiceover | On screen |\n|---|---|---|\n| 1 | One. | hook |\n| 2 | Two. | hook |\n| 3 | End. | card |\n')
		put(d, 'content/stories/index.json', [])
		const p = load(d)
		expect(shortFilm(p, 'twice')).toMatchObject({ scenes: 3 })
		expect(json(join(d, 'content/films/twice/film.json')).scenes.map((s) => s.id)).toEqual(['hook', 'hook-2', 'close'])
	})
})

describe('the carousel\'s browser', () => {
	it('opens Chromium at 1080×1350, shoots each slide to its file, and closes it', async () => {
		const d = project()
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		browser.shots.length = 0
		const made = await carousel(load(d), ['demo'], { log: () => {} })
		expect(made).toEqual([{ slug: 'demo', slides: 3, dir: 'films/campaign/carousels/demo' }])
		expect(browser.shots.filter((s) => s.viewport).every((s) => s.viewport.width === 1080 && s.viewport.height === 1350)).toBe(true)
		expect(browser.shots.filter((s) => s.path).map((s) => s.path.split('/').pop())).toEqual(['slide-01.png', 'slide-02.png', 'slide-03.png'])
		expect(browser.closed).toBe(1)
	})

	it('finds no day scripts for --all when the days folder is missing', async () => {
		await expect(carousel(load(withCalendar()), [], { all: true })).rejects.toThrow(/name a slug, or --all/)
	})

	it('reads the footer as empty for a site without a url, and leaves a placeholder it does not know as written', async () => {
		const d = tmp()
		put(d, 'campaign/days/day-01-demo.md', DAY)
		put(d, 'emaki.config.json', { carousel: { template: 'slide.html' } })
		put(d, 'slide.html', '<p>{footer}|{unknown}|{text}</p>')
		browser.shots.length = 0
		await carousel(load(d), ['demo'], { log: () => {} })
		expect(browser.shots.find((s) => s.html).html).toBe('<p>|{unknown}|Your database deserves version control too</p>')
	})
})
