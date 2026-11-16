// manifest, validate, new: the content contracts. A film is a folder (film.json, look.css, scene-<id>.json, score.js,
// strings/<locale>.json, voice/<locale>.json, timing.<locale>.json); a story is index.json + stories/<locale>/<slug>.json.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KEY } from './config.js'
import { die, exists, load, save, today } from './util.js'

export const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url))

export const filmSlugs = (p) =>
	exists(p.films) ? readdirSync(p.films).filter((d) => exists(join(p.films, d, 'film.json'))).sort() : []

/** content/films/index.json: the film list the fetch loader reads. */
export function manifest(p) {
	const slugs = filmSlugs(p)
	save(join(p.films, 'index.json'), slugs)
	return { count: slugs.length, path: p.rel(join(p.films, 'index.json')) }
}

/** Every {{key}} a scene uses. */
export function keysIn(obj, out = new Set()) {
	if (typeof obj === 'string') for (const m of obj.matchAll(KEY)) out.add(m[1])
	else if (Array.isArray(obj)) obj.forEach((x) => keysIn(x, out))
	else if (obj && typeof obj === 'object') Object.values(obj).forEach((x) => keysIn(x, out))
	return out
}

const list = (xs) => xs.slice(0, 8).join(', ') + (xs.length > 8 ? ' …' : '')

export function validateFilm(p, slug) {
	const issues = [], d = p.filmDir(slug), film = load(join(d, 'film.json')), used = new Set()
	if (!exists(join(d, 'look.css'))) issues.push('look.css is missing')
	for (const s of film.scenes) {
		const sj = join(d, `scene-${s.id}.json`), js = join(d, `scene-${s.id}.js`)
		if (!exists(sj) && !exists(js)) {
			issues.push(`scene ${s.id}: no scene-${s.id}.json (or .js)`)
			continue
		}
		if (exists(sj)) {
			const spec = load(sj)
			keysIn(spec, used)
			if (!('portrait' in spec)) issues.push(`scene ${s.id}: no portrait block (needed for 9:16 and article figures)`)
			const ids = (spec.components ?? []).map((c) => c.id)
			if (ids.length !== new Set(ids).size) issues.push(`scene ${s.id}: duplicate component ids`)
		}
		if (!(s.dur > 0 && s.dur < 60)) issues.push(`scene ${s.id}: dur ${s.dur} looks wrong`)
	}
	if (film.scenes.at(-1)?.id !== 'close') issues.push('the last scene should be "close" (the punchline card is the cover)')
	for (const loc of p.site.locales) {
		const sp = join(d, 'strings', `${loc}.json`)
		if (!exists(sp)) {
			if (used.size) issues.push(`strings/${loc}.json is missing`)
			continue
		}
		const st = load(sp)
		const missing = [...used].filter((k) => !(k in st)).sort()
		const unused = Object.keys(st).filter((k) => !used.has(k)).sort()
		if (missing.length) issues.push(`strings/${loc}.json: missing ${list(missing)}`)
		if (unused.length) issues.push(`strings/${loc}.json: unused ${list(unused)}`)
		const vp = join(d, 'voice', `${loc}.json`)
		if (exists(vp)) {
			const v = new Set(load(vp).map((x) => x.scene))
			const gap = film.scenes.map((s) => s.id).filter((id) => !v.has(id))
			if (gap.length) issues.push(`voice/${loc}.json: no line for ${gap.join(', ')}`)
		}
	}
	return issues
}

export function validateStory(p, entry) {
	const issues = [], slug = entry.slug
	if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.publish_date ?? '')) issues.push('publish_date must be YYYY-MM-DD')
	const film = entry.film ?? (exists(join(p.films, slug, 'film.json')) ? slug : null)
	const sceneIds = new Set(film ? load(join(p.films, film, 'film.json')).scenes.map((s) => s.id) : [])
	for (const loc of p.site.locales) {
		const f = join(p.content, 'stories', loc, `${slug}.json`)
		if (!exists(f)) {
			issues.push(loc === p.site.defaultLocale ? `stories/${loc}/${slug}.json is missing` : `(info) stories/${loc}/${slug}.json not translated yet`)
			continue
		}
		const b = load(f)
		for (const k of ['title', 'dek', 'sections']) if (!b[k] || (Array.isArray(b[k]) && !b[k].length)) issues.push(`${loc}: ${k} is empty`)
		if (film && !b.takeaway) issues.push(`${loc}: a film story needs a takeaway (the closing line)`)
		for (const s of b.sections ?? [])
			if (s.motion == null && film && !sceneIds.has(s.id) && !['more', 'sources'].includes(s.id))
				issues.push(`(info) ${loc}: section ${s.id} has no figure (no scene of that id)`)
	}
	return issues
}

/** All problems (lines prefixed "(info)" are notes, not failures). */
export function validate(p, slug) {
	const ip = join(p.content, 'stories', 'index.json')
	const index = exists(ip) ? load(ip) : []
	const out = []
	for (const s of slug ? [slug] : filmSlugs(p)) for (const i of validateFilm(p, s)) out.push(`film ${s}: ${i}`)
	for (const e of index) if (!slug || e.slug === slug) for (const i of validateStory(p, e)) out.push(`story ${e.slug}: ${i}`)
	return { lines: out, problems: out.filter((l) => !l.includes('(info)')).length }
}

/** Scaffolds a story + film with every locale's strings, voice script and story body. */
export function newFilm(p, slug, { scenes, title, date } = {}) {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die('slug: lower-case letters, digits and dashes')
	const d = join(p.films, slug)
	if (exists(d)) die(`${p.rel(d)} already exists`)
	const ids = String(scenes ?? 'hook,idea,how').split(',').map((s) => s.trim()).filter(Boolean)
	if (ids.at(-1) !== 'close') ids.push('close')
	const T = join(TEMPLATES, 'film')
	const name = (i) => i.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
	const film = {
		title: title || name(slug), look: 'Describe the look in one paragraph.', background: '#F3F0E9',
		fonts: { display: { family: 'Fraunces', weights: [300, 400] }, sans: { family: 'Inter', weights: [400, 600] } },
		scenes: ids.map((i) => ({ id: i, name: name(i), dur: i === 'close' ? 5.5 : 10, desc: 'What this scene shows.' }))
	}
	save(join(d, 'film.json'), film)
	mkdirSync(d, { recursive: true })
	writeFileSync(join(d, 'look.css'), readFileSync(join(T, 'look.css'), 'utf-8'))
	writeFileSync(join(d, 'score.js'), readFileSync(join(T, 'score.js'), 'utf-8'))
	const tpl = readFileSync(join(T, 'scene-template.json'), 'utf-8'), close = readFileSync(join(T, 'scene-close.json'), 'utf-8')
	let strings = {}
	const voice = []
	for (const i of ids) {
		writeFileSync(join(d, `scene-${i}.json`), (i === 'close' ? close : tpl).replaceAll('__ID__', i))
		strings = i === 'close'
			? { ...strings, 'close.title': 'The punchline.', 'close.sub': 'One line under it.' }
			: { ...strings, [`${i}.eyebrow`]: name(i), [`${i}.line`]: 'The headline for this scene.', [`${i}.sub`]: 'One supporting line.', [`${i}.label`]: 'Label' }
		voice.push({ scene: i, text: 'What the narrator says over this scene.', say: null })
	}
	for (const loc of p.site.locales) {
		save(join(d, 'strings', `${loc}.json`), strings)
		save(join(d, 'voice', `${loc}.json`), voice)
		save(join(p.content, 'stories', loc, `${slug}.json`), {
			title: film.title, dek: 'One or two sentences.',
			sections: ids.filter((i) => !['hook', 'close'].includes(i)).map((i) => ({ id: i, eyebrow: name(i), title: 'Section title', body: ['Paragraph.'] })),
			takeaway: strings['close.title'], takeawaySub: strings['close.sub'], sources: []
		})
	}
	const ip = join(p.content, 'stories', 'index.json')
	const index = exists(ip) ? load(ip) : []
	index.push({ slug, publish_date: date || today(), kind: 'film', tags: [], minutes: 4 })
	save(ip, index.sort((a, b) => a.publish_date.localeCompare(b.publish_date)))
	manifest(p)
	return { slug, scenes: ids.length, locales: p.site.locales.length }
}
