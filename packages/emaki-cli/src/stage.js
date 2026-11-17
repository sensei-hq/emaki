// emaki stage <slug>: upload a finished piece's media and post text to the posting desk, so a person can review and
// approve exactly that. Restaging changes a post's fingerprint, so an earlier approval for that channel no longer
// applies (the desk's rule). --dry-run prints the posts and sends nothing.
//
// A campaign day (a day script in <campaign>/days/): every channel's text from the script; the film's 9:16 video for
// YouTube (a Short), the Reel and X; <campaign>/carousels/<slug>/*.png (as JPEG) for the carousel.
// A film: the 16:9 video (+ captions, + the 16:9 cover as thumbnail) for YouTube and X, the 9:16 video (+ cover) for
// the Reel, and the text in content/films/<slug>/post.<locale>.json, which the first run drafts for a read-through.
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { CHANNELS } from '@senseihq/emaki-posting'
import { campaignDir, channelCopy, dayScript } from './day-script.js'
import { deskClient } from './desk-client.js'
import { filmFiles, hashtags, storyFor, storyUrl } from './stories.js'
import { die, exists, load, run, save } from './util.js'

const TYPES = { mp4: 'video/mp4', srt: 'text/plain', vtt: 'text/vtt' }
const typeOf = (f) => TYPES[f.split('.').pop()] ?? 'image/jpeg'

/** PNG → JPEG with ffmpeg (Instagram takes JPEG only), into a temp folder. */
export function pngToJpeg(png) {
	const out = join(mkdtempSync(join(tmpdir(), 'emaki-jpeg-')), basename(png).replace(/\.png$/i, '.jpg'))
	run('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '2', out])
	return out
}

/** The draft text for a film's channels, from its story. */
function draftPosts(p, slug, locale, story, files) {
	const link = storyUrl(p, slug, locale), tags = hashtags(story.tags)
	const desc = files.description ? readFileSync(files.description, 'utf-8').trim() : `${story.dek}\n\nRead the story: ${link}\n${tags}`
	return {
		youtube: { title: story.title.slice(0, 100), description: desc, tags: story.tags, short: false },
		instagram_reel: { caption: `${story.title}. ${story.dek}\n\nFull story: link in bio.\n\n${tags}` },
		x: { text: `${story.title}: ${story.dek}`.slice(0, 270), thread: [`The full story, with the film: ${link}`] }
	}
}

/** { channel: [post text, [{ path, expect, name? }]] } for one piece. `path` null = missing; `expect` names it. */
export function postsFor(p, slug, locale) {
	const story = storyFor(p, slug, locale), f = filmFiles(p, slug, locale)
	const tall = { path: f.tall, expect: f.expect.tall }, wide = { path: f.wide, expect: f.expect.wide }
	const md = dayScript(p, slug, locale)
	if (md) {
		const c = channelCopy(md), dir = join(campaignDir(p), 'carousels', slug)
		const slides = exists(dir) ? readdirSync(dir).filter((n) => n.endsWith('.png')).sort().map((n) => ({ path: join(dir, n) })) : []
		return {
			youtube: [{ ...c.youtube, short: true }, [tall]],
			instagram_reel: [{ caption: c.caption }, [tall]],
			instagram_carousel: [{ caption: c.caption }, slides.length ? slides : [{ path: null, expect: dir }]],
			x: [c.x, [tall]]
		}
	}
	const pj = join(p.films, slug, `post.${locale}.json`)
	if (!exists(pj)) {
		save(pj, draftPosts(p, slug, locale, story, f))
		die(`wrote ${p.rel(pj)}: check the text, then run \`emaki stage ${slug}\` again`)
	}
	const text = load(pj), opt = (path, name) => (path ? [{ path, name }] : [])
	const files = {
		youtube: [wide, ...opt(f.srt), ...opt(f.thumb, `${slug}-${locale}-thumb.jpg`)], // -thumb.jpg: the poster sets it as the thumbnail
		instagram_reel: [tall, ...opt(f.coverTall)],
		x: [wide]
	}
	return Object.fromEntries(Object.keys(files).filter((c) => text[c]).map((c) => [c, [text[c], files[c]]]))
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** --channels (a list, or comma-separated) or every channel; an unknown name is refused. */
function wantedChannels(channels) {
	const want = channels ? [channels].flat().flatMap((c) => String(c).split(',')).map((c) => c.trim()).filter(Boolean) : [...CHANNELS]
	for (const c of want) if (!CHANNELS.includes(c)) die(`unknown channel "${c}" (${CHANNELS.join(', ')})`)
	return want
}

/** Uploads a channel's files to the desk (once per key across channels; PNG as JPEG) and lists them with their hashes.
 *  Without a desk (dry run) nothing is sent and each hash is computed here. */
async function channelMedia(files, { slug, channel, desk, uploaded, toJpeg }) {
	const media = []
	for (const x of files) {
		const path = x.path.endsWith('.png') ? toJpeg(x.path) : x.path
		const name = (x.name ?? basename(path)).toLowerCase(), type = typeOf(path)
		const key = `${slug}/${type === 'image/jpeg' ? `${channel.split('_')[0]}-${name}` : name}`
		const bytes = readFileSync(path)
		if (desk && !uploaded.has(key)) uploaded.set(key, await desk.putMedia(key, bytes, type))
		media.push({ key, sha256: uploaded.get(key) ?? sha(bytes), type })
	}
	return media
}

/** One channel: skipped when a file is missing, printed on a dry run (no desk), else staged on the desk. */
async function stageChannel(p, slug, channel, [text, files], ctx) {
	const { desk, log, result } = ctx
	const missing = files.filter((x) => !x.path).map((x) => p.rel(x.expect))
	if (missing.length) {
		log(`  ${channel}: skipped, missing ${missing.join(', ')}`)
		result.skipped.push({ channel, missing })
		return
	}
	const media = await channelMedia(files, { slug, channel, ...ctx })
	const post = { ...text, media }
	result.posts[channel] = post
	if (!desk) return log(`--- ${channel}\n${JSON.stringify(post, null, 2)}`)
	const r = await desk.stage(slug, channel, post)
	log(`  ${channel}: staged (${String(r.content_sha).slice(0, 10)}), ${media.length} file(s)`)
	result.staged.push({ channel, content_sha: r.content_sha, files: media.length })
}

export async function stage(p, slug, { locale, channels, dryRun = false, env = process.env, fetch = globalThis.fetch, log = console.info, toJpeg = pngToJpeg } = {}) {
	locale ??= p.site.defaultLocale
	const want = wantedChannels(channels)
	const posts = postsFor(p, slug, locale)
	const desk = dryRun ? null : deskClient(p, { env, fetch })
	const ctx = { desk, log, toJpeg, uploaded: new Map(), result: { staged: [], skipped: [], posts: {} } }
	for (const channel of CHANNELS.filter((c) => want.includes(c) && posts[c])) await stageChannel(p, slug, channel, posts[channel], ctx)
	if (desk) log(`Review and approve on ${desk.origin}/admin`)
	return ctx.result
}
