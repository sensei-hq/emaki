// What render and build decide, as pure functions: frame ranges, output paths, ffmpeg arguments, the freeze table,
// chapters, the description. capture.js and voice.js run what these return (Playwright, ffmpeg); the specs test these.
// The reference is the sensei-hq.com website's films/tools/render.py and build.py.
import { join, resolve } from 'node:path'
import { SUFFIX } from './config.js'
import { die } from './util.js'

/** The frames to capture: from `from` (default 0) to `to` (default and at most the film's end), at least one. */
export function frameRange(duration, fps, from = 0, to = undefined) {
	const t0 = Math.max(0, Number(from ?? 0))
	const end = Math.min(to == null ? duration : Number(to), duration)
	if (!Number.isFinite(t0) || !Number.isFinite(end) || !(end > t0))
		die(`--from ${from ?? 0} --to ${to ?? 'the end'} is not a range inside the film (it runs ${duration.toFixed(1)} s)`)
	const frames = Math.max(1, Math.round((end - t0) * fps))
	return { t0, end, frames, seconds: frames / fps }
}

/** Where a layout's render goes: the render folder by default; --out FILE.mp4 for one layout, --out FOLDER for any. */
export function renderOut(dir, slug, locale, layout, { out = undefined, layouts = 1 } = {}) {
	const name = `${slug}-${locale}-${SUFFIX[layout]}.mp4`
	if (!out) return join(dir, name)
	if (!/\.mp4$/i.test(out)) return resolve(out, name)
	if (layouts > 1) die(`--out ${out} is one file, so it takes one layout: add --o landscape or --o portrait, or give a folder`)
	return resolve(out)
}

/** Where the music comes from (--music): `synth` the page's score (window.__show.audio(), on the film's own timing),
 *  `export` the audio of an exported film (`exportFile`; silent if it is missing), `none` a silent picture. */
export function musicFor(mode = 'synth', { exportFile = '', exists = (_f) => false } = {}) {
	if (mode === 'synth') return { kind: 'synth' }
	if (mode === 'none') return { kind: 'none' }
	if (mode !== 'export') die(`--music ${mode}: use synth | export | none`)
	if (exists(exportFile)) return { kind: 'file', file: exportFile }
	return { kind: 'none', note: `no ${exportFile}: silent picture` }
}

/** What a render run does: capture frames, lay the music, save the covers. --audio-only lays the music on the
 *  existing render; --cover-only saves just the covers. */
export function renderSteps({ audioOnly = false, coverOnly = false } = {}) {
	if (audioOnly && coverOnly) die('--audio-only and --cover-only exclude each other')
	return { frames: !audioOnly && !coverOnly, music: !coverOnly, cover: true }
}

/** ffmpeg reading JPEG frames from stdin; `audio` (from film time t0) laid under them. */
export function encodeArgs({ fps, seconds, dst, audio = null, t0 = 0 }) {
	return ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
		...(audio ? ['-ss', t0.toFixed(3), '-i', audio, '-map', '0:v', '-map', '1:a'] : []),
		'-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
		...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : []), '-t', seconds.toFixed(3), '-movflags', '+faststart', dst]
}

/** --audio-only: copies the picture and lays `audio` (from film time t0, for dur) under it. */
export function muxArgs(video, audio, t0, dur, dst) {
	return ['-y', '-loglevel', 'error', '-i', video, '-ss', t0.toFixed(3), '-i', audio, '-map', '0:v', '-map', '1:a',
		'-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', dur.toFixed(3), '-movflags', '+faststart', dst]
}

/** Runs `fn`; when it fails (the dev server reloaded the page under it), awaits `recover` (the show coming back)
 *  and runs it again, up to `attempts` times in all, then lets the last error through. */
export async function retrying(fn, recover, attempts = 8) {
	for (let i = 1; ; i++) {
		try {
			return await fn()
		} catch (e) {
			if (i >= attempts) throw e
			await recover(e)
		}
	}
}

/** build.py's plan: each scene's place on the rendered picture (start, dur: film.json plus timing.<locale>.json) and on
 *  the output (at, tot). A take is laid `lead` s into its scene; when lead + take + tail is longer than the scene, the
 *  scene's last frame is frozen for the difference (ext), so nothing is cut off or sped up. `takes`: scene id →
 *  { file, seconds }. After `emaki fit` and a fresh render no scene needs a freeze. */
export function buildPlan(film, timing, takes, { lead, tail }) {
	const rows = []
	let start = 0, at = 0
	for (const [i, s] of film.scenes.entries()) {
		const tm = timing?.[s.id] ?? {}
		const holds = (tm.holds ?? []).reduce((n, h) => n + h[1], 0)
		const dur = Math.max(s.dur + holds, tm.dur ?? 0)
		const take = takes.get(s.id) ?? null
		const L = take ? take.seconds : 0
		let ext = take ? Math.max(0, lead + L + tail - dur) : 0
		if (ext < 1e-3) ext = 0
		rows.push({ n: i + 1, id: s.id, name: s.name ?? s.id, start, dur, take: take?.file ?? null, L, ext, tot: dur + ext, at })
		start += dur
		at += dur + ext
	}
	return { rows, picture: start, total: at, extended: rows.some((r) => r.ext > 0), missing: rows.filter((r) => !r.take).map((r) => r.id) }
}

const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/** The table build --check prints (build.py's): each scene's length, take, freeze and new length, and where it starts. */
export function planTable(plan) {
	const f = (x, w) => x.toFixed(1).padStart(w)
	const lines = [`${'#'.padStart(2)}  ${'scene'.padEnd(12)} ${'dur'.padStart(5)} ${'take'.padStart(5)} ${'ext'.padStart(5)} ${'new'.padStart(6)}  start`]
	for (const r of plan.rows)
		lines.push(`${String(r.n).padStart(2)}  ${r.id.padEnd(12)} ${f(r.dur, 5)} ${f(r.L, 5)} ${f(r.ext, 5)} ${f(r.tot, 6)}  ${mmss(r.at)}${r.take ? '' : '   (no take)'}`)
	const k = plan.rows.filter((r) => r.ext > 0).length
	lines.push(`total ${plan.total.toFixed(1)} s` + (k ? ` (${k} scene${k > 1 ? 's' : ''} frozen to fit ${k > 1 ? 'their takes' : 'its take'}; \`emaki fit\` and a new render make that unnecessary)` : ''))
	return lines
}

const escMeta = (s) => String(s).replace(/[\\=;#]/g, (c) => `\\${c}`).replace(/\n/g, ' ')

/** FFMETADATA with one chapter per scene, on the exact scene boundaries (VLC, QuickTime; YouTube ignores it). */
export function ffmeta(rows) {
	const lines = [';FFMETADATA1']
	for (const r of rows)
		lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(r.at * 1000)}`, `END=${Math.round((r.at + r.tot) * 1000)}`, `title=${escMeta(r.name)}`)
	return lines.join('\n') + '\n'
}

/** YouTube's chapter list: [at, title] from 0:00, every chapter at least 10 s (YouTube shows none unless all its rules
 *  hold). Short scenes fold into the chapter they start; a short tail joins the last one. Boundaries stay on cuts. */
export function ytChapters(rows) {
	const groups = []
	let cur = [], start = 0
	for (const r of rows) {
		cur.push(r)
		if (r.at + r.tot - start >= 10 - 1e-6) {
			groups.push([start, cur])
			cur = []
			start = r.at + r.tot
		}
	}
	if (cur.length) {
		if (groups.length) groups.at(-1)[1].push(...cur)
		else groups.push([start, cur])
	}
	return groups.map(([at, rs]) => [at, rs.map((r) => r.name).join(' + ')])
}

/** chapters.txt: "m:ss title" per line, ready for a video description. */
export const chaptersText = (chapters) =>
	chapters.map(([at, name]) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')} ${name}\n`).join('')

const LOUDNORM = 'loudnorm=I=-14:TP=-1.5:LRA=11'

/** ffmpeg for one final video: the rendered picture (`pic`, its own audio track the music when `music`), the voice
 *  (`voice`, already on the output timeline), the score ducked under the voice, -14 LUFS, `subtitles` (a filter) burned
 *  in. When the plan freezes a scene, each scene is cut from the picture on its own input, the frozen one padded with
 *  its last frame and its music looped under the hold (5 ms fades hide the seam), and the scenes joined again.
 *  `chapters`: an FFMETADATA file (ffmeta) whose chapters are written in the same pass. */
export function buildArgs({ pic, voice, plan, music, subtitles = null, chapters = null, scoreLevel = 0.55, dst }) {
	const inputs = [], fc = []
	let vid, mu = null
	if (plan.extended) {
		const n = plan.rows.length
		for (const r of plan.rows) inputs.push('-ss', r.start.toFixed(3), '-t', r.dur.toFixed(3), '-i', pic)
		plan.rows.forEach((r, i) => {
			fc.push(`[${i}:v]${r.ext ? `tpad=stop_mode=clone:stop_duration=${r.ext.toFixed(3)},` : ''}setpts=PTS-STARTPTS[v${i}]`)
			if (music) {
				const loop = r.ext ? `afade=t=in:st=0:d=0.005,afade=t=out:st=${(r.dur - 0.005).toFixed(3)}:d=0.005,aloop=loop=-1:size=2e9,` : ''
				fc.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,${loop}apad,atrim=0:${r.tot.toFixed(3)},asetpts=PTS-STARTPTS[m${i}]`)
			}
		})
		fc.push(`${plan.rows.map((_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[pv]`)
		if (music) fc.push(`${plan.rows.map((_, i) => `[m${i}]`).join('')}concat=n=${n}:v=0:a=1[mu]`)
		vid = '[pv]'
		mu = music ? '[mu]' : null
	} else {
		inputs.push('-i', pic)
		vid = '0:v'
		if (music) {
			fc.push('[0:a]aresample=48000,aformat=channel_layouts=stereo[mu]')
			mu = '[mu]'
		}
	}
	const vo = inputs.filter((x) => x === '-i').length
	inputs.push('-i', voice)
	const meta = chapters ? ['-map_metadata', String(vo + 1), '-map_chapters', String(vo + 1)] : []
	if (chapters) inputs.push('-i', chapters)
	if (mu)
		fc.push(`${mu}volume=${scoreLevel}[sc]`, `[${vo}:a]aresample=48000,asplit=2[vo][key]`,
			'[sc][key]sidechaincompress=threshold=0.05:ratio=6:release=400[duck]', `[duck][vo]amix=inputs=2:normalize=0,${LOUDNORM}[a]`)
	else fc.push(`[${vo}:a]${LOUDNORM}[a]`)
	if (subtitles) {
		fc.push(`${vid.startsWith('[') ? vid : `[${vid}]`}${subtitles}[v]`)
		vid = '[v]'
	}
	return ['-y', '-v', 'error', ...inputs, '-filter_complex', fc.join(';'), '-map', vid, '-map', '[a]', ...meta,
		'-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
		'-t', plan.total.toFixed(3), '-movflags', '+faststart', dst]
}

/** A warning when an existing render no longer runs as long as the film (after a retiming): its frames are stale. */
export function staleRender(rendered, film, ranged = false) {
	if (ranged || Math.abs(rendered - film) <= 0.2) return null
	return `the render runs ${rendered.toFixed(1)} s but the film now runs ${film.toFixed(1)} s; render the frames again`
}
