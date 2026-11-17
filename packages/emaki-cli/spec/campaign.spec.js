// emaki campaign status | shortfilm | posted | due | calendar: the daily series from the command line. Ported from
// films/tools/campaign.py. The campaign folder is emaki.config.json "campaign" (the specs use films/campaign).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calendarRows, campaignCalendar, campaignDue, campaignPosted, campaignStatus, newFilm, parseCsv, project as load, shortFilm, todayIn, validate } from '../src/api.js'
import { DAY, json, project, put } from './helpers.js'

const WEBSITE_CSV = `date,product,theme,title,status,script
2026-11-16,DBD,DBD week,"Your database deserves version control, too",expanded,days/day-01-demo.md
2026-11-17,DBD,DBD week,The file path is the entity name,planned,
2026-11-23,Rokkit,Rokkit week,"Say ""fast"" again",planned,
`
function campaign() {
	const d = project()
	put(d, 'films/campaign/calendar.csv', WEBSITE_CSV)
	put(d, 'films/campaign/days/day-01-demo.md', DAY)
	put(d, 'films/campaign/carousels/demo/slide-01.png', 'PNG')
	put(d, 'production/demo/en/takes/take-01.wav', 'RIFF')
	return d
}

describe('calendar', () => {
	it('parses CSV with quoted commas and doubled quotes', () => {
		expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n1,\n')).toEqual([{ a: 'x, y', b: 'say "hi"' }, { a: '1', b: '' }])
	})
	it('parses CSV edge cases: lone CR, blank lines, short rows, quoted newlines, no final newline', () => {
		expect(parseCsv(' a ,b\r1,2\n\n,\n3\n"multi\nline",x"y,z"w\n4,5')).toEqual([
			{ a: '1', b: '2' }, { a: '3', b: '' }, { a: 'multi\nline', b: 'xy,zw' }, { a: '4', b: '5' }
		])
		expect(parseCsv('')).toEqual([])
		expect(parseCsv('a,b')).toEqual([])
		expect(parseCsv('a\n""')).toEqual([])
	})
	it('reads the website\'s columns and the plugin template\'s alike', () => {
		const d = campaign()
		const rows = calendarRows(load(d))
		expect(rows[0]).toMatchObject({ date: '2026-11-16', topic: 'DBD', theme: 'DBD week', title: 'Your database deserves version control, too', slug: 'demo', script: join(d, 'films/campaign/days/day-01-demo.md') })
		expect(rows[1]).toMatchObject({ slug: null, script: null })
		put(d, 'films/campaign/calendar.csv', 'date,day,slug,topic,title,hook,format,status,notes\n2026-12-01,1,demo,Data,Example,Hook?,short,planned,\n2026-12-02,2,later,Data,Later,,short,planned,\n')
		const t = calendarRows(load(d))
		expect(t[0]).toMatchObject({ date: '2026-12-01', topic: 'Data', slug: 'demo', script: join(d, 'films/campaign/days/day-01-demo.md') })
		expect(t[1]).toMatchObject({ slug: 'later', script: null })
	})
	it('today is the site\'s day, in its time zone', () => {
		expect(todayIn('America/Chicago', new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-16')
		expect(todayIn('UTC', new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-17')
	})
})

describe('status and due', () => {
	it('status: what is due from a date, and for each day what exists', () => {
		const d = campaign()
		put(d, 'films/campaign/published.json', { demo: { youtube: 'abc', updated: '2026-11-16' } })
		const rows = campaignStatus(load(d), { from: '2026-11-16', days: 2 })
		expect(rows).toEqual([
			{ date: '2026-11-16', topic: 'DBD', title: 'Your database deserves version control, too', slug: 'demo', story: true, script: true, film: true, takes: 1, render: false, built: true, carousel: 1, posts: { youtube: true, instagram: false, x: false } },
			{ date: '2026-11-17', topic: 'DBD', title: 'The file path is the entity name', slug: null, story: false, script: false, film: false, takes: 0, render: false, built: false, carousel: 0, posts: { youtube: false, instagram: false, x: false } }
		])
	})
	it('due: one day\'s piece as JSON, for automation; nothing scheduled is an error', () => {
		const d = campaign()
		expect(campaignDue(load(d), { date: '2026-11-16' })).toEqual({
			date: '2026-11-16', topic: 'DBD', title: 'Your database deserves version control, too', slug: 'demo',
			script: 'films/campaign/days/day-01-demo.md', story: 'https://site.example/articles/demo',
			short: 'production/demo/en/out/demo-en-9x16.mp4', carousel: 'films/campaign/carousels/demo', posted: {}
		})
		expect(campaignDue(load(d), { date: '2026-11-17' })).toMatchObject({ slug: null, script: null, story: null })
		expect(() => campaignDue(load(d), { date: '2027-01-01' })).toThrow(/nothing scheduled on 2027-01-01/)
	})
})

describe('posted', () => {
	it('records where a piece went, in the ledger and in the story\'s social links', () => {
		const d = campaign()
		campaignPosted(load(d), 'demo', { youtube: 'vid1', instagram: 'https://www.instagram.com/p/1/' }, { today: '2026-11-16' })
		expect(json(join(d, 'films/campaign/published.json'))).toEqual({ demo: { youtube: 'vid1', instagram: 'https://www.instagram.com/p/1/', updated: '2026-11-16' } })
		expect(json(join(d, 'content/stories/index.json'))[0].social).toEqual({ youtube: 'https://www.youtube.com/watch?v=vid1', instagram: 'https://www.instagram.com/p/1/' })
		campaignPosted(load(d), 'demo', { x: 'https://x.com/i/web/status/9', instagram: 'https://www.instagram.com/p/2/' }, { today: '2026-11-17' })
		expect(json(join(d, 'films/campaign/published.json')).demo).toEqual({ youtube: 'vid1', instagram: 'https://www.instagram.com/p/2/', x: 'https://x.com/i/web/status/9', updated: '2026-11-17' })
		expect(json(join(d, 'content/stories/index.json'))[0].social.instagram).toBe('https://www.instagram.com/p/2/') // an explicit record replaces
	})
	it('a Short\'s YouTube id links /shorts/', () => {
		const d = campaign()
		put(d, 'content/stories/index.json', [{ slug: 'demo', publish_date: '2026-11-16', tags: [], video: 'short' }])
		campaignPosted(load(d), 'demo', { youtube: 'sh1' }, { today: '2026-11-16' })
		expect(json(join(d, 'content/stories/index.json'))[0].social.youtube).toBe('https://www.youtube.com/shorts/sh1')
	})
	it('refuses an unknown piece, or nothing to record', () => {
		expect(() => campaignPosted(load(campaign()), 'nope', { x: 'u' })).toThrow(/nope is not in content\/stories\/index\.json/)
		expect(() => campaignPosted(load(campaign()), 'demo', {})).toThrow(/nothing to record/)
	})
})

describe('shortfilm', () => {
	function daily() {
		const d = campaign()
		put(d, 'content/stories/index.json', [{ slug: 'demo', publish_date: '2026-11-16', tags: [] }, { slug: 'daily', publish_date: '2026-11-17', tags: ['x'], video: 'short' }])
		put(d, 'content/stories/en/daily.json', { title: 'Daily', dek: 'Kept.', sections: [] })
		put(d, 'films/campaign/days/day-02-daily.md', DAY)
		return d
	}
	it('sets up the Short\'s film from the day script\'s voiceover table, one scene per beat', () => {
		const d = daily()
		const r = shortFilm(load(d), 'daily')
		const film = json(join(d, 'content/films/daily/film.json'))
		expect(film.title).toBe('Your database deserves version control too')
		expect(film.scenes.map((s) => [s.id, s.name, s.dur])).toEqual([['beat-1', 'Hook: question over a messy console', 6], ['close', 'End card', 6]])
		expect(json(join(d, 'content/films/daily/voice/en.json'))).toEqual([
			{ scene: 'beat-1', text: 'Where does your database schema actually live?', say: null },
			{ scene: 'close', text: 'dbd: schema design that lives in your terminal.', say: null }
		])
		expect(r).toMatchObject({ slug: 'daily', scenes: 2 })
		const index = json(join(d, 'content/stories/index.json'))
		expect(index.filter((e) => e.slug === 'daily')).toEqual([{ slug: 'daily', publish_date: '2026-11-17', tags: ['x'], video: 'short' }])
		expect(json(join(d, 'content/stories/en/daily.json')).dek).toBe('Kept.')
		expect(validate(load(d), 'daily').lines.join('\n')).not.toMatch(/voice\/en\.json|scene-/)
	})
	it('uses the on-screen column as the scene id when it is one (the plugin template)', () => {
		const d = daily()
		put(d, 'films/campaign/days/day-02-daily.md', DAY.replace('Hook: question over a messy console', 'hook').replace('| End card |', '| close |'))
		shortFilm(load(d), 'daily')
		expect(json(join(d, 'content/films/daily/film.json')).scenes.map((s) => s.id)).toEqual(['hook', 'close'])
	})
	it('refuses a piece with no day script or no voiceover table, and never touches an existing film', () => {
		const d = daily()
		expect(() => shortFilm(load(d), 'nope')).toThrow(/no day script for nope/)
		expect(() => shortFilm(load(d), 'demo')).toThrow(/content\/films\/demo already exists/)
		put(d, 'films/campaign/days/day-03-empty.md', '# Day 03 · x · y: z\n')
		expect(() => shortFilm(load(d), 'empty')).toThrow(/no voiceover table/)
		expect(existsSync(join(d, 'content/films/empty'))).toBe(false)
	})
})

describe('newFilm for a story that exists', () => {
	it('keeps the index entry and the story body', () => {
		const d = campaign()
		newFilm(load(d), 'other', { scenes: 'hook' })
		const before = json(join(d, 'content/stories/index.json')).length
		put(d, 'content/stories/en/third.json', { title: 'Third', dek: 'Mine.' })
		const ip = join(d, 'content/stories/index.json'), idx = json(ip)
		idx.push({ slug: 'third', publish_date: '2026-12-01', tags: [] })
		put(d, 'content/stories/index.json', idx)
		newFilm(load(d), 'third', { scenes: 'hook' })
		expect(json(ip).filter((e) => e.slug === 'third')).toHaveLength(1)
		expect(json(ip)).toHaveLength(before + 1)
		expect(json(join(d, 'content/stories/en/third.json'))).toEqual({ title: 'Third', dek: 'Mine.' })
	})
})

describe('calendar file', () => {
	it('rewrites CALENDAR.md from calendar.csv, a section per week, with script links', () => {
		const d = campaign()
		const r = campaignCalendar(load(d))
		const md = readFileSync(join(d, 'films/campaign/CALENDAR.md'), 'utf-8')
		expect(r).toEqual({ path: 'films/campaign/CALENDAR.md', days: 3 })
		expect(md).toMatch(/^# Campaign calendar\n\n3 days, 2026-11-16 → 2026-11-23\. Expanded: 1\./)
		expect(md).toContain('## Week 1 · 2026-11-16 · DBD: DBD week')
		expect(md).toContain('| Mon Nov 16 | Your database deserves version control, too | [script](days/day-01-demo.md) |')
		expect(md).toContain('| Tue Nov 17 | The file path is the entity name |  |')
		expect(md).toContain('## Week 2 · 2026-11-23 · Rokkit: Rokkit week')
		expect(md).toContain('| Mon Nov 23 | Say "fast" again |  |')
	})
})
