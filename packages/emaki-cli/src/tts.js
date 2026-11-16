// Text-to-speech providers for the voice step. Pick one per locale in emaki.config.json (or `emaki set-voice`):
//
//   "voice": {
//     "default": { "provider": "piper", "model": "voices/en_US-lessac-medium.onnx" },
//     "es":      { "provider": "azure", "voice": "es-ES-ElviraNeural" }
//   }
//
// Every provider writes a 48 kHz mono WAV with 0.1 s of air at the head (what fit and build expect). Keys come from
// environment variables only, never from the config file.
//
// | provider   | runs             | needs                                                           |
// |------------|------------------|-----------------------------------------------------------------|
// | piper      | offline, any OS  | `piper` (pip install piper-tts) + a voice .onnx/.onnx.json        |
// | kokoro     | offline, any OS  | python3 with kokoro + soundfile (pip install kokoro soundfile)   |
// | macos      | offline, macOS   | the built-in `say`                                               |
// | espeak     | offline, any OS  | espeak-ng (robotic: timing drafts)                               |
// | elevenlabs | cloud            | ELEVENLABS_API_KEY                                               |
// | openai     | cloud            | OPENAI_API_KEY (Azure OpenAI: AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY) |
// | azure      | cloud (Microsoft)| AZURE_SPEECH_KEY + AZURE_SPEECH_REGION                           |
// | google     | cloud (Google)   | GOOGLE_TTS_API_KEY, or `gcloud auth login`                       |
// | polly      | cloud (AWS)      | the `aws` CLI with credentials                                   |
// | manual     | a person         | recorded take-NN.wav files                                       |
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { which } from './util.js'

export class TTSError extends Error {}
const fail = (m) => { throw new TTSError(m) }
const lang = (locale) => locale.split('-')[0]

function sh(cmd, args, input) {
	const r = spawnSync(cmd, args, { input, encoding: input == null ? 'utf-8' : undefined, maxBuffer: 256 * 1024 * 1024 })
	if (r.error) fail(`${cmd}: ${r.error.code === 'ENOENT' ? 'not installed' : r.error.message}`)
	if (r.status) fail(`${cmd}: ${String(r.stderr ?? '').slice(-400)}`)
	return r.stdout
}

/** Any audio file or bytes → 48 kHz mono WAV with 0.1 s head air at dst. */
export function toTake(src, dst) {
	const dir = mkdtempSync(join(tmpdir(), 'emaki-'))
	try {
		let file = src
		if (typeof src !== 'string') { file = join(dir, 'raw'); writeFileSync(file, src) }
		sh('ffmpeg', ['-v', 'error', '-y', '-i', file, '-af', 'adelay=100|100', '-ar', '48000', '-ac', '1', dst])
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}
function inTemp(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'emaki-'))
	try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

function env(...names) {
	for (const n of names) if (process.env[n]) return process.env[n]
	return fail(`set ${names.join(' or ')} in the environment (never in files)`)
}

async function post(url, body, headers, as = 'bytes') {
	const r = await fetch(url, { method: 'POST', body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), headers })
	if (!r.ok) fail(`${new URL(url).host}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`)
	return as === 'json' ? r.json() : Buffer.from(await r.arrayBuffer())
}
async function get(url, headers) {
	const r = await fetch(url, { headers })
	if (!r.ok) fail(`${new URL(url).host}: HTTP ${r.status}`)
	return r.json()
}

// ── Providers: check(cfg, locale) throws TTSError when not ready; synth(text, dst, cfg, locale, ctx) ─────────────

const piper = {
	label: 'Piper (offline)',
	check(cfg) {
		if (!which('piper')) fail('install it: pip install piper-tts')
		if (!cfg.model || !existsSync(cfg.model)) fail(`voice model not found: "${cfg.model ?? ''}". Download a voice (.onnx and .onnx.json) from the Piper voices list and set "model"`)
	},
	async synth(text, dst, cfg) {
		inTemp((d) => {
			const raw = join(d, 'raw.wav')
			const args = ['--model', cfg.model, '--output_file', raw]
			if (cfg.speaker != null) args.push('--speaker', String(cfg.speaker))
			if (cfg.length_scale) args.push('--length_scale', String(cfg.length_scale)) // >1 is slower
			sh('piper', args, text)
			if (!existsSync(raw)) fail('piper wrote nothing')
			toTake(raw, dst)
		})
	},
	voices: async () => ['Piper voices are files: pick one for this language from the Piper voice samples page, download its .onnx and .onnx.json, set "model".']
}

const KOKORO_LANG = { en: 'a', 'en-GB': 'b', es: 'e', fr: 'f', hi: 'h', it: 'i', ja: 'j', pt: 'p', zh: 'z' }
const KOKORO_PY = `import sys, json, numpy as np, soundfile as sf
from kokoro import KPipeline
a = json.loads(sys.argv[1]); text = sys.stdin.read()
pipe = KPipeline(lang_code=a['code'])
audio = [x for _, _, x in pipe(text, voice=a['voice'], speed=a['speed'])]
sf.write(a['out'], np.concatenate(audio), 24000)`
const kokoro = {
	label: 'Kokoro (offline)',
	check(cfg, locale) {
		const py = cfg.python ?? 'python3'
		const r = spawnSync(py, ['-c', 'import kokoro, soundfile'], { encoding: 'utf-8' })
		if (r.error || r.status) fail(`install it: ${py} -m pip install kokoro soundfile (and espeak-ng for some languages)`)
		if (!KOKORO_LANG[locale] && !KOKORO_LANG[lang(locale)]) fail(`kokoro has no voices for ${locale}`)
	},
	async synth(text, dst, cfg, locale) {
		inTemp((d) => {
			const out = join(d, 'raw.wav')
			const code = cfg.lang_code ?? KOKORO_LANG[locale] ?? KOKORO_LANG[lang(locale)]
			sh(cfg.python ?? 'python3', ['-c', KOKORO_PY, JSON.stringify({ code, voice: cfg.voice ?? 'af_heart', speed: cfg.speed ?? 1, out })], text)
			toTake(out, dst)
		})
	},
	voices: async () => ['af_heart, af_bella, am_michael, bf_emma, bm_george (en); ef_dora, em_alex (es); ff_siwis (fr); if_sara (it); pf_dora (pt); jf_alpha (ja); zf_xiaobei (zh); see the Kokoro VOICES list']
}

const macos = {
	label: 'macOS say (offline, drafts)',
	check() { if (!which('say')) fail('`say` exists only on macOS') },
	async synth(text, dst, cfg) {
		inTemp((d) => {
			const raw = join(d, 'raw.aiff')
			sh('say', ['-o', raw, ...(cfg.voice ? ['-v', cfg.voice] : []), ...(cfg.rate ? ['-r', String(cfg.rate)] : []), text])
			toTake(raw, dst)
		})
	},
	async voices(cfg, locale) {
		const all = String(sh('say', ['-v', '?'])).split('\n').filter(Boolean)
		const l = lang(locale), mine = all.filter((x) => x.includes(` ${l}_`) || x.includes(` ${l}-`))
		return mine.length ? mine : all.slice(0, 40)
	}
}

const espeak = {
	label: 'eSpeak NG (offline, robotic)',
	check() { if (!which('espeak-ng')) fail('install espeak-ng (brew/apt/choco)') },
	async synth(text, dst, cfg, locale) {
		inTemp((d) => {
			const raw = join(d, 'raw.wav')
			sh('espeak-ng', ['-v', cfg.voice ?? locale, '-s', String(cfg.speed ?? 160), '-w', raw, text])
			toTake(raw, dst)
		})
	},
	voices: async (cfg, locale) => String(sh('espeak-ng', [`--voices=${lang(locale)}`])).split('\n').filter(Boolean)
}

const elevenlabs = {
	label: 'ElevenLabs',
	check(cfg) {
		env('ELEVENLABS_API_KEY')
		if (!cfg.voice_id && !cfg.voice) fail('set "voice_id"')
	},
	async synth(text, dst, cfg, locale, ctx) {
		const body = {
			text, model_id: cfg.model ?? 'eleven_multilingual_v2', language_code: lang(locale),
			voice_settings: { stability: cfg.stability ?? 0.55, similarity_boost: cfg.similarity ?? 0.8 }
		}
		if (ctx.prev) body.previous_text = ctx.prev
		if (ctx.next) body.next_text = ctx.next
		const audio = await post(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice_id ?? cfg.voice}?output_format=mp3_44100_128`, body,
			{ 'xi-api-key': env('ELEVENLABS_API_KEY'), 'content-type': 'application/json' })
		toTake(audio, dst)
	},
	async voices() {
		const data = await get('https://api.elevenlabs.io/v1/voices', { 'xi-api-key': env('ELEVENLABS_API_KEY') })
		return (data.voices ?? []).map((v) => `${v.voice_id}  ${v.name}  ${JSON.stringify(v.labels ?? {})}`)
	}
}

const openai = {
	label: 'OpenAI (or Azure OpenAI)',
	check() {
		if (process.env.AZURE_OPENAI_ENDPOINT) env('AZURE_OPENAI_API_KEY')
		else env('OPENAI_API_KEY')
	},
	async synth(text, dst, cfg) {
		const body = { model: cfg.model ?? 'gpt-4o-mini-tts', voice: cfg.voice ?? 'alloy', input: text, response_format: 'wav' }
		if (cfg.instructions) body.instructions = cfg.instructions // e.g. "Calm, warm, unhurried explainer."
		let url, headers
		if (process.env.AZURE_OPENAI_ENDPOINT) {
			url = `${process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '')}/openai/deployments/${cfg.deployment ?? body.model}/audio/speech?api-version=${cfg.api_version ?? '2025-03-01-preview'}`
			headers = { 'api-key': env('AZURE_OPENAI_API_KEY'), 'content-type': 'application/json' }
		} else {
			url = 'https://api.openai.com/v1/audio/speech'
			headers = { authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'content-type': 'application/json' }
		}
		toTake(await post(url, body, headers), dst)
	},
	voices: async () => ['alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse (all speak every supported language; set "instructions" for tone)']
}

const xml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])
const azure = {
	label: 'Azure AI Speech',
	check(cfg) {
		env('AZURE_SPEECH_KEY'); env('AZURE_SPEECH_REGION')
		if (!cfg.voice) fail('set "voice", e.g. "en-US-AvaMultilingualNeural" or "es-ES-ElviraNeural"')
	},
	async synth(text, dst, cfg, locale) {
		const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${cfg.voice}'><prosody rate='${cfg.rate ?? '0%'}'>${xml(text)}</prosody></voice></speak>`
		const audio = await post(`https://${env('AZURE_SPEECH_REGION')}.tts.speech.microsoft.com/cognitiveservices/v1`, ssml, {
			'Ocp-Apim-Subscription-Key': env('AZURE_SPEECH_KEY'), 'content-type': 'application/ssml+xml',
			'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm', 'user-agent': 'emaki'
		})
		toTake(audio, dst)
	},
	async voices(cfg, locale) {
		const data = await get(`https://${env('AZURE_SPEECH_REGION')}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { 'Ocp-Apim-Subscription-Key': env('AZURE_SPEECH_KEY') })
		return data.filter((v) => v.Locale.startsWith(locale) || v.Locale.split('-')[0] === lang(locale)).map((v) => `${v.ShortName}  ${v.Gender}`)
	}
}

function googleAuth() {
	if (process.env.GOOGLE_TTS_API_KEY) return { 'X-Goog-Api-Key': process.env.GOOGLE_TTS_API_KEY }
	if (which('gcloud')) {
		const tok = spawnSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf-8' }).stdout?.trim()
		if (tok) return { authorization: `Bearer ${tok}` }
	}
	return fail('set GOOGLE_TTS_API_KEY, or sign in with `gcloud auth login`')
}
const google = {
	label: 'Google Cloud Text-to-Speech',
	check(cfg) {
		googleAuth()
		if (!cfg.voice) fail('set "voice", e.g. "en-US-Neural2-F" or "es-ES-Chirp3-HD-Aoede"')
	},
	async synth(text, dst, cfg) {
		const body = {
			input: { text }, voice: { languageCode: cfg.voice.split('-').slice(0, 2).join('-'), name: cfg.voice },
			audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000, speakingRate: cfg.speed ?? 1 }
		}
		const data = await post('https://texttospeech.googleapis.com/v1/text:synthesize', body, { ...googleAuth(), 'content-type': 'application/json' }, 'json')
		toTake(Buffer.from(data.audioContent, 'base64'), dst)
	},
	async voices(cfg, locale) {
		const data = await get(`https://texttospeech.googleapis.com/v1/voices?languageCode=${locale}`, googleAuth())
		return (data.voices ?? []).map((v) => `${v.name}  ${v.ssmlGender}`)
	}
}

const polly = {
	label: 'Amazon Polly',
	check(cfg) {
		if (!which('aws')) fail('install the AWS CLI and sign in (aws configure / SSO); credentials stay in your AWS profile')
		if (!cfg.voice) fail('set "voice", e.g. "Joanna" (en-US) or "Lucia" (es-ES)')
	},
	async synth(text, dst, cfg, locale) {
		inTemp((d) => {
			const raw = join(d, 'raw.mp3')
			sh('aws', ['polly', 'synthesize-speech', '--output-format', 'mp3', '--voice-id', cfg.voice, '--engine', cfg.engine ?? 'neural',
				'--language-code', cfg.language ?? locale, '--text', text, ...(cfg.region ? ['--region', cfg.region] : []), raw])
			toTake(raw, dst)
		})
	},
	async voices(cfg, locale) {
		const out = JSON.parse(String(sh('aws', ['polly', 'describe-voices', '--language-code', cfg.language ?? locale, '--engine', cfg.engine ?? 'neural', ...(cfg.region ? ['--region', cfg.region] : [])])))
		return out.Voices.map((v) => `${v.Id}  ${v.Gender}`)
	}
}

const manual = {
	label: 'Recorded by a person',
	check() {},
	async synth() { fail('manual: record the takes and place them as take-NN.wav; nothing to synthesise') },
	voices: async () => ['Record one file per scene, in scene order, named take-01.wav, take-02.wav, …']
}

export const PROVIDERS = { piper, kokoro, macos, espeak, elevenlabs, openai, azure, google, polly, manual }
export const OFFLINE = ['piper', 'kokoro', 'macos', 'espeak']

export function provider(name) {
	if (!PROVIDERS[name]) fail(`unknown provider "${name}"; one of: ${Object.keys(PROVIDERS).join(', ')}`)
	return PROVIDERS[name]
}

/** The voice block for a locale: voice.default, then voice.<language>, then voice.<locale>; most specific wins. A block
 *  that switches provider starts fresh, so another provider's options (voice, model) don't carry over. */
export function voiceConfig(cfg, locale) {
	const v = cfg.voice ?? {}
	let out = {}
	for (const k of ['default', lang(locale), locale]) {
		const block = v[k] ?? {}
		out = block.provider && block.provider !== out.provider ? { ...block } : { ...out, ...block }
	}
	return out
}

