// The recorded or synthesised takes of a film in a locale: production/<slug>/<locale>/takes/take-NN.<ext>, one per
// voice line, in voice/<locale>.json order.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { load, pad2 } from './util.js'

/** scene id → [take file, voice line] for the takes that exist. */
export function takesFor(p, slug, locale) {
	const d = p.filmDir(slug), lines = load(join(d, 'voice', `${locale}.json`)), folder = p.prod(slug, locale, 'takes')
	const out = new Map()
	lines.forEach((l, i) => {
		for (const ext of ['wav', 'mp3', 'm4a', 'aiff']) {
			const f = join(folder, `take-${pad2(i + 1)}.${ext}`)
			if (existsSync(f)) { out.set(l.scene, [f, l]); break }
		}
	})
	return out
}
