// The cloud text-to-speech providers: ElevenLabs, OpenAI (or Azure OpenAI), Azure AI Speech, Google Cloud and Amazon
// Polly. Keys come from environment variables only. check(cfg, locale) throws TTSError when not ready.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { env, fail, get, inTemp, lang, post, sh, toTake } from './tts-io.js'
import { which } from './util.js'

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

export { elevenlabs, openai, azure, google, polly }
