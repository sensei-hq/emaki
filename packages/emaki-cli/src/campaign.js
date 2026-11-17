// emaki campaign status | shortfilm | posted | due | calendar: a daily series around a theme, from the command line.
// Sources: <campaign>/calendar.csv (one row per day: the website's date,product,theme,title,status,script or the
// plugin template's date,day,slug,topic,title,…), <campaign>/days/*.md (the day scripts), content/stories/index.json
// and <campaign>/published.json (where each piece was posted). <campaign> is emaki.config.json "campaign".
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { SUFFIX } from './config.js'
import { parseCsv } from './csv.js'
import { beatsOf, campaignDir, dayScriptPath, slugOfScript } from './day-script.js'
import { newFilm } from './films.js'
import { filmFiles, recordLinks, storiesIndex, storyUrl } from './stories.js'
import { die, exists, load, save } from './util.js'

export { parseCsv }

/** Today (YYYY-MM-DD) in a time zone. */
export const todayIn = (timeZone = 'UTC', now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const siteToday = (p) => todayIn(p.site.timeZone ?? 'UTC')

/** The calendar, one normalised row per day: { date, topic, theme, title, slug, script (path or null) }. */
export function calendarRows(p, locale = p.site.defaultLocale) {
	const f = join(campaignDir(p), 'calendar.csv')
	if (!exists(f)) die(`no ${p.rel(f)}; start one from the plugin's modules/campaign/calendar.csv`)
	return parseCsv(readFileSync(f, 'utf-8')).map((r) => {
		const slug = r.slug || (r.script ? slugOfScript(r.script) : null)
		const named = r.script ? join(campaignDir(p), r.script) : null
		const script = named && exists(named) ? named : slug ? dayScriptPath(p, slug, locale) : null
		return { date: r.date, topic: r.product ?? r.topic ?? '', theme: r.theme ?? '', title: r.title ?? '', slug, script }
	})
}

const ledgerPath = (p) => join(campaignDir(p), 'published.json')
const ledger = (p) => (exists(ledgerPath(p)) ? load(ledgerPath(p)) : {})
const stories = (p) => new Set((exists(storiesIndex(p)) ? load(storiesIndex(p)) : []).map((e) => e.slug))
const pngs = (dir) => (exists(dir) ? readdirSync(dir).filter((n) => n.endsWith('.png')).length : 0)

/** What is due from a date (default today, in the site's time zone), and for each day what exists. */
export function campaignStatus(p, { from, days = 14, locale = p.site.defaultLocale } = {}) {
	from ??= siteToday(p)
	const known = stories(p), led = ledger(p)
	return calendarRows(p, locale).filter((r) => r.date >= from).slice(0, Number(days)).map((r) => {
		const s = r.slug, takes = s ? p.prod(s, locale, 'takes') : null, posted = (s && led[s]) || {}
		return {
			date: r.date, topic: r.topic, title: r.title, slug: s,
			story: Boolean(s && known.has(s)), script: Boolean(r.script),
			film: Boolean(s && exists(join(p.films, s, 'film.json'))),
			takes: takes && exists(takes) ? readdirSync(takes).filter((n) => /^take-\d+\./.test(n)).length : 0,
			render: Boolean(s && exists(p.prod(s, locale, 'render', `${s}-${locale}-${SUFFIX.portrait}.mp4`))),
			built: Boolean(s && filmFiles(p, s, locale).tall),
			carousel: s ? pngs(join(campaignDir(p), 'carousels', s)) : 0,
			posts: { youtube: Boolean(posted.youtube), instagram: Boolean(posted.instagram), x: Boolean(posted.x) }
		}
	})
}

/** One day's piece as JSON, for automation (default today in the site's time zone). */
export function campaignDue(p, { date, locale = p.site.defaultLocale } = {}) {
	date ??= siteToday(p)
	const r = calendarRows(p, locale).find((x) => x.date === date)
	if (!r) die(`nothing scheduled on ${date}`)
	const s = r.slug
	return {
		date, topic: r.topic, title: r.title, slug: s,
		script: r.script ? p.rel(r.script) : null,
		story: s ? storyUrl(p, s, locale) : null,
		short: s ? p.rel(filmFiles(p, s, locale).expect.tall) : null,
		carousel: s ? p.rel(join(campaignDir(p), 'carousels', s)) : null,
		posted: (s && ledger(p)[s]) || {}
	}
}

/** Records where a piece was posted: <campaign>/published.json and the story's social links (replacing them). */
export function campaignPosted(p, slug, links = {}, { today } = {}) {
	const ip = storiesIndex(p)
	const entry = (exists(ip) ? load(ip) : []).find((e) => e.slug === slug)
	if (!entry) die(`${slug} is not in ${p.rel(ip)}`)
	const vals = Object.fromEntries(['youtube', 'instagram', 'x'].filter((k) => links[k]).map((k) => [k, links[k]]))
	if (!Object.keys(vals).length) die('nothing to record: pass --youtube ID, --instagram URL and/or --x URL')
	const led = ledger(p)
	led[slug] = { ...led[slug], ...vals, updated: today ?? siteToday(p) }
	save(ledgerPath(p), led)
	const yt = vals.youtube && !/^https?:/.test(vals.youtube)
		? (entry.video === 'short' ? `https://www.youtube.com/shorts/${vals.youtube}` : `https://www.youtube.com/watch?v=${vals.youtube}`)
		: vals.youtube
	recordLinks(p, slug, { youtube: yt, instagram: vals.instagram, x: vals.x }, { overwrite: true })
	return led[slug]
}

/**
 * Sets up a Short's film from its day script: one scene per voiceover beat (the on-screen column is the scene id when
 * it is one, else beat-N; the last beat is the close), the voice lines from the table, 6 s per scene until
 * `emaki fit` times them to the takes. An existing story keeps its index entry and body; an existing film is refused.
 */
export function shortFilm(p, slug, { locale = p.site.defaultLocale } = {}) {
	const f = dayScriptPath(p, slug, locale)
	if (!f) die(`no day script for ${slug} in ${p.rel(join(campaignDir(p), 'days'))}/`)
	if (exists(join(p.films, slug))) die(`${p.rel(join(p.films, slug))} already exists; edit its film.json and voice/${locale}.json`)
	const md = readFileSync(f, 'utf-8'), beats = beatsOf(md)
	if (!beats.length) die(`${p.rel(f)} has no voiceover table (| # | Voiceover | On screen |)`)
	const seen = new Set()
	const ids = beats.map((b, i) => {
		let id = i === beats.length - 1 ? 'close' : /^[a-z][a-z0-9-]*$/.test(b.screen) && b.screen !== 'close' ? b.screen : `beat-${b.n}`
		while (seen.has(id)) id = `${id}-${b.n}`
		seen.add(id)
		return id
	})
	const title = md.match(/^# Day \d+ · .+? · .+?: (.+)$/m)?.[1]?.trim()
	newFilm(p, slug, { scenes: ids.join(','), title })
	const fp = join(p.films, slug, 'film.json'), film = load(fp)
	film.scenes = film.scenes.map((s, i) => ({ ...s, name: beats[i].screen.slice(0, 40), dur: 6 }))
	save(fp, film)
	save(join(p.films, slug, 'voice', `${locale}.json`), beats.map((b, i) => ({ scene: ids[i], text: b.text, say: null })))
	return { slug, scenes: ids.length, path: p.rel(fp) }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}` }

/** Rewrites <campaign>/CALENDAR.md from calendar.csv: a section per week, a row per day, links to the day scripts. */
export function campaignCalendar(p) {
	const rows = calendarRows(p), dir = campaignDir(p)
	if (!rows.length) die('calendar.csv has no days')
	const t0 = Date.parse(rows[0].date + 'T00:00:00Z')
	const md = ['# Campaign calendar', '', `${rows.length} days, ${rows[0].date} → ${rows.at(-1).date}. Expanded: ${rows.filter((r) => r.script).length}. Edit calendar.csv, then \`emaki campaign calendar\` to rewrite this file.`]
	let week = 0
	for (const r of rows) {
		const wk = Math.floor((Date.parse(r.date + 'T00:00:00Z') - t0) / 86400000 / 7) + 1
		if (wk !== week) {
			week = wk
			md.push('', `## Week ${wk} · ${r.date} · ${r.topic}${r.theme ? `: ${r.theme}` : ''}`, '', '| Date | Title | |', '|---|---|---|')
		}
		md.push(`| ${dayLabel(r.date)} | ${r.title} | ${r.script ? `[script](${relative(dir, r.script)})` : ''} |`)
	}
	const out = join(dir, 'CALENDAR.md')
	writeFileSync(out, md.join('\n') + '\n')
	return { path: p.rel(out), days: rows.length }
}
