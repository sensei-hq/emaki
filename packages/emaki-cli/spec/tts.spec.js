// The text-to-speech providers: what each one checks before it runs, the request or command it makes for a take, the
// voices it lists, and how it fails. The cloud ones talk to a stub fetch (keys are fake values in the environment), the
// offline ones run stand-in programs on a PATH that holds nothing else, and every take goes through a stand-in ffmpeg.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDERS, provider, TTSError, voiceConfig } from '../src/tts.js'
import { env, get, post, sh, toTake } from '../src/tts-io.js'
import { fakeFetch, tmp } from './helpers.js'
import { tools } from './tools.js'

const KEYS = ['ELEVENLABS_API_KEY', 'OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_SPEECH_KEY',
	'AZURE_SPEECH_REGION', 'GOOGLE_TTS_API_KEY', 'FAKE_GCLOUD_TOKEN', 'FAKE_PIPER_SILENT', 'FAKE_KOKORO_MISSING', 'FAKE_FFMPEG_FAIL',
	'FAKE_SAY_VOICES']

let t
beforeAll(() => { t = tools() })
afterAll(() => { t.restore(); t.remove() })
beforeEach(() => {
	t.use()
	t.reset()
	for (const k of KEYS) vi.stubEnv(k, undefined)
})
afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

const take = () => join(tmp(), 'take.wav')
const failure = async (fn) => {
	try { await fn() } catch (e) { return e }
	throw new Error('expected a failure')
}
/** The stand-in ffmpeg's last call: the take it made, with its input. */
const ffmpegTo = (dst) => t.ran().filter((l) => l.startsWith('ffmpeg ')).at(-1)?.endsWith(`-af adelay=100|100 -ar 48000 -ac 1 ${dst}`)

describe('running a command', () => {
	it('returns what the program printed, and feeds it text on stdin when given some', () => {
		expect(String(sh('ffprobe', ['x']))).toBe('2\n')
		const dst = take()
		sh('piper', ['--output_file', dst], 'Hello there.')
		expect(t.stdin('piper')).toBe('Hello there.')
		expect(readFileSync(dst, 'utf-8')).toBe('WAV\n')
	})

	it('names a program that is not installed, one that cannot run, and one that failed with the end of its stderr', () => {
		expect(() => sh('nope', [])).toThrow(new TTSError('nope: not installed'))
		const blocked = join(t.bin, 'blocked')
		writeFileSync(blocked, '#!/bin/sh\n')
		chmodSync(blocked, 0o644)
		expect(() => sh(blocked, [])).toThrow(/blocked: .*EACCES/)
		vi.stubEnv('FAKE_FFMPEG_FAIL', 'bad input')
		expect(() => sh('ffmpeg', ['out'])).toThrow(new TTSError('ffmpeg: ffmpeg broke: bad input\n'))
	})

	it('turns audio bytes or an audio file into a 48 kHz mono take with 0.1 s of air at the head', () => {
		const dst = take()
		toTake(Buffer.from('MP3'), dst)
		expect(readFileSync(dst, 'utf-8')).toBe('FAKE\n')
		expect(ffmpegTo(dst)).toBe(true)
		const src = join(tmp(), 'in.aiff')
		writeFileSync(src, 'AIFF')
		toTake(src, dst)
		expect(t.ran().at(-1)).toBe(`ffmpeg -v error -y -i ${src} -af adelay=100|100 -ar 48000 -ac 1 ${dst}`)
	})

	it('reads a key from the first variable that is set, and says where keys belong when none is', () => {
		vi.stubEnv('B_KEY', 'b-value')
		expect(env('A_KEY', 'B_KEY')).toBe('b-value')
		expect(() => env('A_KEY')).toThrow(new TTSError('set A_KEY in the environment (never in files)'))
	})
})

describe('the cloud requests', () => {
	it('posts JSON, text or bytes as they are, and answers with the bytes or the parsed JSON', async () => {
		const f = fakeFetch((c) => ({ body: c.url.endsWith('json') ? '{"ok":1}' : 'AUDIO' }))
		vi.stubGlobal('fetch', f)
		expect(String(await post('https://api.test/bytes', { a: 1 }, {}))).toBe('AUDIO')
		expect(await post('https://api.test/json', 'plain', {}, 'json')).toEqual({ ok: 1 })
		await post('https://api.test/bytes', new Uint8Array([104, 105]), {})
		expect(f.calls.map((c) => String(c.body))).toEqual(['{"a":1}', 'plain', 'hi'])
		expect(await get('https://api.test/json', { h: '1' })).toEqual({ ok: 1 })
	})

	it('names the host and the status of a refused request, never the path or its query', async () => {
		vi.stubGlobal('fetch', fakeFetch(() => ({ status: 401, body: 'bad key' })))
		await expect(post('https://api.test/v1/x?key=k', {}, {})).rejects.toThrow(new TTSError('api.test: HTTP 401 bad key'))
		await expect(get('https://api.test/v1/x?key=k', {})).rejects.toThrow(new TTSError('api.test: HTTP 401'))
	})
})

describe('ElevenLabs', () => {
	const el = PROVIDERS.elevenlabs
	it('needs its key and a voice', () => {
		expect(() => el.check({})).toThrow('set ELEVENLABS_API_KEY in the environment (never in files)')
		vi.stubEnv('ELEVENLABS_API_KEY', 'el-test-key')
		expect(() => el.check({})).toThrow('set "voice_id"')
		expect(() => el.check({ voice: 'v1' })).not.toThrow()
		expect(() => el.check({ voice_id: 'v1' })).not.toThrow()
	})

	it('speaks a line in context with the default model and settings, or with the configured ones', async () => {
		vi.stubEnv('ELEVENLABS_API_KEY', 'el-test-key')
		const f = fakeFetch(() => ({ body: 'MP3' }))
		vi.stubGlobal('fetch', f)
		const dst = take()
		await el.synth('Hola.', dst, { voice: 'v9' }, 'es-ES', { prev: 'Antes.', next: 'Después.' })
		await el.synth('Hi.', dst, { voice_id: 'v1', voice: 'ignored', model: 'm', stability: 0.3, similarity: 0.9 }, 'en', { prev: null, next: null })
		expect(f.calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v9?output_format=mp3_44100_128')
		expect(f.calls[0].headers['xi-api-key']).toBe('el-test-key')
		expect(JSON.parse(f.calls[0].body)).toEqual({
			text: 'Hola.', model_id: 'eleven_multilingual_v2', language_code: 'es',
			voice_settings: { stability: 0.55, similarity_boost: 0.8 }, previous_text: 'Antes.', next_text: 'Después.'
		})
		expect(f.calls[1].url).toContain('/text-to-speech/v1?')
		expect(JSON.parse(f.calls[1].body)).toEqual({
			text: 'Hi.', model_id: 'm', language_code: 'en', voice_settings: { stability: 0.3, similarity_boost: 0.9 }
		})
		expect(readFileSync(dst, 'utf-8')).toBe('FAKE\n')
	})

	it('lists the account\'s voices with their labels', async () => {
		vi.stubEnv('ELEVENLABS_API_KEY', 'el-test-key')
		vi.stubGlobal('fetch', fakeFetch(() => ({ json: { voices: [{ voice_id: 'a1', name: 'Ann', labels: { accent: 'us' } }, { voice_id: 'b2', name: 'Bo' }] } })))
		expect(await el.voices()).toEqual(['a1  Ann  {"accent":"us"}', 'b2  Bo  {}'])
		vi.stubGlobal('fetch', fakeFetch(() => ({ json: {} })))
		expect(await el.voices()).toEqual([])
	})
})

describe('OpenAI', () => {
	const oa = PROVIDERS.openai
	it('needs OPENAI_API_KEY, or the Azure OpenAI key when an Azure endpoint is set', () => {
		expect(() => oa.check()).toThrow('set OPENAI_API_KEY')
		vi.stubEnv('OPENAI_API_KEY', 'oa-test-key')
		expect(() => oa.check()).not.toThrow()
		vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://me.openai.azure.test/')
		expect(() => oa.check()).toThrow('set AZURE_OPENAI_API_KEY')
	})

	it('speaks through OpenAI with the default voice, and passes instructions for tone', async () => {
		vi.stubEnv('OPENAI_API_KEY', 'oa-test-key')
		const f = fakeFetch(() => ({ body: 'WAV' }))
		vi.stubGlobal('fetch', f)
		await oa.synth('Hi.', take(), {})
		await oa.synth('Hi.', take(), { model: 'tts-1', voice: 'nova', instructions: 'Calm.' })
		expect(f.calls[0].url).toBe('https://api.openai.com/v1/audio/speech')
		expect(f.calls[0].headers.authorization).toBe('Bearer oa-test-key')
		expect(JSON.parse(f.calls[0].body)).toEqual({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'Hi.', response_format: 'wav' })
		expect(JSON.parse(f.calls[1].body)).toEqual({ model: 'tts-1', voice: 'nova', input: 'Hi.', response_format: 'wav', instructions: 'Calm.' })
		expect(await oa.voices()).toEqual([expect.stringMatching(/^alloy, ash/)])
	})

	it('speaks through an Azure OpenAI deployment, by default named after the model', async () => {
		vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://me.openai.azure.test/')
		vi.stubEnv('AZURE_OPENAI_API_KEY', 'az-oa-test-key')
		const f = fakeFetch(() => ({ body: 'WAV' }))
		vi.stubGlobal('fetch', f)
		await oa.synth('Hi.', take(), {})
		await oa.synth('Hi.', take(), { deployment: 'speech', api_version: '2026-01-01' })
		expect(f.calls.map((c) => c.url)).toEqual([
			'https://me.openai.azure.test/openai/deployments/gpt-4o-mini-tts/audio/speech?api-version=2025-03-01-preview',
			'https://me.openai.azure.test/openai/deployments/speech/audio/speech?api-version=2026-01-01'
		])
		expect(f.calls[0].headers['api-key']).toBe('az-oa-test-key')
	})
})

describe('Azure AI Speech', () => {
	const az = PROVIDERS.azure
	const ready = () => { vi.stubEnv('AZURE_SPEECH_KEY', 'az-test-key'); vi.stubEnv('AZURE_SPEECH_REGION', 'westeurope') }
	it('needs its key, its region and a voice', () => {
		expect(() => az.check({})).toThrow('set AZURE_SPEECH_KEY')
		vi.stubEnv('AZURE_SPEECH_KEY', 'az-test-key')
		expect(() => az.check({})).toThrow('set AZURE_SPEECH_REGION')
		vi.stubEnv('AZURE_SPEECH_REGION', 'westeurope')
		expect(() => az.check({})).toThrow(/set "voice"/)
		expect(() => az.check({ voice: 'es-ES-ElviraNeural' })).not.toThrow()
	})

	it('sends the line as SSML, escaped, at the configured rate', async () => {
		ready()
		const f = fakeFetch(() => ({ body: 'RIFF' }))
		vi.stubGlobal('fetch', f)
		await az.synth(`Tom & "Jerry" <it's>`, take(), { voice: 'en-US-AvaNeural' }, 'en-US')
		await az.synth('Hola.', take(), { voice: 'es-ES-ElviraNeural', rate: '-10%' }, 'es-ES')
		expect(f.calls[0].url).toBe('https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1')
		expect(f.calls[0].headers['ocp-apim-subscription-key']).toBe('az-test-key')
		expect(f.calls[0].body).toBe(`<speak version='1.0' xml:lang='en-US'><voice name='en-US-AvaNeural'><prosody rate='0%'>Tom &amp; &quot;Jerry&quot; &lt;it&apos;s&gt;</prosody></voice></speak>`)
		expect(f.calls[1].body).toContain(`<prosody rate='-10%'>Hola.</prosody>`)
	})

	it('lists the voices for the locale or its language', async () => {
		ready()
		vi.stubGlobal('fetch', fakeFetch(() => ({ json: [
			{ Locale: 'es-ES', ShortName: 'es-ES-ElviraNeural', Gender: 'Female' },
			{ Locale: 'es-MX', ShortName: 'es-MX-JorgeNeural', Gender: 'Male' },
			{ Locale: 'en-US', ShortName: 'en-US-AvaNeural', Gender: 'Female' }
		] })))
		expect(await az.voices({}, 'es-ES')).toEqual(['es-ES-ElviraNeural  Female', 'es-MX-JorgeNeural  Male'])
	})
})

describe('Google Cloud', () => {
	const g = PROVIDERS.google
	it('signs in with GOOGLE_TTS_API_KEY, else gcloud\'s token, and says how when neither works', () => {
		t.none()
		expect(() => g.check({})).toThrow('set GOOGLE_TTS_API_KEY, or sign in with `gcloud auth login`')
		t.use()
		expect(() => g.check({})).toThrow('set GOOGLE_TTS_API_KEY, or sign in with `gcloud auth login`')
		vi.stubEnv('FAKE_GCLOUD_TOKEN', 'gcloud-test-token')
		expect(() => g.check({})).toThrow(/set "voice"/)
		vi.stubEnv('GOOGLE_TTS_API_KEY', 'g-test-key')
		expect(() => g.check({ voice: 'en-US-Neural2-F' })).not.toThrow()
	})

	it('synthesises LINEAR16 at 48 kHz in the voice\'s language, from base64 audio', async () => {
		vi.stubEnv('FAKE_GCLOUD_TOKEN', 'gcloud-test-token')
		const f = fakeFetch(() => ({ json: { audioContent: Buffer.from('PCM').toString('base64') } }))
		vi.stubGlobal('fetch', f)
		await g.synth('Hi.', take(), { voice: 'es-ES-Chirp3-HD-Aoede' })
		await g.synth('Hi.', take(), { voice: 'en-US-Neural2-F', speed: 1.1 })
		expect(f.calls[0].headers.authorization).toBe('Bearer gcloud-test-token')
		expect(JSON.parse(f.calls[0].body)).toEqual({
			input: { text: 'Hi.' }, voice: { languageCode: 'es-ES', name: 'es-ES-Chirp3-HD-Aoede' },
			audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000, speakingRate: 1 }
		})
		expect(JSON.parse(f.calls[1].body).audioConfig.speakingRate).toBe(1.1)
	})

	it('lists the voices for the locale', async () => {
		vi.stubEnv('GOOGLE_TTS_API_KEY', 'g-test-key')
		const f = fakeFetch(() => ({ json: { voices: [{ name: 'en-US-Neural2-F', ssmlGender: 'FEMALE' }] } }))
		vi.stubGlobal('fetch', f)
		expect(await g.voices({}, 'en-US')).toEqual(['en-US-Neural2-F  FEMALE'])
		expect(f.calls[0]).toMatchObject({ url: 'https://texttospeech.googleapis.com/v1/voices?languageCode=en-US', headers: { 'x-goog-api-key': 'g-test-key' } })
		vi.stubGlobal('fetch', fakeFetch(() => ({ json: {} })))
		expect(await g.voices({}, 'en-US')).toEqual([])
	})
})

describe('Amazon Polly', () => {
	const polly = PROVIDERS.polly
	it('needs the AWS CLI and a voice', () => {
		t.none()
		expect(() => polly.check({})).toThrow(/install the AWS CLI/)
		t.use()
		expect(() => polly.check({})).toThrow(/set "voice"/)
		expect(() => polly.check({ voice: 'Joanna' })).not.toThrow()
	})

	it('synthesises with the neural engine in the locale, or the configured engine, language and region', async () => {
		const dst = take()
		await polly.synth('Hi.', dst, { voice: 'Joanna' }, 'en-US')
		await polly.synth('Hola.', dst, { voice: 'Lucia', engine: 'standard', language: 'es-ES', region: 'eu-west-1' }, 'es')
		const aws = t.ran().filter((l) => l.startsWith('aws '))
		expect(aws[0]).toMatch(/^aws polly synthesize-speech --output-format mp3 --voice-id Joanna --engine neural --language-code en-US --text Hi\. \/.*raw\.mp3$/)
		expect(aws[1]).toMatch(/--voice-id Lucia --engine standard --language-code es-ES --text Hola\. --region eu-west-1 \/.*raw\.mp3$/)
		expect(readFileSync(dst, 'utf-8')).toBe('FAKE\n')
	})

	it('lists the voices for the language and engine', async () => {
		expect(await polly.voices({}, 'en-US')).toEqual(['Joanna  Female', 'Matthew  Male'])
		await polly.voices({ language: 'es-ES', engine: 'standard', region: 'eu-west-1' }, 'es')
		expect(t.ran()).toEqual([
			'aws polly describe-voices --language-code en-US --engine neural',
			'aws polly describe-voices --language-code es-ES --engine standard --region eu-west-1'
		])
	})
})

describe('Piper', () => {
	const piper = PROVIDERS.piper
	it('needs piper and a voice model that exists', () => {
		t.none()
		expect(() => piper.check({})).toThrow('install it: pip install piper-tts')
		t.use()
		expect(() => piper.check({})).toThrow('voice model not found: "". Download a voice')
		expect(() => piper.check({ model: '/no/such.onnx' })).toThrow('voice model not found: "/no/such.onnx"')
		const model = join(tmp(), 'v.onnx')
		writeFileSync(model, 'ONNX')
		expect(() => piper.check({ model })).not.toThrow()
	})

	it('reads the line on stdin, with the speaker and pace when set', async () => {
		const dst = take()
		await piper.synth('First line.', dst, { model: 'v.onnx' })
		await piper.synth('Second line.', dst, { model: 'v.onnx', speaker: 0, length_scale: 1.2 })
		const runs = t.ran().filter((l) => l.startsWith('piper '))
		expect(runs[0]).toMatch(/^piper --model v\.onnx --output_file \S+raw\.wav$/)
		expect(runs[1]).toMatch(/--output_file \S+raw\.wav --speaker 0 --length_scale 1\.2$/)
		expect(t.stdin('piper')).toBe('Second line.')
		expect(readFileSync(dst, 'utf-8')).toBe('FAKE\n')
		expect(await piper.voices()).toEqual([expect.stringMatching(/^Piper voices are files/)])
	})

	it('fails when piper writes no audio', async () => {
		vi.stubEnv('FAKE_PIPER_SILENT', '1')
		await expect(piper.synth('Hi.', take(), { model: 'v.onnx' })).rejects.toThrow(new TTSError('piper wrote nothing'))
	})
})

describe('Kokoro', () => {
	const kokoro = PROVIDERS.kokoro
	const python = () => join(t.bin, 'kokoropy')
	it('needs the python packages and a language it has voices for', () => {
		expect(() => kokoro.check({}, 'en')).toThrow('install it: python3 -m pip install kokoro soundfile')
		vi.stubEnv('FAKE_KOKORO_MISSING', '1')
		expect(() => kokoro.check({ python: python() }, 'en')).toThrow(`install it: ${python()} -m pip install kokoro`)
		vi.stubEnv('FAKE_KOKORO_MISSING', '0')
		expect(() => kokoro.check({ python: python() }, 'de-DE')).toThrow('kokoro has no voices for de-DE')
		expect(() => kokoro.check({ python: python() }, 'en-GB')).not.toThrow()
		expect(() => kokoro.check({ python: python() }, 'es-MX')).not.toThrow()
	})

	it('runs the pipeline with the locale\'s language code and the default voice and speed, or the configured ones', async () => {
		const dst = take()
		await kokoro.synth('Hello.', dst, { python: python() }, 'en-GB')
		await kokoro.synth('Hola.', dst, { python: python(), voice: 'ef_dora', speed: 0.9 }, 'es-MX')
		await kokoro.synth('Hi.', dst, { python: python(), lang_code: 'a' }, 'en-GB')
		const args = readFileSync(join(t.bin, 'kokoro.args'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l))
		expect(args.map(({ out, ...a }) => a)).toEqual([
			{ code: 'b', voice: 'af_heart', speed: 1 }, { code: 'e', voice: 'ef_dora', speed: 0.9 }, { code: 'a', voice: 'af_heart', speed: 1 }
		])
		expect(t.stdin('kokoro')).toBe('Hi.')
		expect(readFileSync(dst, 'utf-8')).toBe('FAKE\n')
		expect(await kokoro.voices()).toEqual([expect.stringMatching(/^af_heart/)])
	})

	it('runs python3 unless told which python', async () => {
		await expect(kokoro.synth('Hi.', take(), {}, 'en')).rejects.toThrow(new TTSError('python3: not installed'))
	})
})

describe('macOS say', () => {
	const say = PROVIDERS.macos
	it('needs `say`', () => {
		t.none()
		expect(() => say.check()).toThrow('`say` exists only on macOS')
		t.use()
		expect(() => say.check()).not.toThrow()
	})

	it('speaks into an AIFF with the voice and rate when set', async () => {
		const dst = take()
		await say.synth('Hi.', dst, {})
		await say.synth('Hi.', dst, { voice: 'Alex', rate: 180 })
		const runs = t.ran().filter((l) => l.startsWith('say '))
		expect(runs[0]).toMatch(/^say -o \S+raw\.aiff Hi\.$/)
		expect(runs[1]).toMatch(/^say -o \S+raw\.aiff -v Alex -r 180 Hi\.$/)
	})

	it('lists the voices for the language, or the first forty when it has none', async () => {
		expect(await say.voices({}, 'es-ES')).toEqual(['Monica es_ES # Hola'])
		vi.stubEnv('FAKE_SAY_VOICES', 'Kyoko ja-JP # Konnichiwa')
		expect(await say.voices({}, 'ja')).toEqual(['Kyoko ja-JP # Konnichiwa'])
		expect(await say.voices({}, 'de')).toEqual(['Kyoko ja-JP # Konnichiwa'])
	})
})

describe('eSpeak NG', () => {
	const es = PROVIDERS.espeak
	it('needs espeak-ng', () => {
		t.none()
		expect(() => es.check()).toThrow('install espeak-ng')
		t.use()
		expect(() => es.check()).not.toThrow()
	})

	it('speaks in the locale at 160 words a minute, or with the configured voice and speed', async () => {
		await es.synth('Hi.', take(), {}, 'en')
		await es.synth('Hi.', take(), { voice: 'en-gb', speed: 140 }, 'en')
		const runs = t.ran().filter((l) => l.startsWith('espeak-ng '))
		expect(runs[0]).toMatch(/^espeak-ng -v en -s 160 -w \S+raw\.wav Hi\.$/)
		expect(runs[1]).toMatch(/^espeak-ng -v en-gb -s 140 -w /)
		expect(await es.voices({}, 'en-US')).toEqual(['Pty Language Age/Gender VoiceName', ' 5  en  M  english'])
		expect(t.ran().at(-1)).toBe('espeak-ng --voices=en')
	})
})

describe('recorded by a person', () => {
	it('is always ready, synthesises nothing, and says how to name the recordings', async () => {
		const manual = provider('manual')
		expect(() => manual.check()).not.toThrow()
		await expect(manual.synth()).rejects.toThrow(new TTSError('manual: record the takes and place them as take-NN.wav; nothing to synthesise'))
		expect(await manual.voices()).toEqual([expect.stringMatching(/take-01\.wav/)])
	})
})

describe('choosing a provider', () => {
	it('refuses an unknown provider, naming the known ones', () => {
		expect(() => provider('robot')).toThrow(/unknown provider "robot"; one of: piper, kokoro, macos/)
	})

	it('takes the voice block from the locale, the language or the default, whichever exist', () => {
		expect(voiceConfig({}, 'en-US')).toEqual({})
		expect(voiceConfig({ voice: { 'en-US': { provider: 'macos' } } }, 'en-US')).toEqual({ provider: 'macos' })
	})
})

describe('no key reaches a message', () => {
	it('a refused cloud request names the host and status only', async () => {
		vi.stubEnv('ELEVENLABS_API_KEY', 'el-test-key')
		vi.stubGlobal('fetch', fakeFetch(() => ({ status: 403, body: 'quota' })))
		const e = await failure(() => PROVIDERS.elevenlabs.synth('Hi.', take(), { voice: 'v' }, 'en', {}))
		expect(e.message).toBe('api.elevenlabs.io: HTTP 403 quota')
	})
})
