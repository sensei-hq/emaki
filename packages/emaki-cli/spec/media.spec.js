// render and build, the parts that decide: frame ranges, output paths, ffmpeg arguments, the freeze table, chapters,
// the description. The shells in capture.js and voice.js only run what these return; nothing here needs ffmpeg, a
// browser or a network.
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MotionError } from '../src/api.js'
import { frameRange, renderOut } from '../src/media.js'

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
