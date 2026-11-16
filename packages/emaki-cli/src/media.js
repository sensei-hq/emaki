// What render and build decide, as pure functions: frame ranges, output paths, ffmpeg arguments, the freeze table,
// chapters, the description. capture.js and voice.js run what these return (Playwright, ffmpeg); the specs test these.
// The reference is the sensei-hq.com website's films/tools/render.py and build.py.
import { join, resolve } from 'node:path'
import { SUFFIX } from './config.js'
import { die } from './util.js'

/** The frames to capture: from `from` (default 0) to `to` (default and at most the film's end), at least one. */
export function frameRange(duration, fps, from = 0, to = undefined) {
	const t0 = Math.max(0, Number(from ?? 0))
	const end = Math.min(to == null ? duration : Number(to), duration)
	if (!Number.isFinite(t0) || !Number.isFinite(end) || !(end > t0))
		die(`--from ${from ?? 0} --to ${to ?? 'the end'} is not a range inside the film (it runs ${duration.toFixed(1)} s)`)
	const frames = Math.max(1, Math.round((end - t0) * fps))
	return { t0, end, frames, seconds: frames / fps }
}

/** Where a layout's render goes: the render folder by default; --out FILE.mp4 for one layout, --out FOLDER for any. */
export function renderOut(dir, slug, locale, layout, { out = undefined, layouts = 1 } = {}) {
	const name = `${slug}-${locale}-${SUFFIX[layout]}.mp4`
	if (!out) return join(dir, name)
	if (!/\.mp4$/i.test(out)) return resolve(out, name)
	if (layouts > 1) die(`--out ${out} is one file, so it takes one layout: add --o landscape or --o portrait, or give a folder`)
	return resolve(out)
}
