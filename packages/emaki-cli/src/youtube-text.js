// The words that go up with a YouTube film: chapters YouTube accepts, the description, and how an update merges
// ours with what is already on the video.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { filmFiles, storyUrl } from './stories.js'
import { exists, load } from './util.js'

/**
 * [[at, name]] for the description: first at 0:00, every chapter at least 10 s (YouTube shows none unless all its
 * rules hold). Short scenes fold into the chapter they start; a short tail joins the last chapter.
 */
export function chapters(plan) {
	const groups = []
	let cur = [], start = 0
	for (const s of plan) {
		cur.push(s)
		if (s.at + s.dur - start >= 10 - 1e-6) {
			groups.push([start, cur])
			cur = []
			start = s.at + s.dur
		}
	}
	if (cur.length) groups.length ? groups.at(-1)[1].push(...cur) : groups.push([start, cur])
	return groups.map(([at, ss]) => [at, ss.map((s) => s.name).join(' + ')])
}

/** Each scene's start and running time in one locale (design time, holds, and timing.<locale>.json). */
export function scenePlan(p, slug, locale) {
	const d = join(p.films, slug), film = load(join(d, 'film.json'))
	const tp = join(d, `timing.${locale}.json`), tm = exists(tp) ? (load(tp).scenes ?? {}) : {}
	let at = 0
	return film.scenes.map((s) => {
		const holds = (tm[s.id]?.holds ?? []).reduce((n, h) => n + h[1], 0)
		const dur = Math.max(s.dur + holds, tm[s.id]?.dur ?? 0)
		const row = { id: s.id, name: s.name ?? s.id, at, dur }
		at += dur
		return row
	})
}

/** The description to publish: the built out/description.txt, else title + chapters + the story's link. */
export function youtubeDescription(p, slug, locale, title) {
	const f = filmFiles(p, slug, locale).description
	if (f) return readFileSync(f, 'utf-8')
	const lines = chapters(scenePlan(p, slug, locale)).map(([at, n]) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')} ${n}\n`).join('')
	return `${title}\n\n${lines}\n${storyUrl(p, slug, locale)}\n`
}

/** prepend: ours first, then what was there (minus earlier copies of ours); replace: ours only. */
export function mergeDescription(remote, local, mode = 'prepend') {
	if (mode === 'replace') return local
	const ours = local.trim()
	let rest = (remote ?? '').trim()
	while (ours && rest.startsWith(ours)) {
		rest = rest.slice(ours.length).trim()
		if (rest.startsWith('---')) rest = rest.slice(3).trim()
	}
	return rest ? `${ours}\n\n---\n\n${rest}\n` : `${ours}\n`
}
