// emaki build: the final videos from the render and the takes. ffmpeg and ffprobe are stand-ins that log their
// arguments (ffprobe answers $FAKE_DUR seconds and an audio stream unless $FAKE_STREAMS is empty), so the files build
// writes, the ffmpeg runs it makes, the lines it prints and the ways it refuses to run are pinned without real media.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { build, captions, MotionError, project as load } from '../src/api.js'
import { logger, project, put } from './helpers.js'
import { tools } from './tools.js'

let t
beforeAll(() => { t = tools() }, 60000)
afterAll(() => { t.restore(); t.remove() })
beforeEach(() => { t.use(); t.reset() })
afterEach(() => vi.unstubAllEnvs())

const OUT = 'production/demo/en/out', RENDER = 'production/demo/en/render'

/** The demo film with both takes and, unless told otherwise, both renders. */
function ready({ renders = ['16x9', '9x16'], takes = [1, 2] } = {}) {
	const d = project({ built: false })
	for (const n of takes) put(d, `production/demo/en/takes/take-0${n}.wav`, 'WAV')
	for (const sfx of renders) put(d, `${RENDER}/demo-en-${sfx}.mp4`, 'MP4')
	return d
}
const ffmpeg = () => t.ran().filter((l) => l.startsWith('ffmpeg '))

describe('build', () => {
	it('builds both orientations (the score at the configured level), the web copy, captions, chapters, the description and the posters', () => {
		const d = ready()
		put(d, 'content/films/demo/timing.en.json', { scenes: { hook: { dur: 10 } } })
		put(d, 'emaki.config.json', { storyUrl: 'https://site.example/articles/{slug}', scoreLevel: 0.3 })
		put(d, `${RENDER}/demo-en-cover-16x9.jpg`, 'COVER')
		put(d, `${RENDER}/demo-en-cover-9x16.jpg`, 'COVER')
		const log = logger()
		const r = build(load(d), 'demo', { locale: 'en', log })
		const out = join(d, OUT)
		expect(r.built).toEqual([join(out, 'demo-en-16x9.mp4'), join(out, 'demo-en-9x16.mp4'), join(out, 'demo-en-web.mp4')])
		expect(r.duration).toBe(28)
		expect(log.lines).toEqual([
			'Demo film (en): 28.0 s as rendered',
			' #  scene          dur  take   ext    new  start',
			' 1  hook          10.0   2.0   0.0   10.0  00:00',
			' 2  close         18.0   2.0   0.0   18.0  00:10',
			'total 28.0 s',
			`built ${OUT}/demo-en-16x9.mp4 (2 chapters)`,
			`built ${OUT}/demo-en-9x16.mp4 (2 chapters)`,
			`built ${OUT}/demo-en-web.mp4 (0.0 MiB)`,
			`  ${OUT}/poster.jpg`,
			`  ${OUT}/poster-vertical.jpg`,
			`  ${OUT}/demo-en-thumb.jpg`,
			`captions: ${OUT}/demo-en.vtt/.srt; chapters.txt, description.txt`
		])
		expect(readFileSync(join(out, 'demo-en.srt'), 'utf-8')).toBe('1\n00:00:00,600 --> 00:00:02,500\nHi.\n\n2\n00:00:10,600 --> 00:00:12,500\nBye.\n')
		expect(readFileSync(join(out, 'demo-en.vtt'), 'utf-8')).toMatch(/^WEBVTT\n\n00:00:00\.600 --> 00:00:02\.500\nHi\.\n/)
		expect(readFileSync(join(out, 'chapters.txt'), 'utf-8')).toBe('0:00 Hook\n0:10 Close\n')
		expect(readFileSync(join(out, 'description.txt'), 'utf-8')).toBe('Demo story\n\n0:00 Hook\n0:10 Close\n\nhttps://site.example/articles/demo\n')
		expect(readFileSync(join(out, 'poster.jpg'), 'utf-8')).toBe('COVER')
		expect(existsSync(join(out, 'chapters.ffmeta'))).toBe(false)
		const runs = ffmpeg()
		expect(runs).toHaveLength(5)
		expect(runs[0]).toBe(`ffmpeg -y -v error -i ${join(d, 'production/demo/en/takes/take-01.wav')} -i ${join(d, 'production/demo/en/takes/take-02.wav')} -filter_complex [0:a]aresample=48000,adelay=600|600,apad[v0];[1:a]aresample=48000,adelay=10600|10600,apad[v1];[v0][v1]amix=inputs=2:normalize=0,atrim=0:28.000[vo] -map [vo] -ac 2 ${join(out, 'voice.wav')}`)
		expect(runs[1]).toContain(`subtitles=${join(out, 'demo-en.srt').replace(/([:\\'])/g, '\\$1')}:force_style='FontName=Inter,FontSize=16,`)
		expect(runs[1]).toContain('MarginV=34')
		expect(runs[1]).toContain('[mu]volume=0.3[sc]')
		expect(runs[2]).toContain('FontSize=9,')
		expect(runs[2]).toContain('MarginV=50')
		expect(runs[3]).toBe(`ffmpeg -y -v error -i ${join(out, 'demo-en-16x9.mp4')} -r 30 -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -map_chapters 0 -movflags +faststart ${join(out, 'demo-en-web.mp4')}`)
		expect(runs[4]).toContain(`-vf scale=1280:720 -q:v 3 ${join(out, 'demo-en-thumb.jpg')}`)
	})

	it('one orientation, no captions, a silent render, a timing file with no scenes and a folder of its own', () => {
		const d = ready({ renders: ['9x16'] })
		put(d, 'content/films/demo/timing.en.json', {})
		rmSync(join(d, 'content/stories/en/demo.json'))
		vi.stubEnv('FAKE_STREAMS', '')
		const log = logger(), dst = join(d, 'shipping')
		const r = build(load(d), 'demo', { locale: 'en', noCaptions: true, out: dst, log, length: () => 1.5 })
		expect(r.built).toEqual([join(dst, 'demo-en-9x16.mp4')])
		const runs = ffmpeg()
		expect(runs[1]).not.toContain('subtitles=')
		expect(runs[1]).not.toContain('volume=')
		expect(runs.slice(2)).toEqual([
			`ffmpeg -y -v error -ss 14.50 -i ${join(dst, 'demo-en-9x16.mp4')} -frames:v 1 -q:v 2 ${join(dst, 'poster-vertical.jpg')}`
		])
		expect(readFileSync(join(dst, 'description.txt'), 'utf-8')).toMatch(/^Demo film\n/)
		expect(log.lines.at(-2)).toBe('  shipping/poster-vertical.jpg')
	}, 10000)

	it('titles the description with the slug when the film has no title and no story', () => {
		const d = ready()
		put(d, 'content/films/demo/film.json', { scenes: [{ id: 'hook', dur: 12 }, { id: 'close', dur: 18 }] })
		rmSync(join(d, 'content/stories/en/demo.json'))
		build(load(d), 'demo', { locale: 'en', log: () => {} })
		expect(readFileSync(join(d, OUT, 'description.txt'), 'utf-8')).toMatch(/^demo\n/)
	})

	it('--check prints the plan, the missing takes and a missing render, and builds nothing', () => {
		const d = ready({ renders: [], takes: [1] })
		const log = logger()
		const r = build(load(d), 'demo', { locale: 'en', check: true, log, length: () => 14 })
		expect(r.built).toEqual([])
		expect(r.duration).toBeCloseTo(33.8)
		expect(log.lines).toContain('missing takes: close')
		expect(log.lines.at(-1)).toBe(`MISSING: no render in ${RENDER}; run \`emaki render demo --locale en\``)
		expect(ffmpeg()).toEqual([])
		const ok = logger()
		build(load(ready()), 'demo', { locale: 'en', check: true, log: ok })
		expect(ok.lines.at(-1)).toBe('total 30.0 s')
	})

	it('refuses to build without takes, or without a render', () => {
		expect(() => build(load(ready({ takes: [] })), 'demo', { locale: 'en', log: () => {} }))
			.toThrow(new MotionError('no takes in production/demo/en/takes; run `emaki voice` (or record them) first'))
		expect(() => build(load(ready({ renders: [] })), 'demo', { locale: 'en', log: () => {} }))
			.toThrow(new MotionError(`no render in ${RENDER}; run \`emaki render demo --locale en\` first`))
	})

	it('logs to the console by default', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => {})
		try {
			build(load(ready()), 'demo', { locale: 'en', check: true })
			expect(info).toHaveBeenCalledWith('Demo film (en): 30.0 s as rendered')
		} finally {
			info.mockRestore()
		}
	})
})

describe('captions', () => {
	it('spread each take over its sentences by length, measuring the takes with ffprobe by default', () => {
		const d = ready()
		const f = join(d, 'production/demo/en/takes/take-01.wav')
		const { srt } = captions(new Map([['hook', [f, { text: 'One two. Three!' }]]]), new Map([['hook', [3600, 12]]]), 0.5)
		expect(srt).toBe('1\n01:00:00,500 --> 01:00:01,586\nOne two.\n\n2\n01:00:01,586 --> 01:00:02,400\nThree!\n')
	})
})
