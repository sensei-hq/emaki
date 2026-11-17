// emaki voice / tts-check / set-voice / voices: which provider speaks a locale, whether it is ready on this machine, the
// takes it synthesises (take-NN.wav and provider.json) and what it prints, and how a missing provider, a provider that
// is not ready or a failed take stops the run. The voices are stand-in programs and a stub fetch; keys are fake.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotionError, project as load } from '../src/api.js'
import { chosen, listVoices, NO_PROVIDER, setVoice, ttsCheck, voice } from '../src/voice.js'
import { json, logger, project, put } from './helpers.js'

import { tools } from './tools.js'

let t
beforeAll(() => { t = tools() })
afterAll(() => { t.restore(); t.remove() })
beforeEach(() => {
	t.use()
	t.reset()
	for (const k of ['ELEVENLABS_API_KEY', 'OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT']) vi.stubEnv(k, undefined)
})
afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

/** The demo project with `voice` as its emaki.config.json voice block. */
function withVoice(voiceBlock) {
	const d = project({ built: false })
	put(d, 'emaki.config.json', voiceBlock ? { voice: voiceBlock } : {})
	return { d, p: load(d) }
}

describe('choosing the voice for a locale', () => {
	it('says how to choose one when no provider is set', () => {
		const { p } = withVoice(null)
		expect(() => chosen(p, 'en')).toThrow(new MotionError(NO_PROVIDER('en')))
		expect(NO_PROVIDER('es')).toMatch(/^no voice provider is set for es\. Choose one/)
		expect(NO_PROVIDER('es')).toContain('emaki set-voice --locale default --provider piper')
	})

	it('takes the configured provider, a --provider override, and --opt options over the config', () => {
		const { p } = withVoice({ default: { provider: 'macos', voice: 'Alex' } })
		expect(chosen(p, 'en').vcfg).toEqual({ provider: 'macos', voice: 'Alex' })
		const { vcfg, prov } = chosen(p, 'en', 'espeak', { speed: 140 })
		expect(vcfg).toEqual({ provider: 'espeak', voice: 'Alex', speed: 140 })
		expect(prov.label).toBe('eSpeak NG (offline, robotic)')
	})

	it('lists the voices the chosen provider has for the locale', async () => {
		const { p } = withVoice({ default: { provider: 'macos' } })
		expect(await listVoices(p, 'es')).toEqual(['Monica es_ES # Hola'])
		expect(await listVoices(p, 'en', 'manual')).toEqual([expect.stringMatching(/take-01\.wav/)])
	})
})

describe('tts-check', () => {
	it('reports each locale\'s provider and whether it is ready, and the offline engines this machine has', () => {
		const d = project({ built: false })
		put(d, 'content/site.json', { locales: ['en', 'es', 'fr'], defaultLocale: 'en' })
		put(d, 'emaki.config.json', { voice: { en: { provider: 'macos' }, es: { provider: 'elevenlabs' } } })
		expect(ttsCheck(load(d))).toEqual({
			rows: [
				{ locale: 'en', provider: 'macos', label: 'macOS say (offline, drafts)', ready: true },
				{ locale: 'es', provider: 'elevenlabs', label: 'ElevenLabs', ready: false, note: 'set ELEVENLABS_API_KEY in the environment (never in files)' },
				{ locale: 'fr', provider: null, ready: false, note: 'no provider set' }
			],
			offline: ['piper (needs a voice model)', 'macos', 'espeak']
		})
	})

	it('finds no offline engine on a machine that has none', () => {
		t.none()
		const { p } = withVoice(null)
		expect(ttsCheck(p).offline).toEqual([])
	})
})

describe('set-voice', () => {
	it('starts emaki.config.json when there is none, and drops anything that looks like a key', () => {
		const d = project({ built: false })
		rmSync(join(d, 'emaki.config.json'))
		const p = load(d)
		const r = setVoice(p, 'es', 'azure', { voice: 'es-ES-ElviraNeural', api_key: 'x', Token: 'y' })
		expect(r).toEqual({ block: { provider: 'azure', voice: 'es-ES-ElviraNeural' }, dropped: ['api_key', 'Token'] })
		expect(json(join(d, 'emaki.config.json'))).toEqual({ voice: { es: { provider: 'azure', voice: 'es-ES-ElviraNeural' } } })
		expect(p.cfg.voice.es.provider).toBe('azure')
		setVoice(p, 'en', 'macos')
		expect(json(join(d, 'emaki.config.json')).voice).toEqual({ es: { provider: 'azure', voice: 'es-ES-ElviraNeural' }, en: { provider: 'macos' } })
		expect(() => setVoice(p, 'es', 'robot')).toThrow(/unknown provider "robot"/)
	})
})

describe('voice', () => {
	const takes = (d) => join(d, 'production/demo/en/takes')

	it('synthesises a take per line (the spoken form when there is one) and records the provider', async () => {
		const { d, p } = withVoice({ default: { provider: 'macos', voice: 'Alex', rate: 170, api: 'kept out' } })
		put(d, 'content/films/demo/voice/en.json', [{ scene: 'hook', text: 'Hi, SQL.', say: 'Hi, sequel.' }, { scene: 'close', text: 'Bye.' }])
		vi.stubEnv('FAKE_DUR', '2.34')
		const log = logger()
		const made = await voice(p, 'demo', { locale: 'en', log })
		expect(made).toEqual([{ take: 1, scene: 'hook', seconds: 2.34 }, { take: 2, scene: 'close', seconds: 2.34 }])
		expect(log.lines).toEqual(['take-01 (hook): 2.3 s · macOS say (offline, drafts)', 'take-02 (close): 2.3 s · macOS say (offline, drafts)'])
		expect(readFileSync(join(takes(d), 'take-01.wav'), 'utf-8')).toBe('FAKE\n')
		expect(t.ran().filter((l) => l.startsWith('say ')).map((l) => l.replace(/\S+raw\.aiff/, 'RAW'))).toEqual([
			'say -o RAW -v Alex -r 170 Hi, sequel.', 'say -o RAW -v Alex -r 170 Bye.'
		])
		expect(json(join(takes(d), 'provider.json'))).toEqual({ provider: 'macos', voice: 'Alex' })
	})

	it('--only makes just the takes it names, and gives each its neighbours as context', async () => {
		const { d, p } = withVoice({ default: { provider: 'elevenlabs', voice_id: 'v1' } })
		put(d, 'content/films/demo/voice/en.json', [{ scene: 'a', text: 'One.' }, { scene: 'b', text: 'Two.' }, { scene: 'c', text: 'Three.' }])
		vi.stubEnv('ELEVENLABS_API_KEY', 'el-test-key')
		const bodies = []
		vi.stubGlobal('fetch', async (url, init) => { bodies.push(JSON.parse(init.body)); return new Response('MP3') })
		const made = await voice(p, 'demo', { locale: 'en', only: '2', log: () => {} })
		expect(made.map((m) => m.take)).toEqual([2])
		expect(bodies).toEqual([expect.objectContaining({ text: 'Two.', previous_text: 'One.', next_text: 'Three.' })])
		expect(existsSync(join(takes(d), 'take-01.wav'))).toBe(false)
		expect(json(join(takes(d), 'provider.json'))).toEqual({ provider: 'elevenlabs', voice_id: 'v1' })
	})

	it('for manual, prints the recording list instead of synthesising', async () => {
		const { d, p } = withVoice({ default: { provider: 'manual' } })
		const log = logger()
		expect(await voice(p, 'demo', { locale: 'en', log })).toEqual([])
		expect(log.lines).toEqual([
			'manual: record 2 takes into production/demo/en/takes/ as take-01.wav … take-02.wav, in this order:',
			'  take-01 (hook): Hi.',
			'  take-02 (close): Bye.'
		])
		expect(existsSync(takes(d))).toBe(false)
	})

	it('stops before any take when the provider is not ready, naming the provider', async () => {
		const { p } = withVoice({ default: { provider: 'elevenlabs', voice_id: 'v1' } })
		await expect(voice(p, 'demo', { locale: 'en' }))
			.rejects.toThrow(new MotionError('ElevenLabs: set ELEVENLABS_API_KEY in the environment (never in files)'))
	})

	it('stops at the take that failed, with the provider\'s message or the error itself', async () => {
		const { p } = withVoice({ default: { provider: 'elevenlabs', voice_id: 'v1' } })
		vi.stubEnv('ELEVENLABS_API_KEY', 'el-test-key')
		vi.stubGlobal('fetch', async () => new Response('no quota', { status: 429 }))
		await expect(voice(p, 'demo', { locale: 'en', log: () => {} }))
			.rejects.toThrow(new MotionError('take-01: api.elevenlabs.io: HTTP 429 no quota'))
		vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed') })
		await expect(voice(p, 'demo', { locale: 'en', log: () => {} }))
			.rejects.toThrow(new MotionError('take-01: TypeError: fetch failed'))
	})

	it('logs to the console by default', async () => {
		const { p } = withVoice({ default: { provider: 'espeak' } })
		const info = vi.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await voice(p, 'demo', { locale: 'en', only: 1 })
			expect(info).toHaveBeenCalledWith('take-01 (hook): 2.0 s · eSpeak NG (offline, robotic)')
		} finally {
			info.mockRestore()
		}
	})
})
