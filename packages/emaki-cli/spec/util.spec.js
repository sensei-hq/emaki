// The small helpers every step leans on: running a program and reading its failure, finding one on PATH (on Windows
// with `where`), asking ffprobe about a file, reading --opt pairs, and the media pipeline's HTTP calls with the errors
// they raise. Programs are stand-ins on a PATH that holds nothing else; fetch is a stub.
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { call, callJson, need } from '../src/http.js'
import { hasAudio, MotionError, parseOpts, run, which } from '../src/util.js'
import { fakeFetch } from './helpers.js'
import { tools } from './tools.js'

let t
beforeAll(() => { t = tools() }, 60000)
afterAll(() => { t.restore(); t.remove() })
beforeEach(() => { t.use(); t.reset() })
afterEach(() => vi.unstubAllEnvs())

describe('run', () => {
	it('returns what the program printed', () => {
		expect(run('ffprobe', ['x'])).toBe('2\n')
	})

	it('names a program that is missing, one that cannot start, and one that failed (with the end of its stderr)', () => {
		expect(() => run('nope', [])).toThrow(new MotionError('nope: not installed (not on PATH)'))
		const blocked = join(t.bin, 'blocked')
		writeFileSync(blocked, '#!/bin/sh\n')
		chmodSync(blocked, 0o644)
		expect(() => run(blocked, [])).toThrow(/blocked: .*EACCES/)
		vi.stubEnv('FAKE_FFMPEG_FAIL', 'no input')
		expect(() => run('ffmpeg', ['out'])).toThrow(new MotionError('ffmpeg failed: ffmpeg broke: no input\n'))
		expect(() => run('quiet', [])).toThrow(new MotionError('quiet failed: '))
	})
})

describe('which', () => {
	it('is true for a program on PATH and false for one that is not', () => {
		expect(which('ffmpeg')).toBe(true)
		expect(which('nope')).toBe(false)
	})

	it('asks `where` on Windows', () => {
		const platform = Object.getOwnPropertyDescriptor(process, 'platform')
		Object.defineProperty(process, 'platform', { value: 'win32' })
		try {
			expect(which('ffmpeg')).toBe(true)
			expect(which('nope')).toBe(false)
		} finally {
			Object.defineProperty(process, 'platform', platform)
		}
	})
})

describe('hasAudio', () => {
	it('is true when ffprobe finds an audio stream', () => {
		expect(hasAudio('film.mp4')).toBe(true)
		vi.stubEnv('FAKE_STREAMS', '')
		expect(hasAudio('film.mp4')).toBe(false)
		expect(t.ran().at(-1)).toBe('ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 film.mp4')
	})
})

describe('parseOpts', () => {
	it('reads key=value pairs, JSON values as JSON, and skips anything without "="', () => {
		expect(parseOpts(['speed=1.2', 'voice=Alex', 'on=true', 'list=[1,2]', 'note=a=b', 'loose'])).toEqual({
			speed: 1.2, voice: 'Alex', on: true, list: [1, 2], note: 'a=b'
		})
		expect(parseOpts('model=v.onnx')).toEqual({ model: 'v.onnx' })
		expect(parseOpts(undefined)).toEqual({})
	})
})

describe('HTTP for the media pipeline', () => {
	it('returns the response, and parses a JSON answer ({} for an empty body)', async () => {
		const f = fakeFetch((c) => ({ body: c.url.endsWith('empty') ? '' : '{"id":7}' }))
		expect((await call(f, 'GET', 'https://desk.test/x')).ok).toBe(true)
		expect(await callJson(f, 'POST', 'https://desk.test/x', { body: '{}', headers: { a: '1' } })).toEqual({ id: 7 })
		expect(await callJson(f, 'POST', 'https://desk.test/empty')).toEqual({})
		expect(f.calls[1]).toMatchObject({ method: 'POST', body: '{}', headers: { a: '1' } })
	})

	it('names the method and the URL without its query when the request fails or is refused', async () => {
		await expect(call(async () => { throw new Error('ECONNRESET') }, 'GET', 'https://desk.test/x?token=t'))
			.rejects.toThrow(new MotionError('GET https://desk.test/x: ECONNRESET'))
		await expect(call(async () => { throw 'offline' }, 'PUT', 'https://desk.test/y?sig=s'))
			.rejects.toThrow(new MotionError('PUT https://desk.test/y: offline'))
		await expect(call(fakeFetch(() => ({ status: 403, body: 'denied' })), 'POST', 'https://desk.test/z?key=k'))
			.rejects.toThrow(new MotionError('POST https://desk.test/z → 403: denied'))
	})

	it('names every missing credential at once', () => {
		expect(() => need({ A: '1' }, 'A', 'B', 'C')).toThrow(new MotionError('missing B, C: set them in the environment (or CI secrets), never in emaki.config.json'))
		expect(() => need({ A: '1' }, 'A')).not.toThrow()
	})
})
