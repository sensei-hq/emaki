// The final videos (build.py): the rendered picture, the voice laid into each scene, the score ducked under it,
// -14 LUFS, captions shipped as .srt/.vtt (burned in only with `captions`), chapters, the description, the web copy
// and the posters.
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SUFFIX } from './config.js'
import { buildArgs, buildPlan, chaptersText, description, ffmeta, planTable, posterSteps, storyLink, webArgs, webNote, ytChapters } from './media.js'
import { takesFor } from './takes.js'
import { die, hasAudio, load, mediaLength, pad2, run } from './util.js'

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

/** libass lays SRT out on a 384x288 canvas scaled to the video, so these are in 288ths of the height: landscape 16 ≈
 *  60 px text 127 px up; portrait 9 ≈ 60 px text 333 px up (clear of the platform's buttons). */
const burnIn = (srtPath, layout) => {
	const size = layout === 'landscape' ? 16 : 9, margin = layout === 'landscape' ? 34 : 50
	return `subtitles=${srtPath.replace(/([:\\'])/g, '\\$1')}:force_style='FontName=Inter,FontSize=${size},PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BackColour=&H66000000,BorderStyle=3,Outline=5,Shadow=0,MarginV=${margin}'`
}

/** Final videos per orientation (build.py): the rendered picture with the voice laid `lead` s into each scene, the
 *  render's music ducked under it, -14 LUFS, captions shipped as .srt/.vtt (burned in with `captions`). A take that
 *  outruns its scene freezes the scene's last frame until it has finished (buildPlan). `check` prints the plan and
 *  builds nothing; `out` is the output folder (default production/<slug>/<locale>/out/). */
export function build(p, slug, { locale, captions: burn = false, check = false, out: target = undefined, log = console.info, length = mediaLength } = {}) {
	const d = p.filmDir(slug), film = load(join(d, 'film.json'))
	const tp = join(d, `timing.${locale}.json`)
	const tm = existsSync(tp) ? (load(tp).scenes ?? {}) : {}
	const takes = takesFor(p, slug, locale)
	const plan = buildPlan(film, tm, new Map([...takes].map(([sid, [file]]) => [sid, { file, seconds: length(file) }])), p)
	const render = p.prod(slug, locale, 'render')
	const pics = ['landscape', 'portrait'].map((layout) => [layout, join(render, `${slug}-${locale}-${SUFFIX[layout]}.mp4`)])
		.filter(([, f]) => existsSync(f))
	log(`${film.title ?? slug} (${locale}): ${plan.picture.toFixed(1)} s as rendered`)
	planTable(plan).forEach((l) => log(l))
	if (plan.missing.length) log(`missing takes: ${plan.missing.join(', ')}`)
	if (check) {
		if (!pics.length) log(`MISSING: no render in ${p.rel(render)}; run \`emaki render ${slug} --locale ${locale}\``)
		return { built: [], duration: plan.total, plan }
	}
	if (!takes.size) die(`no takes in ${p.rel(p.prod(slug, locale, 'takes'))}; run \`emaki voice\` (or record them) first`)
	if (!pics.length) die(`no render in ${p.rel(render)}; run \`emaki render ${slug} --locale ${locale}\` first`)
	const out = target ? resolve(target) : p.prod(slug, locale, 'out')
	mkdirSync(out, { recursive: true })
	const voiced = new Map([...takes].filter(([sid]) => plan.rows.some((r) => r.id === sid)))
	const starts = new Map(plan.rows.map((r) => [r.id, [r.at, r.tot]]))
	const cap = captions(voiced, starts, p.lead, length)
	const srtPath = join(out, `${slug}-${locale}.srt`)
	writeFileSync(join(out, `${slug}-${locale}.vtt`), cap.vtt)
	writeFileSync(srtPath, cap.srt)
	const inputs = [], filters = []
	;[...voiced].forEach(([sid, [f]], i) => {
		inputs.push('-i', f)
		const ms = Math.round((starts.get(sid)[0] + p.lead) * 1000)
		filters.push(`[${i}:a]aresample=48000,adelay=${ms}|${ms},apad[v${i}]`)
	})
	const voicePath = join(out, 'voice.wav')
	run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex',
		filters.join(';') + ';' + [...voiced].map((_, i) => `[v${i}]`).join('') + `amix=inputs=${voiced.size}:normalize=0,atrim=0:${plan.total.toFixed(3)}[vo]`,
		'-map', '[vo]', '-ac', '2', voicePath])
	const chapters = join(out, 'chapters.ffmeta')
	writeFileSync(chapters, ffmeta(plan.rows))
	const yt = ytChapters(plan.rows)
	writeFileSync(join(out, 'chapters.txt'), chaptersText(yt))
	const story = join(p.content, 'stories', locale, `${slug}.json`)
	const title = (existsSync(story) ? load(story).title : null) ?? film.title ?? slug
	writeFileSync(join(out, 'description.txt'), description({ title, chapters: yt, link: storyLink(p.site, p.cfg, slug, locale) }))
	const built = [], videos = {}
	for (const [layout, pic] of pics) {
		const dst = join(out, `${slug}-${locale}-${SUFFIX[layout]}.mp4`)
		run('ffmpeg', buildArgs({
			pic, voice: voicePath, plan, music: hasAudio(pic), subtitles: burn ? burnIn(srtPath, layout) : null,
			chapters, scoreLevel: p.cfg.scoreLevel ?? 0.55, dst
		}))
		log(`built ${p.rel(dst)} (${plan.rows.length} chapters)`)
		built.push((videos[layout] = dst))
	}
	rmSync(chapters, { force: true })
	if (videos.landscape) {
		const web = join(out, `${slug}-${locale}-web.mp4`)
		run('ffmpeg', webArgs(videos.landscape, web))
		log(`built ${p.rel(web)} (${webNote(statSync(web).size)})`)
		built.push(web)
	}
	for (const step of posterSteps({ render, out, slug, locale, built: videos, last: plan.rows.at(-1), exists: existsSync })) {
		if (step.copy) copyFileSync(...step.copy)
		else run('ffmpeg', step.ffmpeg)
		log(`  ${p.rel((step.copy ?? step.ffmpeg).at(-1))}`)
	}
	log(`captions: ${p.rel(out)}/${slug}-${locale}.vtt/.srt; chapters.txt, description.txt`)
	return { built, duration: plan.total, plan }
}
