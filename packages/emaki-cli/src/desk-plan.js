// emaki stage status | requests | reply: the producing machine's side of the desk's plan. It reports each piece's
// script and what exists for it (the desk shows it beside the piece), reads the open motion requests people left on
// the desk, and answers them.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { campaignDir, dayScriptPath } from './day-script.js'
import { deskClient } from './desk-client.js'
import { filmFiles, storiesIndex } from './stories.js'
import { die, exists, load } from './util.js'

const count = (dir, test) => (exists(dir) ? readdirSync(dir).filter(test).length : 0)

/** One piece's script and production status, in the shape the desk stores (Production in @senseihq/emaki-posting). */
export function pieceStatus(p, slug, locale) {
	const film = join(p.films, slug), files = filmFiles(p, slug, locale)
	const voice = join(film, 'voice', `${locale}.json`), fj = join(film, 'film.json')
	const takesNeeded = exists(voice) ? load(voice).length : exists(fj) ? (load(fj).scenes ?? []).length : 0
	const base = { motion: exists(fj), takes: count(p.prod(slug, locale, 'takes'), (n) => /^take-\d+\.(wav|mp3|m4a|aiff)$/.test(n)), takesNeeded }
	const day = dayScriptPath(p, slug, locale)
	if (day)
		return { script: readFileSync(day, 'utf-8'), status: { ...base, short: Boolean(files.tall), carousel: count(join(campaignDir(p), 'carousels', slug), (n) => n.endsWith('.png')) } }
	const script = join(film, 'script.md')
	return { script: exists(script) ? readFileSync(script, 'utf-8') : null, status: { ...base, film: true, render: Boolean(files.wide) } }
}

/** Reports every story (or one) to the desk's plan. */
export async function productionStatus(p, slug, { locale, env = process.env, fetch = globalThis.fetch, log = console.info } = {}) {
	locale ??= p.site.defaultLocale
	const desk = deskClient(p, { env, fetch })
	const ip = storiesIndex(p)
	const slugs = (exists(ip) ? load(ip) : []).map((e) => e.slug).filter((s) => !slug || s === slug)
	if (slug && !slugs.length) die(`${slug} is not in ${p.rel(ip)}`)
	const r = await desk.production(slugs.map((s) => ({ slug: s, ...pieceStatus(p, s, locale) })))
	log(`reported ${r.saved} piece(s)`)
	return r
}

/** The open motion requests, each with its thread. */
export async function deskRequests(p, { env = process.env, fetch = globalThis.fetch, log = console.info } = {}) {
	const list = await deskClient(p, { env, fetch }).requests()
	if (!list.length) log('no open requests')
	for (const r of list) {
		log(`#${r.id} ${r.slug} · ${r.kind} · ${r.status} · ${r.author} ${String(r.at ?? '').slice(0, 16)}`)
		log(`   ${r.body}`)
		for (const t of r.thread ?? []) log(`   ↳ ${t.author}: ${t.body}`)
	}
	return list
}

/** Answers request `id`; status 'working' or 'done' moves it on the desk. */
export async function deskReply(p, id, text, { status, env = process.env, fetch = globalThis.fetch, log = console.info } = {}) {
	const n = Number(id)
	if (!Number.isInteger(n) || n <= 0) die(`request id must be a number (got "${id}")`)
	if (status && !['working', 'done'].includes(status)) die(`status must be working or done (got "${status}")`)
	await deskClient(p, { env, fetch }).reply(n, text ?? '', status)
	log('sent')
}
