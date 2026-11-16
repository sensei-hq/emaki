// render and build, the parts that decide: frame ranges, output paths, ffmpeg arguments, the freeze table, chapters,
// the description. The shells in capture.js and voice.js only run what these return; nothing here needs ffmpeg, a
// browser or a network.
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MotionError } from '../src/api.js'
import {
	buildArgs, buildPlan, chaptersText, description, encodeArgs, ffmeta, frameRange, musicFor, muxArgs, planTable, renderOut,
	renderSteps, retrying, staleRender, storyLink, ytChapters
} from '../src/media.js'

describe('render: --from / --to', () => {
	it('captures the whole film by default', () => {
		expect(frameRange(12.5, 30)).toEqual({ t0: 0, end: 12.5, frames: 375, seconds: 12.5 })
	})
	it('captures a range, and clamps --to to the film', () => {
		expect(frameRange(12.5, 30, 2, 4)).toEqual({ t0: 2, end: 4, frames: 60, seconds: 2 })
		expect(frameRange(12.5, 30, 10, 99)).toMatchObject({ end: 12.5, frames: 75 })
		expect(frameRange(12.5, 30, -3)).toMatchObject({ t0: 0, frames: 375 })
	})
	it('always captures at least one frame', () => {
		expect(frameRange(12.5, 30, 3, 3.001).frames).toBe(1)
	})
	it('refuses a range that is empty or outside the film', () => {
		expect(() => frameRange(12.5, 30, 5, 4)).toThrow(MotionError)
		expect(() => frameRange(12.5, 30, 13)).toThrow(/--from 13/)
		expect(() => frameRange(12.5, 30, Number.NaN)).toThrow(MotionError)
	})
})

describe('render: --out', () => {
	const dir = '/p/production/demo/en/render'
	it('writes <slug>-<locale>-16x9.mp4 / -9x16.mp4 into the render folder by default', () => {
		expect(renderOut(dir, 'demo', 'en', 'landscape')).toBe(join(dir, 'demo-en-16x9.mp4'))
		expect(renderOut(dir, 'demo', 'en', 'portrait')).toBe(join(dir, 'demo-en-9x16.mp4'))
	})
	it('takes a file for one layout', () => {
		expect(renderOut(dir, 'demo', 'en', 'portrait', { out: 'clip.mp4', layouts: 1 })).toBe(resolve('clip.mp4'))
	})
	it('takes a folder for any number of layouts, keeping the names', () => {
		expect(renderOut(dir, 'demo', 'en', 'landscape', { out: 'previews', layouts: 2 })).toBe(resolve('previews', 'demo-en-16x9.mp4'))
	})
	it('refuses one file for two layouts', () => {
		expect(() => renderOut(dir, 'demo', 'en', 'landscape', { out: 'clip.mp4', layouts: 2 })).toThrow(/one layout/)
	})
})

describe('render: --music', () => {
	const exportFile = '/p/production/demo/en/demo.mp4'
	it('synth (the default) is the score the page renders on the film\'s own timing', () => {
		expect(musicFor(undefined)).toEqual({ kind: 'synth' })
		expect(musicFor('synth')).toEqual({ kind: 'synth' })
	})
	it('export lays the audio of an exported film, or renders silent when there is none', () => {
		expect(musicFor('export', { exportFile, exists: () => true })).toEqual({ kind: 'file', file: exportFile })
		const none = musicFor('export', { exportFile, exists: () => false })
		expect(none.kind).toBe('none')
		expect(none.note).toMatch(/demo\.mp4.*silent/)
	})
	it('none is a silent picture; anything else is refused', () => {
		expect(musicFor('none')).toEqual({ kind: 'none' })
		expect(() => musicFor('loud')).toThrow(/synth \| export \| none/)
	})
})

describe('render: ffmpeg arguments', () => {
	it('encodes piped JPEG frames, with the music from the first frame\'s film time', () => {
		const a = encodeArgs({ fps: 30, seconds: 2, dst: 'x.part.mp4', audio: 'score.wav', t0: 4 })
		const i = a.indexOf('-f')
		expect(a.slice(i, i + 8)).toEqual(['-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-'])
		const s = a.join(' ')
		expect(s).toContain('-ss 4.000 -i score.wav')
		expect(s).toContain('-map 0:v -map 1:a')
		expect(s).toContain('-c:a aac -b:a 192k')
		expect(s).toContain('-t 2.000')
		expect(a.at(-1)).toBe('x.part.mp4')
	})
	it('a silent picture has no audio input and no audio codec', () => {
		const a = encodeArgs({ fps: 30, seconds: 2, dst: 'x.mp4' })
		expect(a.filter((x) => x === '-i')).toHaveLength(1)
		expect(a).not.toContain('-c:a')
		expect(a.join(' ')).not.toContain('1:a')
	})
	it('--audio-only copies the picture and lays the music under it', () => {
		const a = muxArgs('demo-en-9x16.mp4', 'score.wav', 2, 10.5, 'demo-en-9x16.mux.mp4')
		expect(a.join(' ')).toBe('-y -loglevel error -i demo-en-9x16.mp4 -ss 2.000 -i score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -t 10.500 -movflags +faststart demo-en-9x16.mux.mp4')
	})
	it('warns when the render no longer matches the film (unless it was a range)', () => {
		expect(staleRender(30.1, 30)).toBeNull()
		expect(staleRender(28, 30)).toMatch(/runs 28\.0 s but the film now runs 30\.0 s/)
		expect(staleRender(5, 30, true)).toBeNull()
	})
})

describe('render: the dev server reloading mid-capture', () => {
	it('waits for the show to come back and repeats the same call', async () => {
		let calls = 0, recovered = 0
		const v = await retrying(async () => {
			if (++calls < 3) throw new Error('Execution context was destroyed')
			return 'seeked'
		}, async () => { recovered++ })
		expect(v).toBe('seeked')
		expect(calls).toBe(3)
		expect(recovered).toBe(2)
	})
	it('gives up after 8 attempts with the last error', async () => {
		let calls = 0
		await expect(retrying(async () => { calls++; throw new Error(`gone ${calls}`) }, async () => {})).rejects.toThrow('gone 8')
		expect(calls).toBe(8)
	})
	it('does not retry when the call succeeds', async () => {
		let recovered = 0
		expect(await retrying(async () => 1, async () => { recovered++ })).toBe(1)
		expect(recovered).toBe(0)
	})
})

describe('render: --audio-only / --cover-only', () => {
	it('a plain render captures frames, lays the music and saves the covers', () => {
		expect(renderSteps({})).toEqual({ frames: true, music: true, cover: true })
	})
	it('--audio-only lays the music on the existing render; --cover-only just saves the covers', () => {
		expect(renderSteps({ audioOnly: true })).toEqual({ frames: false, music: true, cover: true })
		expect(renderSteps({ coverOnly: true })).toEqual({ frames: false, music: false, cover: true })
		expect(() => renderSteps({ audioOnly: true, coverOnly: true })).toThrow(MotionError)
	})
})

// hook: a take that fits. pair: a hold makes it 9 s, and a 9 s take needs 0.6 + 9 + 1.2 = 10.8 s, so its last frame
// freezes for 1.8 s. close: no take, plays as is.
const film = { title: 'Demo', scenes: [{ id: 'hook', name: 'Hook', dur: 6 }, { id: 'pair', name: 'The pair', dur: 8 }, { id: 'close', name: 'Close', dur: 5 }] }
const timing = { pair: { holds: [[2, 1]] } }
const takes = new Map([['hook', { file: 't/take-01.wav', seconds: 3 }], ['pair', { file: 't/take-02.wav', seconds: 9 }]])
const LT = { lead: 0.6, tail: 1.2 }

describe('build: the freeze table (a take that outruns its scene)', () => {
	it('places each scene on the picture and on the output, freezing the last frame until the take has finished', () => {
		const plan = buildPlan(film, timing, takes, LT)
		const [hook, pair, close] = plan.rows
		expect(hook).toMatchObject({ n: 1, id: 'hook', name: 'Hook', start: 0, dur: 6, L: 3, ext: 0, tot: 6, at: 0, take: 't/take-01.wav' })
		expect(pair).toMatchObject({ n: 2, start: 6, dur: 9, L: 9, at: 6, take: 't/take-02.wav' })
		expect(pair.ext).toBeCloseTo(1.8)
		expect(pair.tot).toBeCloseTo(10.8)
		expect(close).toMatchObject({ start: 15, dur: 5, L: 0, ext: 0, take: null })
		expect(close.at).toBeCloseTo(16.8)
		expect(plan.picture).toBe(20)
		expect(plan.total).toBeCloseTo(21.8)
		expect(plan.extended).toBe(true)
		expect(plan.missing).toEqual(['close'])
	})
	it('a fitted film (timing dur covers the take) freezes nothing', () => {
		const plan = buildPlan(film, { pair: { holds: [[2, 1]], dur: 10.8 } }, takes, LT)
		expect(plan.rows.map((r) => r.ext)).toEqual([0, 0, 0])
		expect(plan.extended).toBe(false)
		expect(plan.total).toBeCloseTo(21.8)
	})
	it('prints the table build --check shows', () => {
		const lines = planTable(buildPlan(film, timing, takes, LT))
		expect(lines[0]).toMatch(/#\s+scene\s+dur\s+take\s+ext\s+new\s+start/)
		expect(lines[2]).toMatch(/^ 2 {2}pair\s+9\.0\s+9\.0\s+1\.8\s+10\.8 {2}00:06$/)
		expect(lines[3]).toMatch(/\(no take\)$/)
		expect(lines.at(-1)).toBe('total 21.8 s (1 scene frozen to fit its take; `emaki fit` and a new render make that unnecessary)')
	})
})

describe('build: ffmpeg arguments', () => {
	const base = { pic: 'r/demo-en-16x9.mp4', voice: 'o/voice.wav', dst: 'o/demo-en-16x9.mp4', scoreLevel: 0.55 }
	it('a fitted film: one picture input, the score ducked under the voice, -14 LUFS', () => {
		const plan = buildPlan(film, { pair: { holds: [[2, 1]], dur: 10.8 } }, takes, LT)
		const a = buildArgs({ ...base, plan, music: true, subtitles: null })
		expect(a.filter((x) => x === '-i')).toHaveLength(2)
		const fc = a[a.indexOf('-filter_complex') + 1]
		expect(fc).toContain('[0:a]aresample=48000,aformat=channel_layouts=stereo[mu]')
		expect(fc).toContain('[mu]volume=0.55[sc]')
		expect(fc).toContain('[1:a]aresample=48000,asplit=2[vo][key]')
		expect(fc).toContain('[sc][key]sidechaincompress')
		expect(fc).toContain('loudnorm=I=-14:TP=-1.5:LRA=11[a]')
		expect(fc).not.toContain('tpad')
		expect(a.join(' ')).toContain('-map 0:v -map [a]')
		expect(a.join(' ')).toContain('-t 21.800')
		expect(a.at(-1)).toBe('o/demo-en-16x9.mp4')
	})
	it('a take that outruns its scene: each scene cut from the picture, the long one frozen, its music looped under the hold', () => {
		const plan = buildPlan(film, timing, takes, LT)
		const a = buildArgs({ ...base, plan, music: true, subtitles: null })
		expect(a.join(' ')).toContain('-ss 6.000 -t 9.000 -i r/demo-en-16x9.mp4')
		expect(a.filter((x) => x === '-i')).toHaveLength(4)
		const fc = a[a.indexOf('-filter_complex') + 1]
		expect(fc).toContain('[1:v]tpad=stop_mode=clone:stop_duration=1.800,setpts=PTS-STARTPTS[v1]')
		expect(fc).toContain('[0:v]setpts=PTS-STARTPTS[v0]')
		expect(fc).toContain('[v0][v1][v2]concat=n=3:v=1:a=0[pv]')
		expect(fc).toContain('afade=t=out:st=8.995:d=0.005,aloop=loop=-1:size=2e9,apad,atrim=0:10.800')
		expect(fc.match(/aloop/g)).toHaveLength(1)
		expect(fc).toContain('[m0][m1][m2]concat=n=3:v=0:a=1[mu]')
		expect(fc).toContain('[3:a]aresample=48000,asplit=2[vo][key]')
		expect(a.join(' ')).toContain('-map [pv] -map [a]')
	})
	it('captions burn into the picture; a render without music has the voice alone', () => {
		const plan = buildPlan(film, timing, takes, LT)
		const a = buildArgs({ ...base, plan, music: false, subtitles: "subtitles=o/x.srt:force_style='FontSize=16'" })
		const fc = a[a.indexOf('-filter_complex') + 1]
		expect(fc).toContain("[pv]subtitles=o/x.srt:force_style='FontSize=16'[v]")
		expect(fc).not.toContain('sidechaincompress')
		expect(fc).not.toContain(':a]aresample=48000,aformat')
		expect(fc).toContain('[3:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]')
		expect(a.join(' ')).toContain('-map [v] -map [a]')
	})
})

describe('build: chapters', () => {
	const rows = [['a', 'Alpha', 12], ['b', 'Beta', 4], ['c', 'Gamma', 8], ['d', 'Delta', 3]]
		.reduce((acc, [id, name, tot]) => [...acc, { id, name, tot, at: acc.reduce((n, r) => n + r.tot, 0) }], [])
	it('one chapter per scene embedded in the MP4, on the exact scene boundaries', () => {
		expect(ffmeta([{ name: 'Hook', at: 0, tot: 6.25 }, { name: 'a=b; #1 \\ x\ny', at: 6.25, tot: 4 }])).toBe(
			';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=6250\ntitle=Hook\n' +
			'[CHAPTER]\nTIMEBASE=1/1000\nSTART=6250\nEND=10250\ntitle=a\\=b\\; \\#1 \\\\ x y\n')
	})
	it('YouTube\'s list starts at 0:00 with every chapter at least 10 s: short scenes fold into the chapter they start', () => {
		expect(ytChapters(rows)).toEqual([[0, 'Alpha'], [12, 'Beta + Gamma + Delta']])
		expect(ytChapters(rows.slice(1, 2).map((r) => ({ ...r, at: 0 })))).toEqual([[0, 'Beta']])
	})
	it('chapters.txt is m:ss and the title, one per line', () => {
		expect(chaptersText([[0, 'Alpha'], [72.5, 'Beta'], [605, 'Late']])).toBe('0:00 Alpha\n1:12 Beta\n10:05 Late\n')
	})
	it('the final video takes its chapters from the metadata file in the same pass', () => {
		const plan = buildPlan(film, { pair: { holds: [[2, 1]], dur: 10.8 } }, takes, LT)
		const a = buildArgs({ pic: 'p.mp4', voice: 'v.wav', plan, music: true, chapters: 'o/chapters.ffmeta', dst: 'o.mp4' })
		expect(a.join(' ')).toContain('-i v.wav -i o/chapters.ffmeta -filter_complex')
		expect(a.join(' ')).toContain('-map_metadata 2 -map_chapters 2')
	})
})

describe('build: description.txt', () => {
	it('is paste-ready: the title, the chapters, the story link', () => {
		expect(description({ title: 'Measure the Right Work', chapters: [[0, 'Alpha'], [12, 'Beta']], link: 'https://learn.example.com/en/stories/demo' }))
			.toBe('Measure the Right Work\n\n0:00 Alpha\n0:12 Beta\n\nhttps://learn.example.com/en/stories/demo\n')
		expect(description({ title: 'Demo', chapters: [[0, 'Alpha']], link: null })).toBe('Demo\n\n0:00 Alpha\n')
	})
	it('links the story page: <site url>/<locale>/stories/<slug>, or the storyUrl pattern in emaki.config.json', () => {
		expect(storyLink({ url: 'https://learn.example.com/' }, {}, 'demo', 'es')).toBe('https://learn.example.com/es/stories/demo')
		expect(storyLink({ url: 'https://sensei-hq.com' }, { storyUrl: '{site}/articles/{slug}' }, 'demo', 'en')).toBe('https://sensei-hq.com/articles/demo')
		expect(storyLink({ url: '' }, {}, 'demo', 'en')).toBeNull()
		expect(storyLink({}, { storyUrl: 'https://x.dev/{locale}/{slug}' }, 'demo', 'fr')).toBe('https://x.dev/fr/demo')
	})
})
