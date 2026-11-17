// emaki carousel <slug…> | --all: a day's Instagram carousel (1080×1350 PNGs) from its day script, for `emaki stage`.
// Ported from films/tools/carousel.py. The browser is injected here (`open`), so no Chromium is needed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carousel, carouselSlides, project as load, slideHtml } from '../src/api.js'
import { DAY, project, put } from './helpers.js'

/** A fake browser: each "screenshot" writes the HTML it was given. */
const fakeBrowser = () => {
	const shots = []
	return { shots, open: async () => ({ shoot: async (html, file) => { shots.push(file); writeFileSync(file, html) }, close: async () => { shots.push('closed') } }) }
}
const day = () => { const d = project(); put(d, 'films/campaign/days/day-01-demo.md', DAY); return d }

describe('carousel', () => {
	it('reads the slides and the topic from the day script', () => {
		expect(carouselSlides(load(day()), 'demo')).toEqual({
			topic: 'DBD',
			slides: ['Your database deserves version control too', 'Code: in git. Schema: scripts, consoles, memory.', 'dbd · open source · Rust CLI']
		})
	})

	it('lays out each slide: the first large with the bar, a counter, swipe until the last, text escaped', () => {
		const p = load(day())
		const first = slideHtml(p, 'Hook <b>', 1, 3, 'DBD')
		expect(first).toContain('class="first"')
		expect(first).toContain('font-size:92px')
		expect(first).toContain('<div class="bar"></div>')
		expect(first).toContain('1 / 3')
		expect(first).toContain('Hook &lt;b&gt;')
		expect(first).toContain('Swipe →')
		expect(first).toContain('site.example') // the footer defaults to the site's address
		const mid = slideHtml(p, 'x'.repeat(80), 2, 3, 'DBD')
		expect(mid).toContain('font-size:60px')
		expect(mid).not.toContain('<div class="bar"></div>')
		expect(slideHtml(p, 'short', 2, 3, 'DBD')).toContain('font-size:72px')
		expect(slideHtml(p, 'y'.repeat(120), 3, 3, 'DBD')).toContain('font-size:50px')
		expect(slideHtml(p, 'end', 3, 3, 'DBD')).toContain('Full story: link in bio')
	})

	it('takes the mark per topic, the footer and the closing line from emaki.config.json "carousel"', () => {
		const d = day()
		put(d, 'emaki.config.json', { campaign: 'films/campaign', carousel: { marks: { DBD: '構' }, mark: '整', footer: 'sensei-hq.com/articles', last: 'Full article: link in bio' } })
		const p = load(d)
		const html = slideHtml(p, 'end', 3, 3, 'DBD')
		expect(html).toContain('<div class="k">構</div>')
		expect(html).toContain('sensei-hq.com/articles')
		expect(html).toContain('Full article: link in bio')
		expect(slideHtml(p, 'x', 1, 3, 'Other')).toContain('<div class="k">整</div>')
	})

	it('a template file of its own replaces the built-in look', () => {
		const d = day()
		put(d, 'emaki.config.json', { campaign: 'films/campaign', carousel: { template: 'brand/slide.html' } })
		put(d, 'brand/slide.html', '<p>{i}/{total} {topic}: {text} ({size})</p>')
		expect(slideHtml(load(d), 'Hi & bye', 2, 3, 'DBD')).toBe('<p>2/3 DBD: Hi &amp; bye (72)</p>')
	})

	it('writes slide-01.png … into <campaign>/carousels/<slug>/, one browser for every slug', async () => {
		const d = day(), b = fakeBrowser()
		put(d, 'films/campaign/days/day-02-second.md', DAY)
		const r = await carousel(load(d), ['demo', 'second'], { open: b.open, log: () => {} })
		expect(r).toEqual([{ slug: 'demo', slides: 3, dir: 'films/campaign/carousels/demo' }, { slug: 'second', slides: 3, dir: 'films/campaign/carousels/second' }])
		expect(b.shots.map((f) => f.replace(d + '/', ''))).toEqual([
			'films/campaign/carousels/demo/slide-01.png', 'films/campaign/carousels/demo/slide-02.png', 'films/campaign/carousels/demo/slide-03.png',
			'films/campaign/carousels/second/slide-01.png', 'films/campaign/carousels/second/slide-02.png', 'films/campaign/carousels/second/slide-03.png',
			'closed'
		])
		expect(readFileSync(join(d, 'films/campaign/carousels/demo/slide-03.png'), 'utf-8')).toContain('dbd · open source · Rust CLI')
	})

	it('--all renders every day script; a slug without a script or without slides is refused before the browser opens', async () => {
		const d = day(), b = fakeBrowser()
		expect((await carousel(load(d), [], { all: true, open: b.open, log: () => {} })).map((r) => r.slug)).toEqual(['demo'])
		const b2 = fakeBrowser()
		await expect(carousel(load(d), ['nope'], { open: b2.open })).rejects.toThrow(/no day script for nope/)
		put(d, 'films/campaign/days/day-03-bare.md', '# Day 03 · Tue · DBD: Bare\n')
		await expect(carousel(load(d), ['bare'], { open: b2.open })).rejects.toThrow(/no carousel slides/)
		await expect(carousel(load(d), [], { open: b2.open })).rejects.toThrow(/name a slug, or --all/)
		expect(b2.shots).toEqual([])
		expect(existsSync(join(d, 'films/campaign/carousels/bare'))).toBe(false)
	})
})
