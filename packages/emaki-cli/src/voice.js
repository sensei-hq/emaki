// The narration: choose a voice per locale and synthesise the takes. Fitting scene times to them (fit.js) and
// building the final videos (build-video.js: voice + score + captions, -14 LUFS) are re-exported from here.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { OFFLINE, provider, TTSError, voiceConfig } from './tts.js'
import { die, load, mediaLength, pad2, save } from './util.js'

// The steps after the takes, re-exported: the timing (fit.js), the final videos (build-video.js), the takes (takes.js).
export { fit, voiceWeb } from './fit.js'
export { build, captions } from './build-video.js'
export { takesFor } from './takes.js'

export const NO_PROVIDER = (loc) => `no voice provider is set for ${loc}. Choose one and record it with set-voice, for example:
  offline   piper (good, free)   kokoro (very natural, free)   macos (Mac drafts)   espeak (robotic drafts)
  cloud     elevenlabs   openai   azure (Microsoft shops)   google (Google shops)   polly (AWS shops)
  person    manual (record take-NN.wav files yourself)
  emaki set-voice --locale default --provider piper --opt model=voices/en_US-lessac-medium.onnx`

export function chosen(p, locale, override, opts = {}) {
	let v = voiceConfig(p.cfg, locale)
	if (override) v = { ...v, provider: override }
	v = { ...v, ...opts }
	if (!v.provider) die(NO_PROVIDER(locale))
	return { vcfg: v, prov: provider(v.provider) }
}

/** Per locale: the configured provider and whether it is ready here; and which offline engines this machine has. */
export function ttsCheck(p) {
	const rows = p.site.locales.map((loc) => {
		const v = voiceConfig(p.cfg, loc)
		if (!v.provider) return { locale: loc, provider: null, ready: false, note: 'no provider set' }
		try {
			provider(v.provider).check(v, loc)
			return { locale: loc, provider: v.provider, label: provider(v.provider).label, ready: true }
		} catch (e) {
			return { locale: loc, provider: v.provider, label: provider(v.provider).label, ready: false, note: e.message }
		}
	})
	const here = []
	for (const name of OFFLINE) {
		try {
			provider(name).check(name === 'piper' ? { model: '__probe__' } : {}, p.site.defaultLocale)
			here.push(name)
		} catch (e) {
			if (name === 'piper' && /voice model/.test(e.message)) here.push('piper (needs a voice model)')
		}
	}
	return { rows, offline: here }
}

/** Records the provider (and options) for a locale in emaki.config.json. Keys never go there. */
export function setVoice(p, locale, name, opts = {}) {
	provider(name)
	const cfg = existsSync(p.cfgPath) ? load(p.cfgPath) : {}
	const block = ((cfg.voice ??= {})[locale] ??= {})
	block.provider = name
	Object.assign(block, opts)
	const dropped = Object.keys(block).filter((k) => /key|secret|token/i.test(k))
	for (const k of dropped) delete block[k]
	save(p.cfgPath, cfg)
	p.cfg = cfg
	return { block, dropped }
}

export async function listVoices(p, locale, override) {
	const { vcfg, prov } = chosen(p, locale, override)
	return prov.voices(vcfg, locale)
}

/** Synthesises take-NN.wav per voice line (or prints the recording list for `manual`). */
export async function voice(p, slug, { locale, only, provider: override, opts = {}, log = console.info } = {}) {
	const d = p.filmDir(slug)
	const lines = load(join(d, 'voice', `${locale}.json`))
	const pick = only ? new Set(String(only).split(',').map(Number)) : null
	const { vcfg, prov } = chosen(p, locale, override, opts)
	try {
		prov.check(vcfg, locale)
	} catch (e) {
		die(`${prov.label}: ${e.message}`)
	}
	const takes = p.prod(slug, locale, 'takes')
	if (vcfg.provider === 'manual') {
		log(`manual: record ${lines.length} takes into ${p.rel(takes)}/ as take-01.wav … take-${pad2(lines.length)}.wav, in this order:`)
		lines.forEach((l, i) => log(`  take-${pad2(i + 1)} (${l.scene}): ${l.text}`))
		return []
	}
	mkdirSync(takes, { recursive: true })
	const spoken = lines.map((l) => l.say || l.text), made = []
	for (const [i, l] of lines.entries()) {
		const n = i + 1
		if (pick && !pick.has(n)) continue
		const ctx = { prev: spoken[i - 1] ?? null, next: spoken[i + 1] ?? null }
		const dst = join(takes, `take-${pad2(n)}.wav`)
		try {
			await prov.synth(spoken[i], dst, vcfg, locale, ctx)
		} catch (e) {
			die(`take-${pad2(n)}: ${e instanceof TTSError ? e.message : e}`)
		}
		const len = mediaLength(dst)
		made.push({ take: n, scene: l.scene, seconds: len })
		log(`take-${pad2(n)} (${l.scene}): ${len.toFixed(1)} s · ${prov.label}`)
	}
	const keep = Object.fromEntries(Object.entries(vcfg).filter(([k]) => ['provider', 'voice', 'voice_id', 'model'].includes(k)))
	writeFileSync(join(takes, 'provider.json'), JSON.stringify(keep, null, 1) + '\n')
	return made
}
