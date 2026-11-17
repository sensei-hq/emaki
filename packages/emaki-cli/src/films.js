// manifest, validate, new: the content contracts. A film is a folder (film.json, look.css, scene-<id>.json, score.js,
// strings/<locale>.json, voice/<locale>.json, timing.<locale>.json); a story is index.json + stories/<locale>/<slug>.json.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keysIn, validateFilm, validateStory } from './film-checks.js'
import { die, exists, load, save, today } from './util.js'

export { keysIn, validateFilm, validateStory }

export const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url))

export const filmSlugs = (p) =>
	exists(p.films) ? readdirSync(p.films).filter((d) => exists(join(p.films, d, 'film.json'))).sort() : []

/** content/films/index.json: the film list the fetch loader reads. */
export function manifest(p) {
	const slugs = filmSlugs(p)
	save(join(p.films, 'index.json'), slugs)
	return { count: slugs.length, path: p.rel(join(p.films, 'index.json')) }
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
		title: title || name(slug), look: 'Describe the look in one paragraph.', background: '#F3F0E9', dark: { background: '#1E1B18' },
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
		const body = join(p.content, 'stories', loc, `${slug}.json`)
		if (!exists(body)) save(body, {
			title: film.title, dek: 'One or two sentences.',
			sections: ids.filter((i) => !['hook', 'close'].includes(i)).map((i) => ({ id: i, eyebrow: name(i), title: 'Section title', body: ['Paragraph.'] })),
			takeaway: strings['close.title'], takeawaySub: strings['close.sub'], sources: []
		})
	}
	const ip = join(p.content, 'stories', 'index.json')
	const index = exists(ip) ? load(ip) : []
	if (!index.some((e) => e.slug === slug)) index.push({ slug, publish_date: date || today(), kind: 'film', tags: [], minutes: 4 })
	save(ip, index.sort((a, b) => a.publish_date.localeCompare(b.publish_date)))
	manifest(p)
	return { slug, scenes: ids.length, locales: p.site.locales.length }
}
