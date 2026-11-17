// What build decides, as pure functions (build.py's): the freeze table, the ffmpeg arguments for the final videos,
// chapters, the description, the posters. build-video.js runs what these return; media.js re-exports them.
import { join } from 'node:path'
import { runningTime } from './util.js'

/** build.py's plan: each scene's place on the rendered picture (start, dur: film.json plus timing.<locale>.json) and on
 *  the output (at, tot). A take is laid `lead` s into its scene; when lead + take + tail is longer than the scene, the
 *  scene's last frame is frozen for the difference (ext), so nothing is cut off or sped up. `takes`: scene id →
 *  { file, seconds }. After `emaki fit` and a fresh render no scene needs a freeze. */
export function buildPlan(film, timing, takes, { lead, tail }) {
	const rows = []
	let start = 0, at = 0
	for (const [i, s] of film.scenes.entries()) {
		const dur = runningTime(s, timing?.[s.id])
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

/** description.txt: the title, the chapter list and the story link, ready to paste into a video description. */
export const description = ({ title, chapters, link = null }) => `${title}\n\n${chaptersText(chapters)}${link ? `\n${link}\n` : ''}`

/** The story page a video links to: emaki.config.json storyUrl ({site} {locale} {slug}), by default
 *  {site}/{locale}/stories/{slug}; null when the pattern needs the site url and site.json has none. */
export function storyLink(site, cfg, slug, locale) {
	const pattern = cfg?.storyUrl ?? '{site}/{locale}/stories/{slug}'
	const base = String(site?.url ?? '').replace(/\/+$/, '')
	if (pattern.includes('{site}') && !base) return null
	return pattern.replaceAll('{site}', base).replaceAll('{locale}', locale).replaceAll('{slug}', slug)
}

/** poster.jpg, poster-vertical.jpg and <slug>-<locale>-thumb.jpg (1280x720, YouTube's custom thumbnail): from the
 *  covers render saved, else a still from the end card of the built video (2.5 s into the last scene, or 0.2 s
 *  before its end). Each step is { copy: [src, dst] } or { ffmpeg: args }; a step with no source is left out. */
export function posterSteps({ render, out, slug, locale, built, last, exists }) {
	const cover = (sfx) => join(render, `${slug}-${locale}-cover-${sfx}.jpg`)
	const still = (last.at + Math.min(last.tot - 0.2, 2.5)).toFixed(2)
	const steps = []
	for (const [sfx, layout, name] of [['16x9', 'landscape', 'poster.jpg'], ['9x16', 'portrait', 'poster-vertical.jpg']]) {
		if (exists(cover(sfx))) steps.push({ copy: [cover(sfx), join(out, name)] })
		else if (built[layout]) steps.push({ ffmpeg: ['-y', '-v', 'error', '-ss', still, '-i', built[layout], '-frames:v', '1', '-q:v', '2', join(out, name)] })
	}
	const thumb = join(out, `${slug}-${locale}-thumb.jpg`)
	if (exists(cover('16x9'))) steps.push({ ffmpeg: ['-y', '-v', 'error', '-i', cover('16x9'), '-vf', 'scale=1280:720', '-q:v', '3', thumb] })
	else if (built.landscape)
		steps.push({ ffmpeg: ['-y', '-v', 'error', '-ss', still, '-i', built.landscape, '-vf', 'scale=1280:720', '-frames:v', '1', '-q:v', '3', thumb] })
	return steps
}

/** The -web.mp4: the 16:9 film at 30 fps, CRF 26, AAC 128k, chapters kept; small enough for static hosting. */
export const webArgs = (src, dst) => ['-y', '-v', 'error', '-i', src, '-r', '30', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow',
	'-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-map_chapters', '0', '-movflags', '+faststart', dst]

/** The web copy's size, flagged above the 25 MiB a static host such as Cloudflare Pages serves. */
export function webNote(bytes) {
	const mb = bytes / 1048576
	return `${mb.toFixed(1)} MiB${mb > 25 ? ' - OVER 25 MiB, raise -crf' : ''}`
}

/** One take for the browser (voice-web): mono AAC 64k at -16 LUFS (speech heard on its own, under a ducked score),
 *  the index up front so it starts streaming at once. */
export const webVoiceArgs = (src, dst) => ['-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '48000',
	'-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', dst]

const LOUDNORM = 'loudnorm=I=-14:TP=-1.5:LRA=11'

/** The rendered picture as one input; its own audio track, when `music`, resampled as the score. */
function wholePicture(pic, music) {
	return { inputs: ['-i', pic], fc: music ? ['[0:a]aresample=48000,aformat=channel_layouts=stereo[mu]'] : [], vid: '0:v', mu: music ? '[mu]' : null }
}

const sceneVideo = (r, i) => `[${i}:v]${r.ext ? `tpad=stop_mode=clone:stop_duration=${r.ext.toFixed(3)},` : ''}setpts=PTS-STARTPTS[v${i}]`
function sceneMusic(r, i) {
	const loop = r.ext ? `afade=t=in:st=0:d=0.005,afade=t=out:st=${(r.dur - 0.005).toFixed(3)}:d=0.005,aloop=loop=-1:size=2e9,` : ''
	return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,${loop}apad,atrim=0:${r.tot.toFixed(3)},asetpts=PTS-STARTPTS[m${i}]`
}

/** Each scene cut from the picture on its own input, a frozen one padded with its last frame and (when `music`) its
 *  music looped under the hold, then the scenes joined again. */
function scenePicture(pic, rows, music) {
	const n = rows.length, labels = (x) => rows.map((_, i) => `[${x}${i}]`).join('')
	const fc = rows.flatMap((r, i) => (music ? [sceneVideo(r, i), sceneMusic(r, i)] : [sceneVideo(r, i)]))
	fc.push(`${labels('v')}concat=n=${n}:v=1:a=0[pv]`)
	if (music) fc.push(`${labels('m')}concat=n=${n}:v=0:a=1[mu]`)
	return { inputs: rows.flatMap((r) => ['-ss', r.start.toFixed(3), '-t', r.dur.toFixed(3), '-i', pic]), fc, vid: '[pv]', mu: music ? '[mu]' : null }
}

/** The voice (input `vo`) alone at -14 LUFS, or with the score (`mu`) ducked under it. */
const mixFilters = (mu, vo, scoreLevel) => (mu
	? [`${mu}volume=${scoreLevel}[sc]`, `[${vo}:a]aresample=48000,asplit=2[vo][key]`,
		'[sc][key]sidechaincompress=threshold=0.05:ratio=6:release=400[duck]', `[duck][vo]amix=inputs=2:normalize=0,${LOUDNORM}[a]`]
	: [`[${vo}:a]${LOUDNORM}[a]`])

/** ffmpeg for one final video: the rendered picture (`pic`, its own audio track the music when `music`), the voice
 *  (`voice`, already on the output timeline), the score ducked under the voice, -14 LUFS, `subtitles` (a filter) burned
 *  in. When the plan freezes a scene, each scene is cut from the picture on its own input, the frozen one padded with
 *  its last frame and its music looped under the hold (5 ms fades hide the seam), and the scenes joined again.
 *  `chapters`: an FFMETADATA file (ffmeta) whose chapters are written in the same pass. */
export function buildArgs({ pic, voice, plan, music, subtitles = null, chapters = null, scoreLevel = 0.55, dst }) {
	const picture = plan.extended ? scenePicture(pic, plan.rows, music) : wholePicture(pic, music)
	const vo = picture.inputs.filter((x) => x === '-i').length
	const inputs = [...picture.inputs, '-i', voice, ...(chapters ? ['-i', chapters] : [])]
	const meta = chapters ? ['-map_metadata', String(vo + 1), '-map_chapters', String(vo + 1)] : []
	const fc = [...picture.fc, ...mixFilters(picture.mu, vo, scoreLevel)]
	let vid = picture.vid
	if (subtitles) {
		fc.push(`${vid.startsWith('[') ? vid : `[${vid}]`}${subtitles}[v]`)
		vid = '[v]'
	}
	return ['-y', '-v', 'error', ...inputs, '-filter_complex', fc.join(';'), '-map', vid, '-map', '[a]', ...meta,
		'-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
		'-t', plan.total.toFixed(3), '-movflags', '+faststart', dst]
}
