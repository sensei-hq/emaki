// The example in real Chromium (CI's browser job): build it, serve it, and check the three things the packages promise.
//   1. the article's figures mount and draw (a scene in each figure's shadow root),
//   2. the story player mounts, advances and switches language,
//   3. /show/<film>?capture=1 installs window.__show with a timeline, a cover time, seek() and the score.
// Failures print as GitHub annotations (visible on the run without signing in) and leave screenshots in test-results/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 5199, base = `http://127.0.0.1:${port}`, out = 'test-results'
mkdirSync(out, { recursive: true })
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'inherit', 'inherit'], detached: true })
const fail = (m) => { console.error(`✗ ${m}`); if (process.env.CI) console.log(`::error title=browser check::${String(m).replace(/\n/g, '%0A')}`); process.exitCode = 1 }
const ok = (m) => console.info(`✓ ${m}`)
let browser, page
try {
	let up = false
	for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(base)).ok } catch { await new Promise((r) => setTimeout(r, 250)) } }
	if (!up) throw new Error(`vite preview did not answer at ${base}`)
	browser = await chromium.launch()
	page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
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
	await page.screenshot({ path: `${out}/example-en.png`, fullPage: false })
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
	await page.screenshot({ path: `${out}/example-es.png`, fullPage: false })
	ok(`Spanish article: "${h1}"`)

	// Dark mode the way rokkit sets it: data-mode on <html>. Every scene follows it and repaints its board.
	const boards = () => page.$$eval('[data-testid^="figure-"] .motion-scene > div, .ms-stage', (hs) => hs.map((h) => {
		const st = h.shadowRoot?.querySelector('#stage')
		return st ? [st.getAttribute('data-mode'), getComputedStyle(st).backgroundColor] : null
	}))
	const light = await boards()
	await page.evaluate(() => { document.documentElement.dataset.mode = 'dark' })
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="figure-"] .motion-scene > div, .ms-stage')].every((h) => h.shadowRoot?.querySelector('#stage')?.getAttribute('data-mode') === 'dark'), null, { timeout: 5000 })
		.catch(() => {})
	const dark = await boards()
	dark.every((b, i) => b?.[0] === 'dark' && b[1] !== light[i]?.[1])
		? ok(`${dark.length} scenes followed <html data-mode="dark"> (${light[0]?.[1]} → ${dark[0]?.[1]})`)
		: fail(`scenes did not go dark: ${JSON.stringify({ light, dark })}`)
	await page.screenshot({ path: `${out}/example-dark.png`, fullPage: false })
	await page.evaluate(() => { document.documentElement.dataset.mode = 'light' })
	// An explicit mode prop beats the page: /?mode=dark on a light page draws every scene dark.
	await page.goto(base + '/?locale=en&mode=dark')
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="figure-"] .motion-scene > div, .ms-stage')].every((h) => h.shadowRoot?.querySelector('#stage')?.getAttribute('data-mode') === 'dark'), null, { timeout: 10000 })
		.then(() => ok('mode="dark" on the components overrides a light page'), () => fail('the mode prop did not reach the scenes'))

	const cap = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
	cap.on('pageerror', (e) => errors.push(String(e)))
	await cap.goto(base + '/show/measure-the-right-work?capture=1&o=landscape&locale=es')
	await cap.waitForFunction(() => window.__show, null, { timeout: 15000 })
	const meta = await cap.evaluate(async () => { await window.__show.ready; return window.__show.meta })
	meta.duration > 10 && meta.scenes.length >= 3 && meta.cover > 0 ? ok(`capture: ${meta.scenes.length} scenes, ${meta.duration.toFixed(1)}s, cover at ${meta.cover.toFixed(1)}s`) : fail(`capture meta ${JSON.stringify(meta)}`)
	await cap.evaluate((t) => window.__show.seek(t), meta.cover)
	await cap.screenshot({ path: `${out}/capture-cover-es.png` })
	const wav = await cap.evaluate(() => window.__show.audio())
	wav === null || wav.length > 1000 ? ok(`score: ${wav ? `${Math.round(wav.length * 0.75 / 1024)} KB WAV` : 'none'}`) : fail('score render failed')
	errors.length ? fail(`page errors: ${errors.slice(0, 3).join(' | ')}`) : ok('no page errors')
} catch (e) {
	fail(e instanceof Error ? e.stack ?? e.message : String(e))
	await page?.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
} finally {
	await browser?.close()
	try { process.kill(-server.pid) } catch { server.kill() }
}
