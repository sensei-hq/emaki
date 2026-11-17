// Shared by the media-pipeline specs: a throwaway emaki project with one film and its story, and a fake fetch that
// records every request and answers from a handler. No real network, no ffmpeg, no browser.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const dirs = []
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }) })
export const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'emaki-pipe-')); dirs.push(d); return d }
export const json = (p) => JSON.parse(readFileSync(p, 'utf-8'))
export const sha = (b) => createHash('sha256').update(b).digest('hex')
export function put(root, rel, data) {
	mkdirSync(join(root, rel, '..'), { recursive: true })
	writeFileSync(join(root, rel), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 1))
}

/** The credentials the specs pass in; never real, and asserted never to reach a log line or an error. */
export const ENV = {
	ADMIN_ORIGIN: 'https://desk.example',
	STAGER_CLIENT_ID: 'stager-id.access', STAGER_CLIENT_SECRET: 'stager-secret-zzz',
	MEDIA_URL_SECRET: 'media-secret-zzz',
	YT_CLIENT_ID: 'yt-client', YT_CLIENT_SECRET: 'yt-secret-zzz', YT_REFRESH_TOKEN: 'yt-refresh-zzz',
	IG_USER_ID: '1789', IG_ACCESS_TOKEN: 'ig-token-zzz'
}
export const SECRETS = ['stager-secret-zzz', 'media-secret-zzz', 'yt-secret-zzz', 'yt-refresh-zzz', 'ig-token-zzz']

/**
 * A project with a film `demo` (two scenes, built in en: 16:9 and 9:16 videos, captions, covers) and its story.
 * Pass `day: true` for a campaign day script (the website's labels) for the same slug.
 */
export function project({ built = true } = {}) {
	const d = tmp()
	put(d, 'emaki.config.json', { storyUrl: 'https://site.example/articles/{slug}', campaign: 'films/campaign' })
	put(d, 'content/site.json', { name: 'Site', url: 'https://site.example', timeZone: 'America/Chicago', locales: ['en'], defaultLocale: 'en' })
	put(d, 'content/stories/index.json', [{ slug: 'demo', publish_date: '2026-11-16', tags: ['data-quality', 'ai', 'metrics'], kind: 'film' }])
	put(d, 'content/stories/en/demo.json', { title: 'Demo story', dek: 'What the reader gets.', sections: [] })
	put(d, 'content/films/demo/film.json', { title: 'Demo film', scenes: [{ id: 'hook', name: 'Hook', dur: 12 }, { id: 'close', name: 'Close', dur: 18 }] })
	put(d, 'content/films/demo/voice/en.json', [{ scene: 'hook', text: 'Hi.', say: null }, { scene: 'close', text: 'Bye.', say: null }])
	if (built) {
		put(d, 'production/demo/en/out/demo-en-16x9.mp4', Buffer.from('WIDE'.repeat(64)))
		put(d, 'production/demo/en/out/demo-en-9x16.mp4', Buffer.from('TALL'.repeat(64)))
		put(d, 'production/demo/en/out/demo-en.srt', '1\n00:00:00,600 --> 00:00:01,000\nHi\n')
		put(d, 'production/demo/en/render/demo-en-cover-16x9.jpg', Buffer.from('THUMB'))
		put(d, 'production/demo/en/render/demo-en-cover-9x16.jpg', Buffer.from('COVER'))
	}
	return d
}

/** A campaign day script in the website's format (films/campaign/days/day-NN-<slug>.md). */
export const DAY = `# Day 01 · Mon Nov 16 · DBD: Your database deserves version control too

**Article:** https://site.example/articles/demo (goes live 2026-11-16)
**Tags:** database, schema-as-code

## 1 · Short video (9:16, 30–45 s, YouTube Shorts + Instagram Reels)

| # | Voiceover | On screen |
|---|---|---|
| 1 | Where does your database schema actually live? | Hook: question over a messy console |
| 2 | dbd: schema design that lives in your terminal. | End card |

**YouTube title:** Your database deserves version control too #DBD #shorts

**YouTube description:** Code lives in git. The schema often lives in someone's head.

Read the full explainer: https://site.example/articles/demo
#database #postgres

## 2 · Instagram carousel (1080×1350, 3 slides)

1. Your database deserves version control too
2. Code: in git. Schema: scripts, consoles, memory.
3. dbd · open source · Rust CLI

**Caption:** Your app code is versioned. Is your schema?

**Hashtags:** #database #postgres

## 3 · X

**Post:** Your code is in git. Your schema is a console session?

**Thread:**
1. Schema as code: every table is a file.
2. Full explainer: https://site.example/articles/demo

## 4 · Posting

After the build: stage it.
`

/**
 * fetch stand-in: `handler(call)` returns { status?, json?, body?, headers? } (default 200 {}). Every call is kept in
 * `.calls` as { method, url, headers (lower-case keys), body (Buffer | string | undefined) }.
 */
export function fakeFetch(handler = () => ({})) {
	const calls = []
	const f = async (url, init = {}) => {
		const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]))
		const body = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : Buffer.from(init.body)
		const call = { method: init.method ?? 'GET', url: String(url), headers, body }
		calls.push(call)
		const r = (await handler(call)) ?? {}
		const payload = r.body ?? (r.json !== undefined ? JSON.stringify(r.json) : '{}')
		return new Response(payload, { status: r.status ?? 200, headers: r.headers ?? {} })
	}
	f.calls = calls
	return f
}

/** Collects log lines; `text()` joins them for "nothing secret was printed" checks. */
export function logger() {
	const lines = []
	const log = (...a) => lines.push(a.join(' '))
	log.lines = lines
	log.text = () => lines.join('\n')
	return log
}
