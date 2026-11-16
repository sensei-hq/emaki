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

/** Where the music comes from (--music): `synth` the page's score (window.__show.audio(), on the film's own timing),
 *  `export` the audio of an exported film (`exportFile`; silent if it is missing), `none` a silent picture. */
export function musicFor(mode = 'synth', { exportFile = '', exists = (_f) => false } = {}) {
	if (mode === 'synth') return { kind: 'synth' }
	if (mode === 'none') return { kind: 'none' }
	if (mode !== 'export') die(`--music ${mode}: use synth | export | none`)
	if (exists(exportFile)) return { kind: 'file', file: exportFile }
	return { kind: 'none', note: `no ${exportFile}: silent picture` }
}

/** What a render run does: capture frames, lay the music, save the covers. --audio-only lays the music on the
 *  existing render; --cover-only saves just the covers. */
export function renderSteps({ audioOnly = false, coverOnly = false } = {}) {
	if (audioOnly && coverOnly) die('--audio-only and --cover-only exclude each other')
	return { frames: !audioOnly && !coverOnly, music: !coverOnly, cover: true }
}

/** ffmpeg reading JPEG frames from stdin; `audio` (from film time t0) laid under them. */
export function encodeArgs({ fps, seconds, dst, audio = null, t0 = 0 }) {
	return ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
		...(audio ? ['-ss', t0.toFixed(3), '-i', audio, '-map', '0:v', '-map', '1:a'] : []),
		'-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
		...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : []), '-t', seconds.toFixed(3), '-movflags', '+faststart', dst]
}

/** --audio-only: copies the picture and lays `audio` (from film time t0, for dur) under it. */
export function muxArgs(video, audio, t0, dur, dst) {
	return ['-y', '-loglevel', 'error', '-i', video, '-ss', t0.toFixed(3), '-i', audio, '-map', '0:v', '-map', '1:a',
		'-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', dur.toFixed(3), '-movflags', '+faststart', dst]
}

/** Runs `fn`; when it fails (the dev server reloaded the page under it), awaits `recover` (the show coming back)
 *  and runs it again, up to `attempts` times in all, then lets the last error through. */
export async function retrying(fn, recover, attempts = 8) {
	for (let i = 1; ; i++) {
		try {
			return await fn()
		} catch (e) {
			if (i >= attempts) throw e
			await recover(e)
		}
	}
}

/** A warning when an existing render no longer runs as long as the film (after a retiming): its frames are stale. */
export function staleRender(rendered, film, ranged = false) {
	if (ranged || Math.abs(rendered - film) <= 0.2) return null
	return `the render runs ${rendered.toFixed(1)} s but the film now runs ${film.toFixed(1)} s; render the frames again`
}
