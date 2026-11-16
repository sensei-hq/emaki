// The narration: choose a voice per locale, synthesise takes, fit scene times to them, and build the final videos
// (voice + score + captions, -14 LUFS).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SUFFIX } from './config.js'
import { OFFLINE, provider, TTSError, voiceConfig } from './tts.js'
import { die, load, mediaLength, pad2, run, save } from './util.js'

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

/** scene id → [take file, voice line] for the takes that exist. */
export function takesFor(p, slug, locale) {
	const d = p.filmDir(slug), lines = load(join(d, 'voice', `${locale}.json`)), folder = p.prod(slug, locale, 'takes')
	const out = new Map()
	lines.forEach((l, i) => {
		for (const ext of ['wav', 'mp3', 'm4a', 'aiff']) {
			const f = join(folder, `take-${pad2(i + 1)}.${ext}`)
			if (existsSync(f)) { out.set(l.scene, [f, l]); break }
		}
	})
	return out
}

/** timing.<locale>.json: each scene runs at least lead + take + tail; shorter takes keep the design time. */
export function fit(p, slug, { locale, check = false, length = mediaLength } = {}) {
	const d = p.filmDir(slug), film = load(join(d, 'film.json')), takes = takesFor(p, slug, locale)
	const tp = join(d, `timing.${locale}.json`)
	const timing = existsSync(tp) ? load(tp) : { scenes: {} }
	const tsc = (timing.scenes ??= {})
	const rows = []
	for (const s of film.scenes) {
		const c = tsc[s.id] ?? {}
		const holds = (c.holds ?? []).reduce((n, h) => n + h[1], 0)
		const L = takes.has(s.id) ? length(takes.get(s.id)[0]) : 0
		const need = L ? Math.ceil((p.lead + L + p.tail) * 10) / 10 : 0
		const base = s.dur + holds, runs = Math.max(base, need)
		if (runs > base + 1e-6) c.dur = runs
		else delete c.dur
		if (Object.keys(c).length) tsc[s.id] = c
		else delete tsc[s.id]
		rows.push({ scene: s.id, design: s.dur, holds, take: L, runs, longer: runs > base + 1e-6 })
	}
	if (!check) save(tp, timing)
	return { rows, total: rows.reduce((n, r) => n + r.runs, 0), path: p.rel(tp), written: !check }
}

const stamp = (t, sep = '.') => {
	const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
	return `${pad2(h)}:${pad2(m)}:${s.toFixed(3).padStart(6, '0')}`.replace('.', sep)
}

/** Captions from the voice lines, spread over each take by sentence length. */
export function captions(takes, starts, lead, length = mediaLength) {
	const vtt = ['WEBVTT', ''], srt = []
	let k = 0
	for (const [sid, [f, line]] of takes) {
		let t0 = starts.get(sid)[0] + lead
		const span = length(f) - 0.1
		const parts = line.text.split(/(?<=[.!?¿¡;:])\s+/).map((x) => x.trim()).filter(Boolean)
		const total = parts.reduce((n, x) => n + x.length, 0)
		for (const x of parts) {
			const dd = (span * x.length) / total
			k++
			vtt.push(`${stamp(t0)} --> ${stamp(t0 + dd)}`, x, '')
			srt.push(String(k), `${stamp(t0, ',')} --> ${stamp(t0 + dd, ',')}`, x, '')
			t0 += dd
		}
	}
	return { vtt: vtt.join('\n'), srt: srt.join('\n') }
}

/** Final videos per orientation: picture + voice + ducked score, captions burned in (and shipped as .srt/.vtt). */
export function build(p, slug, { locale, noCaptions = false, log = console.info } = {}) {
	const d = p.filmDir(slug), film = load(join(d, 'film.json'))
	const tp = join(d, `timing.${locale}.json`)
	const tm = existsSync(tp) ? (load(tp).scenes ?? {}) : {}
	const takes = takesFor(p, slug, locale)
	if (!takes.size) die(`no takes in ${p.rel(p.prod(slug, locale, 'takes'))}; run \`emaki voice\` (or record them) first`)
	const starts = new Map()
	let at = 0
	for (const s of film.scenes) {
		const holds = (tm[s.id]?.holds ?? []).reduce((n, h) => n + h[1], 0)
		const dur = Math.max(s.dur + holds, tm[s.id]?.dur ?? 0)
		starts.set(s.id, [at, dur])
		at += dur
	}
	const render = p.prod(slug, locale, 'render'), out = p.prod(slug, locale, 'out')
	mkdirSync(out, { recursive: true })
	const cap = captions(takes, starts, p.lead)
	const srtPath = join(out, `${slug}-${locale}.srt`)
	writeFileSync(join(out, `${slug}-${locale}.vtt`), cap.vtt)
	writeFileSync(srtPath, cap.srt)
	const inputs = [], filters = []
	;[...takes].forEach(([sid, [f]], i) => {
		inputs.push('-i', f)
		const ms = Math.round((starts.get(sid)[0] + p.lead) * 1000)
		filters.push(`[${i}:a]aresample=48000,adelay=${ms}|${ms},apad[v${i}]`)
	})
	const voicePath = join(out, 'voice.wav')
	run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex',
		filters.join(';') + ';' + [...takes].map((_, i) => `[v${i}]`).join('') + `amix=inputs=${takes.size}:normalize=0,atrim=0:${at.toFixed(3)}[vo]`,
		'-map', '[vo]', '-ac', '2', voicePath])
	const score = join(render, 'score.wav'), hasScore = existsSync(score), built = []
	for (const layout of ['landscape', 'portrait']) {
		const pic = join(render, `${slug}-${locale}-${SUFFIX[layout]}.mp4`)
		if (!existsSync(pic)) continue
		const dst = join(out, `${slug}-${locale}-${SUFFIX[layout]}.mp4`)
		const mix = hasScore
			? `[1:a]volume=1[vo];[2:a]volume=${p.cfg.scoreLevel ?? 0.55}[sc];[sc][vo]sidechaincompress=threshold=0.05:ratio=6:release=400[duck];[duck][1:a]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`
			: '[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]'
		// libass lays SRT out on a 384x288 canvas scaled to the video, so these are in 288ths of the height:
		// landscape 16 ≈ 60 px text 127 px up; portrait 9 ≈ 60 px text 333 px up (clear of the platform's buttons).
		const size = layout === 'landscape' ? 16 : 9, margin = layout === 'landscape' ? 34 : 50
		const burn = noCaptions ? [] : ['-vf', `subtitles=${srtPath.replace(/([:\\'])/g, '\\$1')}:force_style='FontName=Inter,FontSize=${size},PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BackColour=&H66000000,BorderStyle=3,Outline=5,Shadow=0,MarginV=${margin}'`]
		run('ffmpeg', ['-y', '-v', 'error', '-i', pic, '-i', voicePath, ...(hasScore ? ['-i', score] : []), '-filter_complex', mix,
			'-map', '0:v', '-map', '[a]', ...burn, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
			'-c:a', 'aac', '-b:a', '192k', '-t', at.toFixed(3), '-movflags', '+faststart', dst])
		log(`built ${p.rel(dst)}`)
		built.push(dst)
	}
	log(`captions: ${p.rel(out)}/${slug}-${locale}.vtt/.srt`)
	return { built, duration: at }
}
