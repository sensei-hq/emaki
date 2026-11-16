// The example in real Chromium (CI's browser job): build it, serve it, and check the three things the packages promise.
//   1. the article's figures mount and draw (a scene in each figure's shadow root),
//   2. the story player mounts, advances and switches language,
//   3. /show/<film>?capture=1 installs window.__show with a timeline, a cover time, seek() and the score.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 5199, base = `http://localhost:${port}`
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true })
const fail = (m) => { console.error(`✗ ${m}`); process.exitCode = 1 }
const ok = (m) => console.info(`✓ ${m}`)
try {
	for (let i = 0; i < 60; i++) { try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 250)) } }
	const browser = await chromium.launch()
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
	const errors = []
	page.on('pageerror', (e) => errors.push(String(e)))
	await page.goto(base + '/?locale=en')
	await page.waitForSelector('[data-testid^="figure-"]')
	const figs = await page.$$eval('[data-testid^="figure-"]', (els) => els.map((e) => e.getAttribute('data-testid')))
	figs.length ? ok(`${figs.length} figures: ${figs.join(', ')}`) : fail('no figures')
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="figure-"] .motion-scene > div')].every((h) => h.shadowRoot?.querySelector('svg, div')), null, { timeout: 15000 })
	const sizes = await page.$$eval('[data-testid^="figure-"] .motion-scene > div', (els) => els.map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]))
	sizes.every(([w, h]) => w > 300 && Math.abs(w / h - 1.6) < 0.02) ? ok(`figures fitted at 16:10 (${sizes[0].join('x')})`) : fail(`figure sizes ${JSON.stringify(sizes)}`)
	await page.waitForSelector('[data-testid="player"] .ms-count')
	const before = await page.textContent('[data-testid="player"] .ms-count')
	await page.click('[aria-label="Next scene"]')
	const after = await page.textContent('[data-testid="player"] .ms-count')
	before !== after ? ok(`player advances (${before} → ${after})`) : fail('player did not advance')
	await page.screenshot({ path: 'example-en.png', fullPage: false })
	const en = await page.textContent('h1')
	await page.click('nav button:has-text("es")')
	await page.waitForFunction((x) => document.querySelector('h1')?.textContent !== x, en, { timeout: 10000 }).catch(() => {})
	const h1 = await page.textContent('h1')
	if (h1 === en) fail('the article did not switch to Spanish')
	await page.waitForFunction(() => document.querySelector('.ms-stage')?.shadowRoot?.querySelector('#stage')?.getAttribute('lang') === 'es', null, { timeout: 10000 })
		.then(() => ok('player restarted in Spanish'), () => fail('the player is empty after switching language'))
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="figure-"] .motion-scene > div')].every((h) => h.shadowRoot?.querySelector('#stage')?.getAttribute('lang') === 'es'), null, { timeout: 10000 })
		.then(() => ok('figures redrawn in Spanish'), () => fail('figures did not switch language'))
	await page.waitForSelector('[data-testid="player"] .ms-count'); await page.waitForTimeout(800)
	await page.screenshot({ path: 'example-es.png', fullPage: false })
	ok(`Spanish article: "${h1}"`)

	const cap = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
	cap.on('pageerror', (e) => errors.push(String(e)))
	await cap.goto(base + '/show/measure-the-right-work?capture=1&o=landscape&locale=es')
	await cap.waitForFunction(() => window.__show, null, { timeout: 15000 })
	const meta = await cap.evaluate(async () => { await window.__show.ready; return window.__show.meta })
	meta.duration > 10 && meta.scenes.length >= 3 && meta.cover > 0 ? ok(`capture: ${meta.scenes.length} scenes, ${meta.duration.toFixed(1)}s, cover at ${meta.cover.toFixed(1)}s`) : fail(`capture meta ${JSON.stringify(meta)}`)
	await cap.evaluate((t) => window.__show.seek(t), meta.cover)
	await cap.screenshot({ path: 'capture-cover-es.png' })
	const wav = await cap.evaluate(() => window.__show.audio())
	wav === null || wav.length > 1000 ? ok(`score: ${wav ? `${Math.round(wav.length * 0.75 / 1024)} KB WAV` : 'none'}`) : fail('score render failed')
	errors.length ? fail(`page errors: ${errors.slice(0, 3).join(' | ')}`) : ok('no page errors')
	await browser.close()
} finally {
	try { process.kill(-server.pid) } catch { server.kill() }
}
