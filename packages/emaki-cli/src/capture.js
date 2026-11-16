// sheet and render drive the site's capture page in headless Chromium: /show/<slug>?capture=1 installs
// window.__show = { meta, ready, seek(t), audio() } (installCapture in @senseihq/emaki; ShowPage in each wrapper).
// Playwright is an optional dependency: `npm i -D playwright && npx playwright install chromium`.
import { spawn } from 'node:child_process'
import { mkdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { SIZES, SUFFIX } from './config.js'
import { die, run } from './util.js'

export async function chromium() {
	try {
		return (await import('playwright')).chromium
	} catch {
		return die('sheet, render and carousel need Playwright: npm i -D playwright && npx playwright install chromium')
	}
}

const portOpen = (port) => new Promise((ok) => {
	const s = connect({ port, host: '127.0.0.1' })
	s.setTimeout(500)
	s.once('connect', () => { s.destroy(); ok(true) })
	s.once('error', () => ok(false))
	s.once('timeout', () => { s.destroy(); ok(false) })
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The site to capture: `url` if given (must answer), else the dev server (emaki.config.json devCommand), started if
 *  nothing listens on the port yet and stopped afterwards. */
export async function openSite(p, url) {
	const port = p.cfg.port ?? 5199
	let proc = null
	const base = (url ?? `http://localhost:${port}`).replace(/\/$/, '')
	if (url) {
		try {
			await fetch(url, { signal: AbortSignal.timeout(10000) })
		} catch (e) {
			die(`the site at ${url} is not responding (${e.message}); start it, or leave out --url to let emaki start it`)
		}
	} else if (!(await portOpen(port))) {
		const cmd = (p.cfg.devCommand ?? 'npm run dev -- --port {port} --strictPort').replaceAll('{port}', String(port))
		proc = spawn(cmd, { shell: true, cwd: p.root, stdio: 'ignore', detached: process.platform !== 'win32' })
		let up = false
		for (let i = 0; i < 120 && !(up = await portOpen(port)); i++) await sleep(500)
		if (!up) { stop(); die(`the dev server did not start (${cmd})`) }
	}
	function stop() {
		if (!proc) return
		try { process.kill(-proc.pid) } catch { proc.kill() }
	}
	const showPath = p.cfg.showPath ?? '/show/{slug}?capture=1&o={layout}&locale={locale}'
	return {
		base,
		show: (slug, layout, locale) => base + showPath.replaceAll('{slug}', slug).replaceAll('{layout}', layout).replaceAll('{locale}', locale),
		close: stop
	}
}

async function openShow(browser, site, slug, layout, locale) {
	const [width, height] = SIZES[layout]
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
	const errors = []
	page.on('pageerror', (e) => errors.push(String(e)))
	await page.goto(site.show(slug, layout, locale))
	await page.waitForFunction(() => window.__show, null, { timeout: 30000 })
	await page.evaluate(() => window.__show.ready)
	return { page, meta: await page.evaluate(() => window.__show.meta), errors }
}

/** A contact sheet: each scene's final picture (or --at scene:t,...) in both orientations, side by side. */
export async function sheet(p, slug, { locale, url, at, log = console.info } = {}) {
	p.filmDir(slug)
	const out = p.prod(slug, locale, 'sheets')
	mkdirSync(out, { recursive: true })
	const site = await openSite(p, url), shots = []
	const browser = await (await chromium()).launch()
	try {
		for (const layout of ['landscape', 'portrait']) {
			const { page, meta, errors } = await openShow(browser, site, slug, layout, locale)
			const starts = Object.fromEntries(meta.scenes.map((s) => [s.id, [s.start, s.dur]]))
			const pts = at
				? String(at).split(',').map((x) => { const [sid, t] = x.split(':'); return [sid, parseFloat(t)] })
				: Object.entries(starts).map(([sid, [, d]]) => [sid, d - 0.4])
			for (const [i, [sid, t]] of pts.entries()) {
				if (!starts[sid]) die(`no scene "${sid}"`)
				await page.evaluate((x) => window.__show.seek(x), starts[sid][0] + t)
				await page.waitForTimeout(80)
				const f = join(out, `${layout}-${String(i).padStart(2, '0')}-${sid}.jpg`)
				writeFileSync(f, await page.screenshot({ type: 'jpeg', quality: 82 }))
				shots.push({ layout, i, f, sid })
			}
			if (errors.length) log('page errors: ' + errors.slice(0, 3).join(' | '))
			await page.close()
		}
		// Compose in the browser: landscape 960x540 with its portrait 304x540 beside it, three per row.
		const n = shots.filter((s) => s.layout === 'landscape').length, cols = Math.min(3, n), rows = Math.ceil(n / cols)
		const img = (s) => `data:image/jpeg;base64,${readFileSync(s.f).toString('base64')}`
		const cells = shots.map((s) => {
			const r = Math.floor(s.i / cols), c = s.i % cols
			const [x, w] = s.layout === 'landscape' ? [c * 1290, 960] : [c * 1290 + 966, 304]
			return `<img src="${img(s)}" style="position:absolute;left:${x}px;top:${r * 550}px;width:${w}px;height:540px">`
		}).join('')
		const page = await browser.newPage({ viewport: { width: cols * 1290, height: rows * 550 } })
		await page.setContent(`<body style="margin:0;background:#fff;position:relative">${cells}</body>`)
		await page.waitForFunction(() => [...document.images].every((i) => i.complete))
		const dst = join(out, `${slug}-${locale}-sheet.jpg`)
		writeFileSync(dst, await page.screenshot({ type: 'jpeg', quality: 85, fullPage: true }))
		log(`sheet: ${p.rel(dst)}`)
		return dst
	} finally {
		await browser.close()
		site.close()
	}
}

/** Frame-by-frame capture to MP4 (the score as its audio), plus a cover JPEG per orientation. */
export async function render(p, slug, { locale, url, o = 'both', fps = 30, log = console.info } = {}) {
	p.filmDir(slug)
	const layouts = o === 'both' ? ['landscape', 'portrait'] : [o]
	const out = p.prod(slug, locale, 'render')
	mkdirSync(out, { recursive: true })
	const site = await openSite(p, url), made = []
	const browser = await (await chromium()).launch()
	try {
		let score
		for (const layout of layouts) {
			const { page, meta, errors } = await openShow(browser, site, slug, layout, locale)
			if (score === undefined) {
				const b64 = await page.evaluate(() => window.__show.audio())
				score = b64 ? join(out, 'score.wav') : null
				if (b64) writeFileSync(score, Buffer.from(b64, 'base64'))
			}
			const frames = Math.round(meta.duration * fps)
			const dst = join(out, `${slug}-${locale}-${SUFFIX[layout]}.mp4`), tmp = dst.replace(/\.mp4$/, '.part.mp4')
			const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
				...(score ? ['-i', score] : []), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
				...(score ? ['-c:a', 'aac', '-b:a', '192k'] : []), '-t', (frames / fps).toFixed(3), '-movflags', '+faststart', tmp],
			{ stdio: ['pipe', 'inherit', 'inherit'] })
			const done = new Promise((ok, bad) => { ff.on('close', (c) => (c ? bad(new Error('ffmpeg failed')) : ok())); ff.on('error', bad) })
			const t0 = Date.now()
			for (let i = 0; i < frames; i++) {
				await page.evaluate((t) => window.__show.seek(t), i / fps)
				const jpg = await page.screenshot({ type: 'jpeg', quality: 94 })
				if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r))
				if (i % (fps * 10) === 0) log(`  ${layout} ${(i / fps).toFixed(1).padStart(6)}s / ${meta.duration.toFixed(1)}s`)
			}
			ff.stdin.end()
			await done.catch((e) => die(e.message))
			if (errors.length) die('the page reported errors: ' + errors.slice(0, 3).join('; '))
			renameSync(tmp, dst)
			await page.evaluate((t) => window.__show.seek(t), meta.cover)
			const cover = join(out, `${slug}-${locale}-cover-${SUFFIX[layout]}.jpg`)
			writeFileSync(cover, await page.screenshot({ type: 'jpeg', quality: 92 }))
			log(`  wrote ${p.rel(dst)} (${frames} frames, ${Math.round((Date.now() - t0) / 1000)}s) and ${p.rel(cover)}`)
			if (layout === 'landscape' && p.cfg.coversDir) {
				const siteCover = join(p.root, p.cfg.coversDir, locale === p.site.defaultLocale ? `${slug}.jpg` : `${slug}.${locale}.jpg`)
				mkdirSync(join(siteCover, '..'), { recursive: true })
				run('ffmpeg', ['-y', '-loglevel', 'error', '-i', cover, '-vf', 'scale=1600:-2', '-q:v', '3', siteCover])
				log(`  cover for the site: ${p.rel(siteCover)}`)
			}
			made.push(dst)
			await page.close()
		}
		return made
	} finally {
		await browser.close()
		site.close()
	}
}
