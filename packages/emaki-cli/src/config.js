// The project a command runs in: emaki.config.json at its root (all optional), content/ (deployed: films, stories,
// site.json) and production/ (never deployed: takes, renders, sheets).
import { join, relative } from 'node:path'
import { die, exists, load } from './util.js'

export const SIZES = { landscape: [1920, 1080], portrait: [1080, 1920] }
export const SUFFIX = { landscape: '16x9', portrait: '9x16' }
export const KEY = /\{\{\s*([\w.-]+)\s*\}\}/g

/** @param {string} [root] */
export function project(root = process.cwd()) {
	const cfgPath = join(root, 'emaki.config.json')
	const cfg = exists(cfgPath) ? load(cfgPath) : {}
	const content = join(root, cfg.content ?? 'content')
	const production = join(root, cfg.production ?? 'production')
	const films = join(content, 'films')
	const sitePath = join(content, 'site.json')
	const site = exists(sitePath) ? load(sitePath) : { locales: ['en'], defaultLocale: 'en' }
	const p = {
		root, cfg, cfgPath, content, production, films, site,
		lead: cfg.lead ?? 0.6,
		tail: cfg.tail ?? 1.2,
		rel: (x) => relative(root, x) || '.',
		filmDir(slug) {
			const d = join(films, slug)
			if (!exists(join(d, 'film.json'))) die(`no film "${slug}" in ${p.rel(films)}/`)
			return d
		},
		prod: (slug, locale, ...parts) => join(production, slug, locale, ...parts)
	}
	return p
}
