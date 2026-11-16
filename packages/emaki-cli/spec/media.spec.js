// render and build, the parts that decide: frame ranges, output paths, ffmpeg arguments, the freeze table, chapters,
// the description. The shells in capture.js and voice.js only run what these return; nothing here needs ffmpeg, a
// browser or a network.
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MotionError } from '../src/api.js'
import { encodeArgs, frameRange, musicFor, muxArgs, renderOut, renderSteps, staleRender } from '../src/media.js'

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
