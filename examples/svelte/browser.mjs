// The example in real Chromium (CI's browser job): build it, serve it, and check the three things the packages promise.
//   1. the article's figures mount and draw (a scene in each figure's shadow root),
//   2. the story player mounts, advances and switches language,
//   3. /show/<film>?capture=1 installs window.__show with a timeline, a cover time, seek() and the score,
//   4. the narration (content/films/<film>/voice/en/*.m4a, `emaki voice-web`) plays in the player and the figures.
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
	// Figures as the website draws them: an image with a label, and a button for the scene's slice of the score.
	const labels = await page.$$eval('[data-testid^="figure-"] [role="img"]', (els) => els.map((e) => e.getAttribute('aria-label')))
	labels.length === figs.length && labels.every(Boolean) ? ok(`figures are labelled images ("${labels[0]}")`) : fail(`figure labels ${JSON.stringify(labels)}`)
	await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="figure-"] button[aria-label="Turn sound on"]').length === n, figs.length, { timeout: 10000 })
		.then(() => ok('every figure has a sound button'), () => fail('figures have no sound button'))
	// The player opens on its cover, then plays with progress ticks, a full-screen link and the keys.
	await page.waitForSelector('[data-testid="player"] [aria-label^="Play the film"]', { timeout: 10000 }).then(() => ok('player opens on its poster'), () => fail('no poster on the player'))
	await page.click('[data-testid="player"] [aria-label^="Play the film"]').catch(() => {})
	await page.waitForSelector('[data-testid="player"] .ms-count')
	const nTicks = await page.$$eval('[data-testid="player"] .ms-ticks button', (b) => b.length)
	nTicks === 5 ? ok('a progress tick per scene') : fail(`progress ticks: ${nTicks}`)
	const full = await page.getAttribute('[data-testid="player"] a[aria-label="Open full screen"]', 'href', { timeout: 2000 }).catch(() => null)
	full === '/show/measure-the-right-work' ? ok('full-screen link') : fail(`full-screen link: ${full}`)
	const before = await page.textContent('[data-testid="player"] .ms-count')
	await page.click('[aria-label="Next scene"]')
	const after = await page.textContent('[data-testid="player"] .ms-count')
	before !== after ? ok(`player advances (${before} → ${after})`) : fail('player did not advance')
	await page.click('[data-testid="player"] [aria-label="Pause"]').catch(() => {})
	await page.click('[aria-label="Next scene"]')
	if ((await page.textContent('[data-testid="player"] .ms-count'))?.startsWith('1 /')) await page.click('[aria-label="Next scene"]')
	await page.focus('[data-testid="player"] .motion-show')
	await page.keyboard.press('Home')
	await page.waitForFunction(() => document.querySelector('[data-testid="player"] .ms-count')?.textContent?.startsWith('1 /'), null, { timeout: 5000 })
		.then(() => ok('Home goes back to the first scene'), () => fail('Home did not restart the film'))
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

	// The figure's speaker button stays legible on its scene: icon against the disc (blended over the scene's board),
	// WCAG 3:1 for UI graphics, whatever the page's text colour and whichever mode the scene draws in.
	const speakers = () => page.$$eval('[data-testid^="figure-"] .motion-scene', (els) => els.map((el) => {
		const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number), k = c.startsWith('color(') ? 255 : 1; return [m[0] * k, m[1] * k, m[2] * k, m[3] ?? 1] }
		const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0)
		const btn = el.querySelector('button'), st = el.querySelector(':scope > div')?.shadowRoot?.querySelector('#stage')
		if (!btn || !st) return null
		const board = rgba(getComputedStyle(st).backgroundColor), disc = rgba(getComputedStyle(btn).backgroundColor)
		const under = board.slice(0, 3).map((v, i) => disc[i] * disc[3] + v * (1 - disc[3]))
		const icon = rgba(getComputedStyle(btn).color)
		const [a, b] = [lum(icon), lum(under)].sort((x, y) => y - x)
		return +((a + 0.05) / (b + 0.05)).toFixed(2)
	}))
	const legible = (what, cs) => cs.length && cs.every((c) => c >= 3) ? ok(`speaker icons legible ${what} (contrast ${Math.min(...cs)}:1)`) : fail(`speaker icons illegible ${what}: ${JSON.stringify(cs)}`)
	legible('in light mode', await speakers())

	// Dark mode the way rokkit sets it: data-mode on <html>. Every scene follows it and repaints its board.
	const boards = () => page.$$eval('[data-testid^="figure-"] .motion-scene > div, .ms-stage', (hs) => hs.map((h) => {
		const st = h.shadowRoot?.querySelector('#stage')
		return st ? [st.getAttribute('data-mode'), getComputedStyle(st).backgroundColor] : null
	}))
	const light = await boards()
	await page.evaluate(() => { document.documentElement.dataset.mode = 'dark'; document.body.style.color = '#ece8df' })
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="figure-"] .motion-scene > div, .ms-stage')].every((h) => h.shadowRoot?.querySelector('#stage')?.getAttribute('data-mode') === 'dark'), null, { timeout: 5000 })
		.catch(() => {})
	const dark = await boards()
	dark.every((b, i) => b?.[0] === 'dark' && b[1] !== light[i]?.[1])
		? ok(`${dark.length} scenes followed <html data-mode="dark"> (${light[0]?.[1]} → ${dark[0]?.[1]})`)
		: fail(`scenes did not go dark: ${JSON.stringify({ light, dark })}`)
	await page.screenshot({ path: `${out}/example-dark.png`, fullPage: false })
	legible('on a dark page', await speakers())
	await page.evaluate(() => { document.documentElement.dataset.mode = 'light'; document.body.style.color = '' })
	// An explicit mode prop beats the page: /?mode=dark on a light page draws every scene dark.
	await page.goto(base + '/?locale=en&mode=dark')
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="figure-"] .motion-scene > div, .ms-stage')].every((h) => h.shadowRoot?.querySelector('#stage')?.getAttribute('data-mode') === 'dark'), null, { timeout: 10000 })
		.then(() => ok('mode="dark" on the components overrides a light page'), () => fail('the mode prop did not reach the scenes'))
	legible('on dark scenes in a light page', await speakers())
	// The OS in dark mode on a page that declares color-scheme (system colours like Canvas turn dark), page left light.
	await page.emulateMedia({ colorScheme: 'dark' })
	await page.goto(base + '/?locale=en')
	await page.evaluate(() => { document.documentElement.style.colorScheme = 'light dark' })
	await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="figure-"] button[aria-label="Turn sound on"]').length === n, figs.length, { timeout: 10000 }).catch(() => {})
	legible('with the OS in dark mode', await speakers())
	await page.emulateMedia({ colorScheme: 'light' })

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
	// Narration: every Audio the page makes is recorded; with sound on, the scene on screen speaks, in step.
	const nar = await browser.newPage({ viewport: { width: 1280, height: 900 } })
	nar.on('pageerror', (e) => errors.push(String(e)))
	await nar.addInitScript(() => {
		const A = window.Audio
		window.__audio = []
		window.Audio = class extends A { constructor(src) { super(src); window.__audio.push(this) } }
	})
	const speaking = (scene) => nar.waitForFunction((id) => window.__audio.some((a) => a.src.includes(`/${id}`) && a.src.endsWith('.m4a') && !a.paused && a.currentTime > 0.2), scene, { timeout: 8000 })
	await nar.goto(base + '/?locale=en')
	await nar.click('[data-testid="player"] [aria-label^="Play the film"]')
	await speaking('hook').then(async () => {
		const a = await nar.evaluate(() => { const x = window.__audio.find((a) => !a.paused); return { src: x.src.split('/').pop(), t: x.currentTime, d: x.duration } })
		ok(`player narrates its scene (${a.src}, ${a.t.toFixed(1)} of ${a.d.toFixed(1)} s)`)
	}, () => fail('the player is silent: no narration played after Play'))
	await nar.click('[data-testid="player"] [aria-label="Pause"]').catch(() => {})
	await nar.waitForFunction(() => window.__audio.length > 0 && window.__audio.every((a) => a.paused), null, { timeout: 3000 })
		.then(() => ok('pause silences the narration'), () => fail('narration kept playing after pause'))
	const fig = (await nar.$$eval('[data-testid^="figure-"]', (els) => els.map((e) => e.getAttribute('data-testid').slice(7))))[1]
	await nar.locator(`[data-testid="figure-${fig}"]`).scrollIntoViewIfNeeded()
	await nar.click(`[data-testid="figure-${fig}"] button[aria-label="Turn sound on"]`)
	await speaking(fig).then(() => ok(`figure "${fig}" narrates its scene`), () => fail(`figure "${fig}" is silent with sound on`))
	await nar.click(`[data-testid="figure-${fig}"] button[aria-label="Turn sound off"]`)
	await nar.waitForFunction(() => window.__audio.length > 0 && window.__audio.every((a) => a.paused), null, { timeout: 3000 })
		.then(() => ok('the figure\'s sound turns off'), () => fail('figure narration kept playing after sound off'))

	errors.length ? fail(`page errors: ${errors.slice(0, 3).join(' | ')}`) : ok('no page errors')
} catch (e) {
	fail(e instanceof Error ? e.stack ?? e.message : String(e))
	await page?.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
} finally {
	await browser?.close()
	try { process.kill(-server.pid) } catch { server.kill() }
}
