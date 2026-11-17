// emaki fit and voice-web on a film that has nothing written yet: no timing file, a scene without a take, a JSON scene
// with no strings for the locale, a JS scene whose motion cannot be read, and a fitted time that goes back to the
// design. voice-web's default encoder is a stand-in ffmpeg on PATH.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fit, project as load, voiceWeb } from '../src/api.js'
import { json, project, put } from './helpers.js'
import { tools } from './tools.js'

let t
beforeAll(() => { t = tools() }, 60000)
afterAll(() => { t.restore(); t.remove() })
beforeEach(() => { t.use(); t.reset() })

const TIMING = 'content/films/demo/timing.en.json'
const take = (d, n) => put(d, `production/demo/en/takes/take-0${n}.wav`, 'WAV')

describe('fit', () => {
	it('writes the timing file when there is none, fitting the narrated scene and leaving the silent one alone', () => {
		const d = project({ built: false })
		take(d, 1)
		const r = fit(load(d), 'demo', { locale: 'en', length: () => 14 })
		expect(r.rows).toEqual([
			{ scene: 'hook', design: 12, holds: 0, take: 14, runs: 15.8, longer: true, shorter: false },
			{ scene: 'close', design: 18, holds: 0, take: 0, runs: 18, longer: false, shorter: false }
		])
		expect(json(join(d, TIMING))).toEqual({ scenes: { hook: { dur: 15.8 } } })
	})

	it('keeps a JS scene (no "settle") at its design time when its take is short', () => {
		const d = project({ built: false })
		take(d, 1)
		expect(fit(load(d), 'demo', { locale: 'en', length: () => 2 }).rows[0]).toMatchObject({ runs: 12, shorter: false })
	})

	it('drops a fitted time that is back to the design, and the scene\'s entry with it', () => {
		const d = project({ built: false })
		take(d, 2)
		put(d, TIMING, { scenes: { hook: { dur: 15.8 } } })
		const r = fit(load(d), 'demo', { locale: 'en', length: () => 16.2 })
		expect(r.rows.map((x) => x.runs)).toEqual([12, 18])
		expect(json(join(d, TIMING))).toEqual({ scenes: {} })
	})

	it('reads a JSON scene\'s motion without strings for the locale', () => {
		const d = project({ built: false })
		take(d, 1)
		put(d, 'content/films/demo/scene-hook.json', { html: '<h1>Hi</h1>', tracks: [{ kind: 'tween', sel: 'h1', t0: 0, t1: 3 }] })
		const r = fit(load(d), 'demo', { locale: 'en', length: () => 1, check: true })
		expect(r.rows[0].runs).toBe(3)
		expect(r.written).toBe(false)
		expect(existsSync(join(d, TIMING))).toBe(false)
	})
})

describe('voice-web', () => {
	it('encodes with ffmpeg by default and starts the timing file when there is none', () => {
		const d = project({ built: false })
		take(d, 1)
		const r = voiceWeb(load(d), 'demo', { locale: 'en' })
		expect(r.wrote).toEqual(['content/films/demo/voice/en/hook.m4a'])
		expect(readFileSync(join(d, 'content/films/demo/voice/en/hook.m4a'), 'utf-8')).toBe('FAKE\n')
		expect(t.ran()).toEqual([`ffmpeg -y -v error -i ${join(d, 'production/demo/en/takes/take-01.wav')} -vn -ac 1 -ar 48000 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 64k -movflags +faststart ${join(d, 'content/films/demo/voice/en/hook.m4a')}`])
		expect(json(join(d, TIMING))).toEqual({ scenes: { hook: { voice: 0.6 } } })
	})

	it('leaves no empty voice folder when no take belongs to a scene of the film', () => {
		const d = project({ built: false })
		put(d, 'content/films/demo/voice/en.json', [{ scene: 'gone', text: 'Cut.' }])
		take(d, 1)
		expect(voiceWeb(load(d), 'demo', { locale: 'en' }).wrote).toEqual([])
		expect(existsSync(join(d, 'content/films/demo/voice/en'))).toBe(false)
	})
})
