// sheet and render drive the site's capture page in headless Chromium: /show/<slug>?capture=1 installs
// window.__show = { meta, ready, seek(t), audio() } (installCapture in @senseihq/emaki; ShowPage in each wrapper).
// Playwright is an optional dependency: `npm i -D playwright && npx playwright install chromium`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, openShow, openSite } from './show-page.js'
import { die } from './util.js'

// The capture page (show-page.js) and render (render.js), re-exported: carousel, the CLI and the API import them here.
export { chromium, openSite }
export { render } from './render.js'

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
