// The content contracts validate checks: a film's files, scenes, strings and voice lines per locale, and a story's
// date and bodies. Each check returns its problems as lines; lines prefixed "(info)" are notes, not failures.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KEY } from './config.js'
import { exists, load } from './util.js'

/** Every {{key}} a scene uses. */
export function keysIn(obj, out = new Set()) {
	if (typeof obj === 'string') for (const m of obj.matchAll(KEY)) out.add(m[1])
	else if (Array.isArray(obj)) obj.forEach((x) => keysIn(x, out))
	else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => keysIn(x, out))
	return out
}

const list = (xs) => xs.slice(0, 8).join(', ') + (xs.length > 8 ? ' …' : '')
const DARK = '#stage[data-mode="dark"]'

/** look.css exists, and its dark styles and film.json's dark block come together: one without the other is a mistake. */
function lookIssues(d, film) {
	if (!exists(join(d, 'look.css'))) return ['look.css is missing']
	const styled = readFileSync(join(d, 'look.css'), 'utf-8').includes(DARK)
	if (film.dark && !styled) return [`film.json has a dark block but look.css never styles ${DARK}`]
	if (!film.dark && styled) return [`look.css styles ${DARK} but film.json has no dark block (those styles never apply)`]
	return []
}

/** A JSON scene's own problems; collects the {{keys}} it uses into `used`. */
function specIssues(spec, used) {
	keysIn(spec, used)
	const ids = (spec.components ?? []).map((c) => c.id)
	return [
		...('portrait' in spec ? [] : ['no portrait block (needed for 9:16 and article figures)']),
		...(ids.length === new Set(ids).size ? [] : ['duplicate component ids'])
	]
}

function sceneIssues(d, s, used) {
	const sj = join(d, `scene-${s.id}.json`), js = join(d, `scene-${s.id}.js`)
	if (!exists(sj) && !exists(js)) return [`scene ${s.id}: no scene-${s.id}.json (or .js)`]
	const out = exists(sj) ? specIssues(load(sj), used) : []
	if (!(s.dur > 0 && s.dur < 60)) out.push(`dur ${s.dur} looks wrong`)
	return out.map((m) => `scene ${s.id}: ${m}`)
}

const coverIssues = (film) =>
	film.cover || film.scenes.at(-1)?.id === 'close' ? [] : ['the last scene should be "close" (the punchline card is the cover), or film.json should name its cover']

function stringIssues(st, loc, used) {
	const missing = [...used].filter((k) => !(k in st)).sort()
	const unused = Object.keys(st).filter((k) => !used.has(k)).sort()
	return [['missing', missing], ['unused', unused]].filter(([, ks]) => ks.length).map(([what, ks]) => `strings/${loc}.json: ${what} ${list(ks)}`)
}

function voiceIssues(d, film, loc) {
	const vp = join(d, 'voice', `${loc}.json`)
	if (!exists(vp)) return []
	const v = new Set(load(vp).map((x) => x.scene))
	const gap = film.scenes.map((s) => s.id).filter((id) => !v.has(id))
	return gap.length ? [`voice/${loc}.json: no line for ${gap.join(', ')}`] : []
}

function localeIssues(d, film, loc, used) {
	const sp = join(d, 'strings', `${loc}.json`)
	if (!exists(sp)) return used.size ? [`strings/${loc}.json is missing`] : []
	return [...stringIssues(load(sp), loc, used), ...voiceIssues(d, film, loc)]
}

export function validateFilm(p, slug) {
	const d = p.filmDir(slug), film = load(join(d, 'film.json')), used = new Set()
	// In this order: the scenes collect the {{keys}} the locales are checked against.
	const look = lookIssues(d, film), scenes = film.scenes.flatMap((s) => sceneIssues(d, s, used))
	return [...look, ...scenes, ...coverIssues(film), ...p.site.locales.flatMap((loc) => localeIssues(d, film, loc, used))]
}

const isEmpty = (v) => !v || (Array.isArray(v) && !v.length)
const NO_FIGURE = ['more', 'sources']
const hasFigure = (s, sceneIds) => s.motion != null || s.figure != null || sceneIds.has(s.id)

/** A film story's sections that show nothing: no motion, no figure and no scene of the same id. */
const figureNotes = (b, loc, sceneIds) => (b.sections ?? [])
	.filter((s) => !hasFigure(s, sceneIds) && !NO_FIGURE.includes(s.id))
	.map((s) => `(info) ${loc}: section ${s.id} has no figure (no scene of that id)`)

function bodyIssues(p, slug, loc, film, sceneIds) {
	const f = join(p.content, 'stories', loc, `${slug}.json`)
	if (!exists(f)) return [loc === p.site.defaultLocale ? `stories/${loc}/${slug}.json is missing` : `(info) stories/${loc}/${slug}.json not translated yet`]
	const b = load(f)
	const empty = ['title', 'dek', 'sections'].filter((k) => isEmpty(b[k])).map((k) => `${loc}: ${k} is empty`)
	if (!film) return empty
	return [...empty, ...(b.takeaway ? [] : [`${loc}: a film story needs a takeaway (the closing line)`]), ...figureNotes(b, loc, sceneIds)]
}

/** The film a story shows: index.json "film", else the film of the same slug, else none. */
const storyFilm = (p, entry) => entry.film ?? (exists(join(p.films, entry.slug, 'film.json')) ? entry.slug : null)

export function validateStory(p, entry) {
	const film = storyFilm(p, entry)
	const sceneIds = new Set(film ? load(join(p.films, film, 'film.json')).scenes.map((s) => s.id) : [])
	const date = /^\d{4}-\d{2}-\d{2}$/.test(entry.publish_date ?? '') ? [] : ['publish_date must be YYYY-MM-DD']
	return [...date, ...p.site.locales.flatMap((loc) => bodyIssues(p, entry.slug, loc, film, sceneIds))]
}
