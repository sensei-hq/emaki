// render drives the capture page in a browser and pipes the frames to ffmpeg. Here the browser is a stand-in (the page
// runs evaluate() against a fake window.__show) and ffmpeg/ffprobe are shell scripts on PATH that log their arguments,
// so every step render takes, and every line it prints, is pinned without Chromium or ffmpeg.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotionError, project as load, render } from '../src/api.js'
import { logger, project, put } from './helpers.js'

const browser = { pages: [], closed: false }
vi.mock('playwright', () => ({ chromium: { launch: async () => fakeBrowser() } }))

let show
function fakeBrowser() {
	browser.closed = false
	browser.pages = []
	return {
		newPage: async ({ viewport }) => {
			const page = {
				viewport, seeks: [], shots: 0, handlers: {},
				on: (ev, fn) => { page.handlers[ev] = fn },
				goto: async (url) => { page.url = url; if (show.errors) page.handlers.pageerror?.(new Error('boom')) },
				waitForFunction: async () => true,
				waitForTimeout: async () => {},
				evaluate: async (fn, arg) => {
					globalThis.window = { __show: { ...show, seek: (t) => page.seeks.push(t) } }
					try { return await fn(arg) } finally { delete globalThis.window }
				},
				screenshot: async () => { page.shots++; return Buffer.from(`JPG${page.shots}`) },
				close: async () => { page.closed = true }
			}
			browser.pages.push(page)
			return page
		},
		close: async () => { browser.closed = true }
	}
}

let bin, calls, savedPath
beforeAll(() => {
	// One folder of fake tools for the file: a new executable is slow to start the first time on some systems.
	bin = mkdtempSync(join(tmpdir(), 'emaki-bin-'))
	calls = join(bin, 'calls.log')
	const script = (name, body) => {
		writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${calls}"\n${body}\n`)
		chmodSync(join(bin, name), 0o755)
	}
	script('ffmpeg', 'cat > /dev/null\nfor a; do last=$a; done\necho FAKE > "$last"')
	script('ffprobe', 'echo "${FAKE_DUR:-12}"')
	savedPath = process.env.PATH
	process.env.PATH = `${bin}:${savedPath}`
})
afterAll(() => {
	process.env.PATH = savedPath
	rmSync(bin, { recursive: true, force: true })
})
beforeEach(() => {
	rmSync(calls, { force: true })
	vi.stubGlobal('fetch', async () => new Response('ok'))
	show = { meta: { duration: 1, cover: 0.5, scenes: [] }, ready: Promise.resolve(), audio: () => Buffer.from('WAVE').toString('base64'), errors: false }
})
afterEach(() => {
	delete process.env.FAKE_DUR
	vi.unstubAllGlobals()
})
const ran = () => (existsSync(calls) ? readFileSync(calls, 'utf-8').trim().split('\n') : [])
const site = { url: 'http://site.test/' }

describe('render', () => {
	it('captures both layouts with the synthesised score, saves the covers and the site cover, and logs each step', async () => {
		const d = project()
		put(d, 'emaki.config.json', { coversDir: 'static/covers' })
		const log = logger()
		const made = await render(load(d), 'demo', { locale: 'en', ...site, fps: 2, log })
		const out = join(d, 'production/demo/en/render')
		expect(made).toEqual([join(out, 'demo-en-16x9.mp4'), join(out, 'demo-en-9x16.mp4')])
		expect(readFileSync(join(out, 'score.wav'), 'utf-8')).toBe('WAVE')
		expect(readFileSync(join(out, 'demo-en-cover-16x9.jpg'), 'utf-8')).toBe('JPG3')
		expect(existsSync(join(out, 'demo-en-16x9.part.mp4'))).toBe(false)
		expect(log.lines.map((l) => l.replace(/, \d+s\)$/, ', Ns)'))).toEqual([
			'  score: production/demo/en/render/score.wav',
			'demo: landscape at 2 fps, 1.0 s, music: synth',
			'  landscape    0.0s / 1.0s',
			'  wrote production/demo/en/render/demo-en-16x9.mp4 (2 frames, Ns)',
			'  cover: production/demo/en/render/demo-en-cover-16x9.jpg (film time 0.5 s)',
			'  cover for the site: static/covers/demo.jpg',
			'demo: portrait at 2 fps, 1.0 s, music: synth',
			'  portrait    0.0s / 1.0s',
			'  wrote production/demo/en/render/demo-en-9x16.mp4 (2 frames, Ns)',
			'  cover: production/demo/en/render/demo-en-cover-9x16.jpg (film time 0.5 s)'
		])
		const [land, port] = browser.pages
		expect(land.viewport).toEqual({ width: 1920, height: 1080 })
		expect(port.viewport).toEqual({ width: 1080, height: 1920 })
		expect(land.url).toBe('http://site.test/show/demo?capture=1&o=landscape&locale=en')
		expect(land.seeks).toEqual([0, 0.5, 0.5])
		expect(land.closed && port.closed && browser.closed).toBe(true)
		const score = join(out, 'score.wav')
		expect(ran()).toEqual([
			`ffmpeg -y -loglevel error -f image2pipe -framerate 2 -c:v mjpeg -i - -ss 0.000 -i ${score} -map 0:v -map 1:a -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 2 -c:a aac -b:a 192k -t 1.000 -movflags +faststart ${join(out, 'demo-en-16x9.part.mp4')}`,
			`ffmpeg -y -loglevel error -i ${join(out, 'demo-en-cover-16x9.jpg')} -vf scale=1600:-2 -q:v 3 ${join(d, 'static/covers/demo.jpg')}`,
			`ffmpeg -y -loglevel error -f image2pipe -framerate 2 -c:v mjpeg -i - -ss 0.000 -i ${score} -map 0:v -map 1:a -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 2 -c:a aac -b:a 192k -t 1.000 -movflags +faststart ${join(out, 'demo-en-9x16.part.mp4')}`
		])
	})

	it('a film without a score renders a silent picture; a range and an --out file take one layout', async () => {
		const d = project()
		show.audio = () => null
		show.meta = { duration: 30, cover: 2, scenes: [] }
		const log = logger(), dst = join(d, 'clips/hook.mp4')
		const made = await render(load(d), 'demo', { locale: 'en', ...site, o: 'portrait', fps: 1, from: 2, to: 13, out: dst, log })
		expect(made).toEqual([dst])
		expect(log.lines.map((l) => l.replace(/, \d+s\)$/, ', Ns)'))).toEqual([
			'  the film has no score: silent picture',
			'demo: portrait at 1 fps, 2.0–13.0 s, no music',
			'  portrait    2.0s / 13.0s',
			'  portrait   12.0s / 13.0s',
			'  wrote clips/hook.mp4 (11 frames, Ns)',
			'  cover: production/demo/en/render/demo-en-cover-9x16.jpg (film time 2.0 s)'
		])
		expect(browser.pages[0].seeks.slice(0, 3)).toEqual([2, 3, 4])
		expect(ran()).toEqual([
			`ffmpeg -y -loglevel error -f image2pipe -framerate 1 -c:v mjpeg -i - -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 1 -t 11.000 -movflags +faststart ${join(d, 'clips/hook.part.mp4')}`
		])
	})

	it('--audio-only lays the music on the existing render, warns when it is stale, and captures no frames', async () => {
		const d = project()
		const out = join(d, 'production/demo/en/render')
		put(d, 'production/demo/en/render/demo-en-16x9.mp4', 'OLD')
		process.env.FAKE_DUR = '0.5'
		const log = logger()
		const made = await render(load(d), 'demo', { locale: 'en', ...site, o: 'landscape', audioOnly: true, log })
		expect(made).toEqual([join(out, 'demo-en-16x9.mp4')])
		expect(log.lines).toEqual([
			'  score: production/demo/en/render/score.wav',
			'  warning: production/demo/en/render/demo-en-16x9.mp4: the render runs 0.5 s but the film now runs 1.0 s; render the frames again',
			'  music laid on production/demo/en/render/demo-en-16x9.mp4',
			'  cover: production/demo/en/render/demo-en-cover-16x9.jpg (film time 0.5 s)'
		])
		expect(ran()).toEqual([
			`ffprobe -v error -show_entries format=duration -of csv=p=0 ${join(out, 'demo-en-16x9.mp4')}`,
			`ffmpeg -y -loglevel error -i ${join(out, 'demo-en-16x9.mp4')} -ss 0.000 -i ${join(out, 'score.wav')} -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -t 0.500 -movflags +faststart ${join(out, 'demo-en-16x9.mux.mp4')}`
		])
		expect(browser.pages[0].seeks).toEqual([0.5])
	})

	it('--audio-only with no music says so; with no render it says what to run', async () => {
		const d = project()
		put(d, 'production/demo/en/render/demo-en-9x16.mp4', 'OLD')
		const log = logger()
		await render(load(d), 'demo', { locale: 'en', ...site, o: 'portrait', audioOnly: true, music: 'export', log })
		expect(log.lines).toEqual([
			`  no ${join(d, 'production/demo/en/demo.mp4')}: silent picture`,
			'  warning: production/demo/en/render/demo-en-9x16.mp4: the render runs 12.0 s but the film now runs 1.0 s; render the frames again',
			'  no music to lay on production/demo/en/render/demo-en-9x16.mp4',
			'  cover: production/demo/en/render/demo-en-cover-9x16.jpg (film time 0.5 s)'
		])
		await expect(render(load(d), 'demo', { locale: 'en', ...site, o: 'landscape', audioOnly: true, music: 'none', log: logger() }))
			.rejects.toThrow('--audio-only needs production/demo/en/render/demo-en-16x9.mp4; render it first')
		expect(browser.closed).toBe(true)
	})

	it('--cover-only saves just the covers; an exported film\'s audio is used as the music', async () => {
		const d = project()
		const log = logger()
		expect(await render(load(d), 'demo', { locale: 'en', ...site, coverOnly: true, log })).toEqual([])
		expect(log.lines).toEqual([
			'  cover: production/demo/en/render/demo-en-cover-16x9.jpg (film time 0.5 s)',
			'  cover: production/demo/en/render/demo-en-cover-9x16.jpg (film time 0.5 s)'
		])
		expect(ran()).toEqual([])
		put(d, 'production/demo/en/demo.mp4', 'EXPORT')
		const log2 = logger()
		await render(load(d), 'demo', { locale: 'en', ...site, o: 'landscape', fps: 1, music: 'export', log: log2 })
		expect(log2.lines[0]).toBe('demo: landscape at 1 fps, 1.0 s, music: export')
		expect(ran()[0]).toContain(`-ss 0.000 -i ${join(d, 'production/demo/en/demo.mp4')} -map 0:v -map 1:a`)
	})

	it('page errors fail the capture after ffmpeg finishes, and leave the part file', async () => {
		const d = project()
		show.errors = true
		await expect(render(load(d), 'demo', { locale: 'en', ...site, o: 'landscape', fps: 1, music: 'none', log: logger() }))
			.rejects.toThrow(new MotionError('the page reported errors: Error: boom'))
		expect(existsSync(join(d, 'production/demo/en/render/demo-en-16x9.part.mp4'))).toBe(true)
		expect(existsSync(join(d, 'production/demo/en/render/demo-en-16x9.mp4'))).toBe(false)
		expect(browser.closed).toBe(true)
	})
})
