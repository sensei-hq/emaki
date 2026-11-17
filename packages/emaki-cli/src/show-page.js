// The capture page in headless Chromium: the site to capture (a running one, or the dev server started for the run),
// /show/<slug>?capture=1 opened at a layout's size, and page.evaluate that survives a reload. sheet, render and
// carousel use it. Playwright is an optional dependency: `npm i -D playwright && npx playwright install chromium`.
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { SIZES } from './config.js'
import { retrying } from './media.js'
import { die } from './util.js'

/** page.evaluate that survives the dev server reloading the page under it (a file saved mid-render): it waits for
 *  the show to come back and repeats the same call (render.py's call()). */
export const evaluate = (page, fn, arg) => retrying(() => page.evaluate(fn, arg), async () => {
	await page.waitForFunction(() => window.__show, null, { timeout: 30000 })
	await page.evaluate(() => window.__show.ready)
})

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

/** A page on the capture route at the layout's size, once the show is ready; its meta and the errors it reports. */
export async function openShow(browser, site, slug, layout, locale) {
	const [width, height] = SIZES[layout]
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
	const errors = []
	page.on('pageerror', (e) => errors.push(String(e)))
	await page.goto(site.show(slug, layout, locale))
	await page.waitForFunction(() => window.__show, null, { timeout: 30000 })
	await page.evaluate(() => window.__show.ready)
	return { page, meta: await page.evaluate(() => window.__show.meta), errors }
}
