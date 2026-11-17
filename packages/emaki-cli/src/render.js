// render: the film frame by frame to MP4 with its music, plus a cover JPEG per orientation (render.py). One job is
// shared by every layout; each layout captures its frames (or lays the music), then saves its covers.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SUFFIX } from './config.js'
import { encodeArgs, frameRange, musicFor, muxArgs, renderOut, renderSteps, staleRender } from './media.js'
import { chromium, evaluate, openShow, openSite } from './show-page.js'
import { die, mediaLength, run } from './util.js'

/** The score for the whole run, read once: the exported film's audio, the page's synthesised score (saved as
 *  score.wav), or null for a silent picture. */
async function scoreFor(job, call) {
	if (job.music.kind !== 'synth') return job.music.kind === 'file' ? job.music.file : null
	const b64 = await call(() => window.__show.audio())
	if (!b64) return job.log('  the film has no score: silent picture'), null
	const audio = join(job.out, 'score.wav')
	writeFileSync(audio, Buffer.from(b64, 'base64'))
	job.log(`  score: ${job.p.rel(audio)}`)
	return audio
}

/** Seeks the page to each frame of the range and writes its JPEG to ffmpeg's stdin, waiting when the pipe is full. */
async function pipeFrames(job, page, call, ff, { layout, t0, end, frames }) {
	const { fps, log } = job
	for (let i = 0; i < frames; i++) {
		await call((t) => window.__show.seek(t), t0 + i / fps)
		const jpg = await page.screenshot({ type: 'jpeg', quality: 94 })
		if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r))
		if (i % (fps * 10) === 0) log(`  ${layout} ${(t0 + i / fps).toFixed(1).padStart(6)}s / ${end.toFixed(1)}s`)
	}
}

/** Captures the frames into <dst>.part.mp4 through ffmpeg (the score under them), then moves it into place. */
async function captureFrames(job, { page, meta, errors }, call, layout, dst) {
	const { p, slug, fps, audio, log } = job
	const range = frameRange(meta.duration, fps, job.from, job.to), { t0, end, frames, seconds } = range
	log(`${slug}: ${layout} at ${fps} fps, ${t0 ? `${t0.toFixed(1)}–` : ''}${end.toFixed(1)} s, ${audio ? `music: ${job.mode}` : 'no music'}`)
	const tmp = dst.replace(/\.mp4$/i, '.part.mp4')
	mkdirSync(dirname(dst), { recursive: true })
	const ff = spawn('ffmpeg', encodeArgs({ fps, seconds, dst: tmp, audio, t0 }), { stdio: ['pipe', 'inherit', 'inherit'] })
	const done = new Promise((ok, bad) => { ff.on('close', (c) => (c ? bad(new Error('ffmpeg failed')) : ok())); ff.on('error', bad) })
	const began = Date.now()
	await pipeFrames(job, page, call, ff, { layout, ...range })
	ff.stdin.end()
	await done.catch((e) => die(e.message))
	if (errors.length) die('the page reported errors: ' + errors.slice(0, 3).join('; '))
	renameSync(tmp, dst)
	log(`  wrote ${p.rel(dst)} (${frames} frames, ${Math.round((Date.now() - began) / 1000)}s)`)
	return dst
}

/** --audio-only: lays the score on the existing render, warning when the render no longer runs as long as the film. */
function layMusic(job, { meta }, dst) {
	const { p, audio, from, to, log } = job
	if (!existsSync(dst)) die(`--audio-only needs ${p.rel(dst)}; render it first`)
	const dur = mediaLength(dst)
	const stale = staleRender(dur, meta.duration, Boolean(from) || to != null)
	if (stale) log(`  warning: ${p.rel(dst)}: ${stale}`)
	if (!audio) return log(`  no music to lay on ${p.rel(dst)}`), dst
	const tmp = dst.replace(/\.mp4$/i, '.mux.mp4')
	run('ffmpeg', muxArgs(dst, audio, Number(from) || 0, dur, tmp))
	renameSync(tmp, dst)
	log(`  music laid on ${p.rel(dst)}`)
	return dst
}

/** The cover frame as a JPEG; for landscape, also the site's cover (emaki.config.json coversDir) at 1600 px wide. */
async function saveCovers(job, { page, meta }, call, layout) {
	const { p, slug, locale, log } = job
	await call((t) => window.__show.seek(t), meta.cover)
	const cover = join(job.out, `${slug}-${locale}-cover-${SUFFIX[layout]}.jpg`)
	writeFileSync(cover, await page.screenshot({ type: 'jpeg', quality: 92 }))
	log(`  cover: ${p.rel(cover)} (film time ${meta.cover.toFixed(1)} s)`)
	if (layout !== 'landscape' || !p.cfg.coversDir) return
	const siteCover = join(p.root, p.cfg.coversDir, locale === p.site.defaultLocale ? `${slug}.jpg` : `${slug}.${locale}.jpg`)
	mkdirSync(dirname(siteCover), { recursive: true })
	run('ffmpeg', ['-y', '-loglevel', 'error', '-i', cover, '-vf', 'scale=1600:-2', '-q:v', '3', siteCover])
	log(`  cover for the site: ${p.rel(siteCover)}`)
}

/** One layout: the frames (or, with --audio-only, the music) as the steps say, then the covers. Returns the video. */
async function renderLayout(job, browser, site, layout) {
	const show = await openShow(browser, site, job.slug, layout, job.locale)
	const call = (fn, arg) => evaluate(show.page, fn, arg)
	const dst = renderOut(job.out, job.slug, job.locale, layout, { out: job.target, layouts: job.layouts })
	if (job.steps.music && job.audio === undefined) job.audio = await scoreFor(job, call)
	let made = null
	if (job.steps.frames) made = await captureFrames(job, show, call, layout, dst)
	else if (job.steps.music) made = layMusic(job, show, dst)
	await saveCovers(job, show, call, layout)
	await show.page.close()
	return made
}

/** Frame-by-frame capture to MP4 with its music, plus a cover JPEG per orientation (render.py).
 *  `from`/`to` capture a range of film time; `out` is a file (one layout) or a folder. `music`: synth (the page's
 *  score, saved as score.wav), export (the audio of production/<slug>/<locale>/<slug>.mp4) or none. `audioOnly` lays
 *  the music on the existing render without capturing frames; `coverOnly` saves just the covers. */
export async function render(p, slug, {
	locale, url, o = 'both', fps = 30, from = 0, to = undefined, out: target = undefined, music: mode = 'synth',
	audioOnly = false, coverOnly = false, log = console.info
} = {}) {
	p.filmDir(slug)
	const steps = renderSteps({ audioOnly, coverOnly })
	const layouts = o === 'both' ? ['landscape', 'portrait'] : [o]
	const out = p.prod(slug, locale, 'render')
	mkdirSync(out, { recursive: true })
	const music = musicFor(mode, { exportFile: p.prod(slug, locale, `${slug}.mp4`), exists: existsSync })
	if (steps.music && music.note) log(`  ${music.note}`)
	// What every layout shares; `audio` (the score) is read with the first layout's page and kept.
	const job = { p, slug, locale, steps, music, mode, out, target, layouts: layouts.length, fps, from, to, log, audio: undefined }
	const site = await openSite(p, url), made = []
	const browser = await (await chromium()).launch()
	try {
		for (const layout of layouts) {
			const dst = await renderLayout(job, browser, site, layout)
			if (dst) made.push(dst)
		}
		return made
	} finally {
		await browser.close()
		site.close()
	}
}
