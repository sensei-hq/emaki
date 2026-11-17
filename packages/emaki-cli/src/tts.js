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
import { azure, elevenlabs, google, openai, polly } from './tts-cloud.js'
import { fail, lang, TTSError, toTake } from './tts-io.js'
import { espeak, kokoro, macos, piper } from './tts-offline.js'

export { TTSError, toTake }

// ── Providers: check(cfg, locale) throws TTSError when not ready; synth(text, dst, cfg, locale, ctx) ─────────────
// The offline ones are in tts-offline.js, the cloud ones in tts-cloud.js; manual needs nothing.

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

