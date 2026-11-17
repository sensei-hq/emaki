// emaki migrate <website>: moves a sensei-hq.com-style site's motion content into emaki's layout, once, so `emaki`
// can take over its films (issue #1, gap 4). Nothing that already exists is overwritten; the report lists what was
// written and what was kept, and `emaki validate` checks the result.
//
//   src/lib/motion/films/<slug>/   → content/films/<slug>/ (base.css becomes look.css)
//   src/lib/motion/logos/          → content/logos/
//   src/lib/content/articles/index.json  → content/stories/index.json, minus the reader-facing text …
//   src/lib/content/articles/<slug>.json → content/stories/<locale>/<slug>.json, plus that text (title, dek, …)
//   films/<slug>/film.json scenes  → content/films/<slug>/voice/<locale>.json  (the narration)
//   films/<slug>/takes/*.wav       → production/<slug>/<locale>/takes/          (recorded takes: keep, don't regenerate)
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { die, exists, load } from './util.js'

/** Index fields that are words for the reader: emaki keeps them per locale, in the story body. */
const TEXT = ['title', 'dek', 'kanjiGloss', 'series']

/** Writes that never overwrite: each target lands in `wrote`, or in `kept` when it already exists. */
function writer(p) {
	const wrote = [], kept = []
	const put = (dst, write) => {
		const rel = p.rel(dst)
		if (exists(dst)) return kept.push(rel)
		mkdirSync(dirname(dst), { recursive: true })
		write(dst)
		wrote.push(rel)
	}
	const copy = (src, dst) => put(dst, (d) => copyFileSync(src, d))
	const json = (dst, data) => put(dst, (d) => writeFileSync(d, JSON.stringify(data, null, 1) + '\n'))
	const tree = (src, dst, rename = (n) => n) => {
		for (const e of readdirSync(src, { withFileTypes: true }))
			if (e.isDirectory()) tree(join(src, e.name), join(dst, e.name))
			else copy(join(src, e.name), join(dst, rename(e.name)))
	}
	return { wrote, kept, copy, json, tree }
}

/** The sub-folders of `dir` that hold a film.json (none when `dir` is missing). */
const filmFolders = (dir) => (exists(dir) ? readdirSync(dir).filter((d) => exists(join(dir, d, 'film.json'))) : [])

/** src/lib/motion/films/<slug>/ → content/films/<slug>/ (base.css becomes look.css), then the logos. */
function moveFilms(p, from, w) {
	const films = join(from, 'src/lib/motion/films')
	for (const slug of filmFolders(films)) w.tree(join(films, slug), join(p.films, slug), (n) => (n === 'base.css' ? 'look.css' : n))
	const logos = join(from, 'src/lib/motion/logos')
	if (exists(logos)) w.tree(logos, join(p.content, 'logos'))
}

/** The articles index without its reader-facing text, and each article's body with that text, in `locale`. */
function moveArticles(p, articles, locale, w) {
	if (!exists(join(articles, 'index.json'))) return
	const index = load(join(articles, 'index.json'))
	w.json(join(p.content, 'stories', 'index.json'), index.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !TEXT.includes(k)))))
	for (const e of index) {
		const src = join(articles, `${e.slug}.json`)
		if (!exists(src)) continue
		const text = Object.fromEntries(TEXT.filter((k) => k in e).map((k) => [k, e[k]]))
		w.json(join(p.content, 'stories', locale, `${e.slug}.json`), { ...text, ...load(src) })
	}
}

/** films/<slug>/: the narration (into a film that was moved) and the recorded takes. */
function moveMasters(p, from, locale, w) {
	const masters = join(from, 'films')
	for (const slug of filmFolders(masters)) {
		const scenes = load(join(masters, slug, 'film.json')).scenes ?? []
		if (scenes.length && exists(join(p.films, slug)))
			w.json(join(p.films, slug, 'voice', `${locale}.json`), scenes.map((s) => ({ scene: s.id, text: s.text ?? '', say: s.say ?? null })))
		const takes = join(masters, slug, 'takes')
		const wavs = exists(takes) ? readdirSync(takes).filter((n) => n.endsWith('.wav')) : []
		for (const f of wavs) w.copy(join(takes, f), p.prod(slug, locale, 'takes', f))
	}
}

export function migrate(p, from, { locale = 'en' } = {}) {
	const films = join(from, 'src/lib/motion/films'), articles = join(from, 'src/lib/content/articles')
	if (!exists(films) && !exists(articles)) die(`${from} has neither src/lib/motion/films nor src/lib/content/articles`)
	const w = writer(p)
	moveFilms(p, from, w)
	moveArticles(p, articles, locale, w)
	moveMasters(p, from, locale, w)
	if (!exists(join(p.content, 'site.json'))) w.json(join(p.content, 'site.json'), { name: '', url: '', locales: [locale], defaultLocale: locale })
	return { wrote: w.wrote, kept: w.kept }
}
