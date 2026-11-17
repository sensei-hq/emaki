// emaki carousel <slug…> | --all: render a campaign day's Instagram carousel (1080×1350 PNGs) from the numbered lines
// of its day script's "Instagram carousel" section, into <campaign>/carousels/<slug>/slide-01.png …, which
// `emaki stage` turns into JPEG and stages. Needs Playwright with Chromium.
//
// The look is a paper card in the Zen-Sumi palette. emaki.config.json "carousel" adjusts it: marks ({ topic: "構" }),
// mark (default), footer (default: the site's address), swipe and last (the corner line), or template (an HTML file
// of your own with {text} {i} {total} {topic} {mark} {size} {cls} {bar} {swipe} {footer}).
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from './capture.js'
import { campaignDir, dayScriptPath, slidesOf, slugOfScript, topicOf } from './day-script.js'
import { die, exists, pad2 } from './util.js'

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Inter:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1080px;height:1350px;background:#F3F0E9;color:#1F1916}
  body{position:relative;font-family:Inter,system-ui,sans-serif;
       background-image:radial-gradient(circle at 18px 18px,#DCD7CD 2px,transparent 2.5px);background-size:36px 36px}
  .k{position:absolute;left:84px;top:78px;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:76px;color:#C25237;line-height:1}
  .p{position:absolute;left:184px;top:104px;font:500 22px 'JetBrains Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#7F7975}
  .n{position:absolute;right:84px;top:104px;font:500 22px 'JetBrains Mono',monospace;color:#7F7975}
  .card{position:absolute;left:84px;right:84px;top:250px;bottom:250px;display:flex;align-items:center;padding:0 64px;
        background:#FCFAF6;border:2px solid #DCD7CD;border-radius:28px}
  .t{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:{size}px;line-height:1.14;letter-spacing:-.02em;white-space:pre-line}
  .first .t{font-weight:300}
  .bar{position:absolute;left:148px;bottom:310px;width:120px;height:6px;border-radius:3px;background:#C25237}
  .u{position:absolute;left:84px;bottom:120px;font:500 26px 'JetBrains Mono',monospace;color:#C25237}
  .s{position:absolute;right:84px;bottom:120px;font:600 24px Inter,sans-serif;color:#48413D}
</style></head><body class="{cls}">
<div class="k">{mark}</div><div class="p">{topic}</div><div class="n">{i} / {total}</div>
<div class="card"><div class="t">{text}</div></div>{bar}
<div class="u">{footer}</div><div class="s">{swipe}</div>
</body></html>`

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** The slides and the topic of a day's carousel. */
export function carouselSlides(p, slug, locale = p.site.defaultLocale) {
	const f = dayScriptPath(p, slug, locale)
	if (!f) die(`no day script for ${slug} in ${p.rel(join(campaignDir(p), 'days'))}/`)
	const md = readFileSync(f, 'utf-8')
	return { topic: topicOf(md), slides: slidesOf(md) }
}

/** One slide's page. Slide 1 is set large with the accent bar; longer text is set smaller. */
export function slideHtml(p, text, i, total, topic) {
	const c = p.cfg.carousel ?? {}
	const tpl = c.template ? readFileSync(join(p.root, c.template), 'utf-8') : PAGE
	const n = text.length, size = i === 1 ? 92 : n < 60 ? 72 : n < 110 ? 60 : 50
	const vals = {
		size, cls: i === 1 ? 'first' : '', mark: esc(c.marks?.[topic] ?? c.mark ?? ''), topic: esc(topic), i, total, text: esc(text),
		bar: i === 1 ? '<div class="bar"></div>' : '', footer: esc(c.footer ?? (p.site.url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')),
		swipe: esc(i < total ? (c.swipe ?? 'Swipe →') : (c.last ?? 'Full story: link in bio'))
	}
	return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? String(vals[k]) : m))
}

/** Headless Chromium at the carousel's size; shoot(html, file) writes one PNG. */
async function openChromium() {
	const browser = await (await chromium()).launch()
	const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } })
	return {
		shoot: async (html, file) => { await page.setContent(html, { waitUntil: 'networkidle' }); await page.screenshot({ path: file }) },
		close: () => browser.close()
	}
}

export async function carousel(p, slugs = [], { all = false, locale = p.site.defaultLocale, open = openChromium, log = console.info } = {}) {
	const days = join(campaignDir(p), 'days')
	if (all) slugs = exists(days) ? readdirSync(days).filter((n) => /^day-\d+-.+\.md$/.test(n)).sort().map(slugOfScript) : []
	if (!slugs.length) die('name a slug, or --all for every day script')
	const work = slugs.map((slug) => {
		const s = carouselSlides(p, slug, locale)
		if (!s.slides.length) die(`${slug}: no carousel slides (numbered lines under "## N · Instagram carousel")`)
		return { slug, ...s }
	})
	const shot = await open(), made = []
	try {
		for (const w of work) {
			const dir = join(campaignDir(p), 'carousels', w.slug)
			mkdirSync(dir, { recursive: true })
			for (const [k, text] of w.slides.entries()) await shot.shoot(slideHtml(p, text, k + 1, w.slides.length, w.topic), join(dir, `slide-${pad2(k + 1)}.png`))
			log(`${w.slug}: ${w.slides.length} slides → ${p.rel(dir)}`)
			made.push({ slug: w.slug, slides: w.slides.length, dir: p.rel(dir) })
		}
	} finally {
		await shot.close()
	}
	return made
}
