// A story as the media pipeline needs it: its index entry with the reader-facing text of one locale, its public
// link, the built files of its film, and the links of its posts written back into the stories index.
import { join } from 'node:path'
import { SUFFIX } from './config.js'
import { die, exists, load, save } from './util.js'

export const storiesIndex = (p) => join(p.content, 'stories', 'index.json')

/** The index entry merged with title/dek/… from stories/<locale>/<slug>.json (else the default locale's). */
export function storyFor(p, slug, locale) {
	const ip = storiesIndex(p)
	const entry = exists(ip) ? load(ip).find((e) => e.slug === slug) : null
	if (!entry) die(`${slug} is not in ${p.rel(ip)}`)
	const body = [locale, p.site.defaultLocale].map((l) => join(p.content, 'stories', l, `${slug}.json`)).find(exists)
	const text = body ? load(body) : {}
	const film = exists(join(p.films, slug, 'film.json')) ? load(join(p.films, slug, 'film.json')) : {}
	return { ...entry, title: text.title ?? entry.title ?? film.title ?? slug, dek: text.dek ?? entry.dek ?? '', tags: entry.tags ?? [] }
}

/** The public link of a story: emaki.config.json "storyUrl" ({url}, {locale}, {slug}), default {url}/{locale}/stories/{slug}. */
export function storyUrl(p, slug, locale) {
	const tpl = p.cfg.storyUrl ?? '{url}/{locale}/stories/{slug}'
	return tpl.replaceAll('{url}', (p.site.url ?? '').replace(/\/$/, '')).replaceAll('{locale}', locale).replaceAll('{slug}', slug)
}

/** #tag #tag from a story's first five tags (dashes dropped). */
export const hashtags = (tags) => tags.slice(0, 5).map((t) => '#' + t.replace(/-/g, '')).join(' ')

/** What `emaki build` and `emaki render` made for a film in one locale; a missing file is null. */
export function filmFiles(p, slug, locale) {
	const out = p.prod(slug, locale, 'out'), render = p.prod(slug, locale, 'render')
	const has = (f) => (exists(f) ? f : null)
	return {
		wide: has(join(out, `${slug}-${locale}-${SUFFIX.landscape}.mp4`)),
		tall: has(join(out, `${slug}-${locale}-${SUFFIX.portrait}.mp4`)),
		srt: has(join(out, `${slug}-${locale}.srt`)),
		thumb: has(join(render, `${slug}-${locale}-cover-${SUFFIX.landscape}.jpg`)),
		coverTall: has(join(render, `${slug}-${locale}-cover-${SUFFIX.portrait}.jpg`)),
		description: has(join(out, 'description.txt')),
		expect: {
			wide: join(out, `${slug}-${locale}-${SUFFIX.landscape}.mp4`),
			tall: join(out, `${slug}-${locale}-${SUFFIX.portrait}.mp4`)
		}
	}
}

/**
 * Writes post links into the story's index entry: `youtube` (the id) and social.youtube / social.instagram / social.x.
 * Without `overwrite`, an existing id or link is never replaced. A Short (entry.video === 'short') links /shorts/.
 */
export function recordLinks(p, slug, { youtube, instagram, x } = {}, { overwrite = false } = {}) {
	const ip = storiesIndex(p), index = load(ip)
	const entry = index.find((e) => e.slug === slug)
	if (!entry) die(`${slug} is not in ${p.rel(ip)}`)
	const social = (entry.social ??= {})
	const set = (obj, k, v) => { if (v && (overwrite || !obj[k])) obj[k] = v }
	if (youtube && !/^https?:/.test(youtube)) {
		set(entry, 'youtube', youtube)
		youtube = entry.video === 'short' ? `https://www.youtube.com/shorts/${youtube}` : `https://www.youtube.com/watch?v=${youtube}`
	}
	set(social, 'youtube', youtube)
	set(social, 'instagram', instagram)
	set(social, 'x', x)
	save(ip, index)
	return entry
}
