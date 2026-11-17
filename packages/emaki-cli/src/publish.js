// emaki publish youtube|instagram <slug>: post a finished, checked film straight to a platform (no desk approval),
// then write the link into the story's entry in content/stories/index.json (an existing id or link is never
// overwritten). --dry-run prints exactly what would post and touches nothing; --verify checks the credentials
// read-only and names the account.
//
// YouTube: the 16:9 film, the description (out/description.txt, else title + chapters + link), the story's tags,
// the captions and the 16:9 cover as thumbnail. Unlisted unless --privacy public. --update <id> refreshes an uploaded
// video in place. Needs YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
// Instagram: the 9:16 film as a Reel with its cover. Meta fetches media from a public URL: pass --video-url and
// --cover-url, or the files go to the desk's media store and are linked for an hour with the desk's signature
// (STAGER_CLIENT_ID, STAGER_CLIENT_SECRET, MEDIA_URL_SECRET). Needs IG_USER_ID, IG_ACCESS_TOKEN.
import { readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { signMedia } from '@senseihq/emaki-posting'
import { deskClient } from './desk-client.js'
import { need } from './http.js'
import { filmFiles, hashtags, recordLinks, storiesIndex, storyFor, storyUrl } from './stories.js'
import { instagram } from './upload/instagram.js'
import { youtube } from './upload/youtube.js'
import { die, exists, load, mediaLength } from './util.js'
import { mergeDescription, youtubeDescription } from './youtube-text.js'

const PRIVACY = ['public', 'unlisted', 'private']
const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`

export async function publish(p, channel, slug, opts = {}) {
	if (channel === 'youtube') return publishYoutube(p, slug, opts)
	if (channel === 'instagram') return publishInstagram(p, slug, opts)
	die(`publish to youtube or instagram (got "${channel}")`)
}

function ytClient(env, fetch, log) {
	need(env, 'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN')
	return youtube({ clientId: env.YT_CLIENT_ID, clientSecret: env.YT_CLIENT_SECRET, refreshToken: env.YT_REFRESH_TOKEN, fetch, log })
}

const DESCRIPTION_MODES = ['prepend', 'replace']
const chapterCount = (desc) => desc.split('\n').filter((l) => /^\d+:\d\d /.test(l)).length

/** What a YouTube post carries: the built 16:9 film, the description, the story's tags, captions and thumbnail. */
function youtubePiece(p, slug, locale) {
	const story = storyFor(p, slug, locale), f = filmFiles(p, slug, locale)
	if (!f.wide) die(`${slug}: no built 16:9 video (${p.rel(f.expect.wide)}); run \`emaki render ${slug}\` and \`emaki build ${slug}\` first`)
	return {
		story, f, desc: youtubeDescription(p, slug, locale, story.title), tags: story.tags,
		srt: f.srt ? readFileSync(f.srt) : null, thumb: f.thumb ? readFileSync(f.thumb) : null
	}
}

/** --update: refreshes the uploaded video's title, description (merged with the remote one), tags, captions, thumbnail. */
async function updateYoutube(p, slug, yt, { story, f, desc, tags, srt, thumb }, { update, dryRun, descriptionMode, locale, log }) {
	const remote = dryRun ? null : (await yt.getVideo(update)).snippet
	const merged = remote ? mergeDescription(remote.description ?? '', desc, descriptionMode) : desc
	log(`YouTube update · ${story.title} · https://www.youtube.com/watch?v=${update}`)
	log(`  title:   ${remote ? JSON.stringify(remote.title) : '(remote)'} → ${JSON.stringify(story.title)}`)
	log(`  desc:    ${descriptionMode}, ${merged.length} chars`)
	log(`  tags:    ${tags.length ? tags.join(', ') : '(keep remote)'}`)
	log(`  captions: ${f.srt ? `replace uploaded tracks with ${basename(f.srt)}` : 'none (skipped)'}`)
	log(`  thumb:   ${f.thumb ? `set ${basename(f.thumb)}` : 'skipped (none rendered)'}`)
	if (dryRun) return log('dry run: nothing changed'), { dryRun: true }
	await yt.updateMetadata(update, { title: story.title, description: merged, tags: tags.length ? tags : undefined })
	if (srt) await yt.replaceCaptions(update, srt, locale)
	if (thumb) await yt.setThumbnail(update, thumb)
	recordLinks(p, slug, { youtube: update })
	log(`updated; recorded in ${p.rel(storiesIndex(p))}`)
	return { id: update, updated: true }
}

/** A new upload; refused when the story already has a video, unless --force-new. */
async function uploadYoutube(p, slug, yt, { story, f, desc, tags, srt, thumb }, { privacy, forceNew, dryRun, locale, log }) {
	if (story.youtube && !forceNew)
		die(`${slug} is already on YouTube as ${story.youtube}; pass --update ${story.youtube} to refresh it, or --force-new to upload again`)
	log(`YouTube · ${story.title} · privacy ${privacy}`)
	log(`  video:   ${basename(f.wide)} (${kb(f.wide)})`)
	log(`  desc:    ${desc.length} chars, ${chapterCount(desc)} chapters`)
	log(`  tags:    ${tags.slice(0, 10).join(', ')}`)
	log(`  captions: ${f.srt ? basename(f.srt) : 'none (continues without)'}`)
	log(`  thumb:   ${f.thumb ? basename(f.thumb) : 'none (continues without)'}`)
	if (dryRun) return log('dry run: nothing posted'), { dryRun: true }
	const r = await yt.publish(readFileSync(f.wide), { title: story.title, description: desc, tags, privacy, srt, thumb, language: locale })
	recordLinks(p, slug, { youtube: r.id })
	log(`posted: ${r.url}\nrecorded in ${p.rel(storiesIndex(p))}`)
	return r
}

async function publishYoutube(p, slug, { locale, verify, dryRun, privacy = 'unlisted', update, forceNew, descriptionMode = 'prepend', env = process.env, fetch = globalThis.fetch, log = console.info } = {}) {
	if (verify) return log(`YouTube posts as: ${await ytClient(env, fetch, log).verify()}`)
	if (!PRIVACY.includes(privacy)) die('--privacy: public, unlisted or private')
	if (!DESCRIPTION_MODES.includes(descriptionMode)) die('--description-mode: prepend or replace')
	locale ??= p.site.defaultLocale
	const yt = dryRun ? null : ytClient(env, fetch, log)
	const piece = youtubePiece(p, slug, locale)
	if (update) return updateYoutube(p, slug, yt, piece, { update, dryRun, descriptionMode, locale, log })
	return uploadYoutube(p, slug, yt, piece, { privacy, forceNew, dryRun, locale, log })
}

/** Public URLs Meta can fetch: the flags, else the files staged on the desk and signed for an hour. */
async function reelUrls(p, slug, f, { videoUrl, coverUrl, env, fetch, now }) {
	if (videoUrl && coverUrl) return [videoUrl, coverUrl]
	need(env, 'STAGER_CLIENT_ID', 'STAGER_CLIENT_SECRET', 'MEDIA_URL_SECRET')
	if (!f.coverTall) die(`${slug}: no 9:16 cover; run \`emaki render ${slug}\` first`)
	const desk = deskClient(p, { env, fetch }), urls = []
	for (const [key, file, type] of [[`${slug}/${basename(f.tall)}`, f.tall, 'video/mp4'], [`${slug}/instagram-${basename(f.coverTall)}`, f.coverTall, 'image/jpeg']]) {
		await desk.putMedia(key.toLowerCase(), readFileSync(file), type)
		urls.push(await signMedia(key.toLowerCase(), env.MEDIA_URL_SECRET, desk.origin, 3600, now(), env.MEDIA_PATH || '/m'))
	}
	return urls
}

async function publishInstagram(p, slug, { locale, verify, dryRun, videoUrl, coverUrl, env = process.env, fetch = globalThis.fetch, log = console.info, length = mediaLength, sleep, now = Date.now } = {}) {
	const client = () => {
		need(env, 'IG_USER_ID', 'IG_ACCESS_TOKEN')
		return instagram({ userId: env.IG_USER_ID, token: env.IG_ACCESS_TOKEN, version: env.IG_GRAPH_VERSION || 'v21.0', fetch, ...(sleep ? { sleep } : {}) })
	}
	if (verify) return log(`Instagram posts as: @${await client().verify()}`)
	if (Boolean(videoUrl) !== Boolean(coverUrl)) die('pass both --video-url and --cover-url, or neither (to stage them on the desk)')
	locale ??= p.site.defaultLocale
	const ig = dryRun ? null : client()
	const story = storyFor(p, slug, locale), f = filmFiles(p, slug, locale)
	if (!f.tall) die(`${slug}: no built 9:16 video (${p.rel(f.expect.tall)}); render and build the portrait film first`)
	const dur = length(f.tall)
	if (dur > 15 * 60) die(`${slug}: ${Math.round(dur)} s is over the 15-minute Reels limit`)
	const pj = join(p.films, slug, `post.${locale}.json`)
	const staged = exists(pj) ? load(pj).instagram_reel?.caption : null
	const caption = staged || `${story.title}. ${story.dek}\n\nRead the story: ${storyUrl(p, slug, locale)}\n\n${hashtags(story.tags)}`
	log(`Instagram Reel · ${slug} · ${Math.round(dur)} s`)
	log(`  video:   ${basename(f.tall)} (${kb(f.tall)})`)
	log(`  cover:   ${f.coverTall ? basename(f.coverTall) : 'none!'}`)
	log(`  caption: ${caption.length} chars`)
	if (dryRun) return log('dry run: nothing posted'), { dryRun: true }
	const [video, cover] = await reelUrls(p, slug, f, { videoUrl, coverUrl, env, fetch, now })
	const r = await ig.publishReel(video, caption, cover)
	recordLinks(p, slug, { instagram: r.url })
	log(`posted: ${r.url}\nrecorded in ${p.rel(storiesIndex(p))}`)
	return r
}
