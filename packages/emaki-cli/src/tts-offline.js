// The offline text-to-speech providers: Piper, Kokoro, macOS say and eSpeak NG. Each runs a local command and turns
// its output into a take (toTake). check(cfg, locale) throws TTSError when not ready; synth(text, dst, cfg, locale).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fail, inTemp, lang, sh, toTake } from './tts-io.js'
import { which } from './util.js'

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

export { piper, kokoro, macos, espeak }
