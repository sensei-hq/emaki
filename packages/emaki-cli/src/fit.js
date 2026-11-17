// timing.<locale>.json from the takes: `fit` times each narrated scene to its take, `voiceWeb` encodes the takes for the
// browser and records where each one starts.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { localizeScene, motionEnd } from '@senseihq/emaki'
import { webVoiceArgs } from './media.js'
import { takesFor } from './takes.js'
import { die, load, mediaLength, run, save } from './util.js'

/** The narration for the browser: each take as voice/<locale>/<scene>.m4a beside the film, and in timing.<locale>.json
 *  each narrated scene's `voice` start (the same lead the videos use), so the story player and article figures speak
 *  in step with the picture. A scene whose take is gone loses its file and its start. Run after `fit`. */
export function voiceWeb(p, slug, { locale, encode = (src, dst) => run('ffmpeg', webVoiceArgs(src, dst)), log = () => {} } = {}) {
	const d = p.filmDir(slug), takes = takesFor(p, slug, locale)
	if (!takes.size) die(`${slug} has no takes for ${locale}: record or synthesise them first (emaki voice ${slug} --locale ${locale})`)
	const film = load(join(d, 'film.json')), dir = join(d, 'voice', locale), tp = join(d, `timing.${locale}.json`)
	const timing = existsSync(tp) ? load(tp) : { scenes: {} }
	const tsc = (timing.scenes ??= {})
	mkdirSync(dir, { recursive: true })
	const wrote = [], removed = []
	for (const s of film.scenes) {
		const dst = join(dir, `${s.id}.m4a`), c = tsc[s.id] ?? {}
		if (takes.has(s.id)) {
			encode(takes.get(s.id)[0], dst)
			wrote.push(p.rel(dst))
			log(`${p.rel(dst)}`)
			c.voice = p.lead
		} else {
			if (existsSync(dst)) { rmSync(dst); removed.push(p.rel(dst)) }
			delete c.voice
		}
		if (Object.keys(c).length) tsc[s.id] = c
		else delete tsc[s.id]
	}
	if (!readdirSync(dir).length) rmSync(dir, { recursive: true })
	save(tp, timing)
	return { wrote, removed, timing: p.rel(tp) }
}

const up = (v) => Math.ceil(v * 10 - 1e-9) / 10

/** When scene `s` stops moving, in scene seconds: film.json "settle", else the end of its JSON scene's tracks in this
 *  locale (word counts follow the translation), else null (a JS scene: its motion cannot be read). */
function settleOf(d, s, locale) {
	if (s.settle != null) return s.settle
	const f = join(d, `scene-${s.id}.json`)
	if (!existsSync(f)) return null
	const sp = join(d, `strings/${locale}.json`)
	return motionEnd(localizeScene(load(f), existsSync(sp) ? load(sp) : {}))
}

/** timing.<locale>.json: a narrated scene runs lead + take + tail, longer or shorter than its design, but never ends
 *  before its motion settles; a scene without a take, or a JS scene without "settle", keeps its design time. */
export function fit(p, slug, { locale, check = false, length = mediaLength } = {}) {
	const d = p.filmDir(slug), film = load(join(d, 'film.json')), takes = takesFor(p, slug, locale)
	const tp = join(d, `timing.${locale}.json`)
	const timing = existsSync(tp) ? load(tp) : { scenes: {} }
	const tsc = (timing.scenes ??= {})
	const rows = []
	for (const s of film.scenes) {
		const c = tsc[s.id] ?? {}
		const holds = (c.holds ?? []).reduce((n, h) => n + h[1], 0)
		const L = takes.has(s.id) ? length(takes.get(s.id)[0]) : 0
		const base = s.dur + holds
		let runs = base
		if (L) {
			const settle = settleOf(d, s, locale)
			const floor = settle == null ? base : Math.min(base, up(settle + holds))
			runs = Math.max(floor, up(p.lead + L + p.tail))
		}
		if (Math.abs(runs - base) > 1e-6) c.dur = runs
		else delete c.dur
		if (Object.keys(c).length) tsc[s.id] = c
		else delete tsc[s.id]
		rows.push({ scene: s.id, design: s.dur, holds, take: L, runs, longer: runs > base + 1e-6, shorter: runs < base - 1e-6 })
	}
	if (!check) save(tp, timing)
	return { rows, total: rows.reduce((n, r) => n + r.runs, 0), path: p.rel(tp), written: !check }
}
