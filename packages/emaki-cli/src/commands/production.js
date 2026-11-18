// emaki sheet, tts-check, set-voice, voices, voice, fit, voice-web, render, build: the production steps, per film and
// per locale.
import { MotionError, parseOpts } from '../util.js'
import { act, loc, P } from './run.js'

/** A tts-check row's provider: its label, and whether it is ready here. */
const providerState = (x) => `${x.provider} (${x.label}) ${x.ready ? 'ready' : `not ready: ${x.note}`}`

/** One scene of the fit table: design, holds, take and running time, and whether it now runs longer or shorter. */
function fitRow(x) {
	const change = x.longer ? '  ← longer' : x.shorter ? '  ← shorter' : ''
	return `${x.scene.padEnd(12)} ${x.design.toFixed(1).padStart(6)} ${x.holds.toFixed(1).padStart(6)} ${x.take.toFixed(1).padStart(6)} ${x.runs.toFixed(1).padStart(6)}${change}${x.take ? '' : '  (no take)'}`
}

/** The production steps: sheet, voice, fit, render, build. */
export function productionCommands(prog) {
	prog.command('sheet <slug>')
		.describe('Contact sheet: each scene\'s final picture in both orientations (needs Playwright).')
		.option('--locale', 'Locale (default: the site default)')
		.option('--url', 'A running site (default: start the dev server)')
		.option('--at', 'scene:t,scene:t instead of each scene\'s final picture')
		.action(act(async (slug, o) => {
			const { sheet } = await import('../capture.js')
			const p = P()
			await sheet(p, slug, { locale: loc(o, p), url: o.url, at: o.at })
		}))

	prog.command('tts-check')
		.describe('Which voice provider each locale uses, whether it is ready here, and which offline engines exist.')
		.action(act(async () => {
			const { ttsCheck } = await import('../voice.js')
			const r = ttsCheck(P())
			for (const x of r.rows) console.info(`${x.locale}: ${x.provider ? providerState(x) : 'no provider set'}`)
			console.info(`offline engines on this machine: ${r.offline.join(', ') || 'none'}`)
		}))

	prog.command('set-voice')
		.describe('Choose the voice provider for a locale (or "default"); options with --opt key=value. Keys stay in env vars.')
		.option('--locale', 'Locale, a language, or default', 'default')
		.option('--provider', 'piper | kokoro | macos | espeak | elevenlabs | openai | azure | google | polly | manual')
		.option('--opt', 'key=value (voice, voice_id, model, instructions, rate, …); repeatable')
		.action(act(async (o) => {
			const { setVoice } = await import('../voice.js')
			if (!o.provider) throw new MotionError('--provider is required')
			const r = setVoice(P(), o.locale, o.provider, parseOpts(o.opt))
			r.dropped.forEach((k) => console.info(`dropped "${k}": keys belong in environment variables, not emaki.config.json`))
			console.info(`voice.${o.locale} = ${JSON.stringify(r.block)}`)
		}))

	prog.command('voices')
		.describe('List the voices a provider offers for a locale.')
		.option('--locale', 'Locale (default: the site default)')
		.option('--provider', 'Override the configured provider')
		.action(act(async (o) => {
			const { listVoices } = await import('../voice.js')
			const p = P()
			for (const v of await listVoices(p, loc(o, p), o.provider)) console.info(v)
		}))

	prog.command('voice <slug>')
		.describe('Synthesise the takes from voice/<locale>.json with the configured provider.')
		.option('--locale', 'Locale (default: the site default)')
		.option('--only', 'Take numbers, e.g. 2,5')
		.option('--provider', 'Override the configured provider for this run')
		.option('--opt', 'key=value override, e.g. voice=nova; repeatable')
		.action(act(async (slug, o) => {
			const { voice } = await import('../voice.js')
			const p = P()
			await voice(p, slug, { locale: loc(o, p), only: o.only, provider: o.provider, opts: parseOpts(o.opt) })
		}))

	prog.command('fit <slug>')
		.describe('Fit each scene\'s running time to its take: timing.<locale>.json.')
		.option('--locale', 'Locale (default: the site default)')
		.option('--check', 'Report only; write nothing', false)
		.action(act(async (slug, o) => {
			const { fit } = await import('../voice.js')
			const p = P()
			const r = fit(p, slug, { locale: loc(o, p), check: o.check })
			console.info(`${'scene'.padEnd(12)} ${'design'.padStart(6)} ${'holds'.padStart(6)} ${'take'.padStart(6)} ${'runs'.padStart(6)}`)
			for (const x of r.rows) console.info(fitRow(x))
			console.info(`total ${r.total.toFixed(1)} s (${loc(o, p)})${r.written ? `\nwrote ${r.path}` : ''}`)
		}))

	prog.command('voice-web <slug>')
		.describe('Narration for the browser: each take as voice/<locale>/<scene>.m4a, and its start in timing.<locale>.json (needs ffmpeg).')
		.option('--locale', 'Locale (default: the site default)')
		.action(act(async (slug, o) => {
			const { voiceWeb } = await import('../voice.js')
			const p = P()
			const r = voiceWeb(p, slug, { locale: loc(o, p), log: (l) => console.info(`wrote ${l}`) })
			for (const f of r.removed) console.info(`removed ${f} (no take)`)
			console.info(`wrote ${r.timing}`)
		}))

	prog.command('render <slug>')
		.describe('Capture the picture frame by frame (with the score) and the covers (needs Playwright + ffmpeg).')
		.option('--locale', 'Locale (default: the site default)')
		.option('--url', 'A running site (default: start the dev server)')
		.option('--o', 'both | landscape | portrait', 'both')
		.option('--fps', 'Frames per second', 30)
		.option('--from', 'Start at this film time (s)', 0)
		.option('--to', 'Stop at this film time (s; default the end)')
		.option('--out', 'Output: a .mp4 file (one layout) or a folder (default production/<slug>/<locale>/render/)')
		.option('--music', 'synth (the film\'s score) | export (audio of production/<slug>/<locale>/<slug>.mp4) | none', 'synth')
		.option('--audio-only', 'Lay the music on the existing render; capture no frames', false)
		.option('--cover-only', 'Just save the cover frames', false)
		.action(act(async (slug, o) => {
			const { render } = await import('../capture.js')
			const p = P()
			await render(p, slug, {
				locale: loc(o, p), url: o.url, o: o.o, fps: Number(o.fps), from: Number(o.from), to: o.to == null ? undefined : Number(o.to),
				out: o.out, music: o.music, audioOnly: o['audio-only'], coverOnly: o['cover-only']
			})
		}))

	prog.command('build <slug>')
		.describe('Final videos: picture + voice + ducked score, captions (.srt/.vtt, burned in with --captions), -14 LUFS.')
		.option('--locale', 'Locale (default: the site default)')
		.option('--captions', 'Burn captions into the picture', false)
		.option('--check', 'Print each scene\'s take, freeze and start; build nothing', false)
		.option('--out', 'Output folder (default production/<slug>/<locale>/out/)')
		.action(act(async (slug, o) => {
			const { build } = await import('../voice.js')
			const p = P()
			build(p, slug, { locale: loc(o, p), captions: o.captions, check: o.check, out: o.out })
		}))
}
