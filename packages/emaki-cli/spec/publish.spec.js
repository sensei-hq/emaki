// emaki publish youtube|instagram <slug>: post a finished, checked film straight to a platform (no desk approval),
// then write the link into the story's index entry. Ported from films/tools/publish.py.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chapters, mergeDescription, MotionError, project as load, publish } from '../src/api.js'
import { ENV, fakeFetch, json, logger, project, put, SECRETS } from './helpers.js'

const index = (d) => json(join(d, 'content/stories/index.json'))[0]
const lines = (f) => f.calls.map((c) => `${c.method} ${c.url.split('?')[0]}`)

function ytApi({ id = 'vid123', remote } = {}) {
	return fakeFetch((c) => {
		if (c.url.startsWith('https://oauth2.googleapis.com/token')) return { json: { access_token: 'acc' } }
		if (c.url.includes('/channels?')) return { json: { items: [{ snippet: { title: 'Sensei HQ' } }] } }
		if (c.url.includes('uploadType=resumable')) return { headers: { location: 'https://upload.example/s1' } }
		if (c.url === 'https://upload.example/s1') return { json: { id, status: { privacyStatus: 'unlisted' } } }
		if (c.method === 'GET' && c.url.includes('/videos?')) return { json: { items: [{ snippet: remote ?? { title: 'Old', description: 'Old text.', tags: [], categoryId: '28' } }] } }
		if (c.method === 'GET' && c.url.includes('/captions?')) return { json: { items: [] } }
		return { json: {} }
	})
}

describe('chapters and descriptions', () => {
	it('chapters start at 0:00 and last at least 10 s; short scenes fold into the chapter they start', () => {
		expect(chapters([{ name: 'Hook', at: 0, dur: 12 }, { name: 'Close', at: 12, dur: 18 }])).toEqual([[0, 'Hook'], [12, 'Close']])
		expect(chapters([{ name: 'A', at: 0, dur: 4 }, { name: 'B', at: 4, dur: 7 }, { name: 'C', at: 11, dur: 30 }, { name: 'D', at: 41, dur: 3 }]))
			.toEqual([[0, 'A + B'], [11, 'C + D']])
	})
	it('an update puts our text first and never stacks it twice', () => {
		const once = mergeDescription('Their notes.', 'Ours.\n', 'prepend')
		expect(once).toBe('Ours.\n\n---\n\nTheir notes.\n')
		expect(mergeDescription(once, 'Ours.\n', 'prepend')).toBe(once)
		expect(mergeDescription('Their notes.', 'Ours.', 'replace')).toBe('Ours.')
	})
})

describe('publish youtube', () => {
	it('--dry-run prints exactly what would post and sends nothing (no credentials needed)', async () => {
		const d = project(), fetch = ytApi(), log = logger()
		const r = await publish(load(d), 'youtube', 'demo', { dryRun: true, env: {}, fetch, log })
		expect(fetch.calls).toEqual([])
		expect(r).toMatchObject({ dryRun: true })
		expect(log.text()).toMatch(/YouTube · Demo story · privacy unlisted/)
		expect(log.text()).toMatch(/video: +demo-en-16x9\.mp4/)
		expect(log.text()).toMatch(/2 chapters/)
		expect(log.text()).toMatch(/captions: demo-en\.srt/)
		expect(log.text()).toMatch(/thumb: +demo-en-cover-16x9\.jpg/)
		expect(log.text()).toMatch(/dry run: nothing posted/)
		expect(index(d).youtube).toBeUndefined()
	})

	it('--verify checks the credentials read-only and names the channel', async () => {
		const fetch = ytApi(), log = logger()
		await publish(load(project()), 'youtube', undefined, { verify: true, env: ENV, fetch, log })
		expect(lines(fetch)).toEqual(['POST https://oauth2.googleapis.com/token', 'GET https://www.googleapis.com/youtube/v3/channels'])
		expect(log.text()).toBe('YouTube posts as: Sensei HQ')
	})

	it('uploads the 16:9 film with description, tags, captions and thumbnail, then records the link', async () => {
		const d = project(), fetch = ytApi(), log = logger()
		await publish(load(d), 'youtube', 'demo', { env: ENV, fetch, log })
		expect(lines(fetch)).toEqual([
			'POST https://oauth2.googleapis.com/token',
			'POST https://www.googleapis.com/upload/youtube/v3/videos',
			'PUT https://upload.example/s1',
			'POST https://www.googleapis.com/upload/youtube/v3/captions',
			'POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set'
		])
		const meta = JSON.parse(fetch.calls[1].body)
		expect(meta.snippet).toMatchObject({ title: 'Demo story', tags: ['data-quality', 'ai', 'metrics'] })
		expect(meta.snippet.description).toBe('Demo story\n\n0:00 Hook\n0:12 Close\n\nhttps://site.example/articles/demo\n')
		expect(meta.status.privacyStatus).toBe('unlisted')
		expect(Buffer.compare(fetch.calls[2].body, readFileSync(join(d, 'production/demo/en/out/demo-en-16x9.mp4')))).toBe(0)
		expect(index(d)).toMatchObject({ youtube: 'vid123', social: { youtube: 'https://www.youtube.com/watch?v=vid123' } })
		expect(log.text()).toMatch(/posted: https:\/\/www\.youtube\.com\/watch\?v=vid123\nrecorded in content\/stories\/index\.json/)
		for (const s of SECRETS) expect(log.text()).not.toContain(s)
	})

	it('a built description.txt wins; --privacy public goes live', async () => {
		const d = project(), fetch = ytApi()
		put(d, 'production/demo/en/out/description.txt', 'Hand-written.\n')
		await publish(load(d), 'youtube', 'demo', { privacy: 'public', env: ENV, fetch, log: logger() })
		const meta = JSON.parse(fetch.calls[1].body)
		expect(meta.snippet.description).toBe('Hand-written.\n')
		expect(meta.status.privacyStatus).toBe('public')
		await expect(publish(load(d), 'youtube', 'demo', { privacy: 'secret', dryRun: true, env: {}, log: logger() })).rejects.toThrow(/--privacy: public, unlisted or private/)
	})

	it('refuses a second upload of a film already on YouTube, unless --force-new', async () => {
		const d = project()
		put(d, 'content/stories/index.json', [{ slug: 'demo', publish_date: '2026-11-16', tags: [], youtube: 'old1' }])
		const fetch = ytApi()
		await expect(publish(load(d), 'youtube', 'demo', { env: ENV, fetch, log: logger() })).rejects.toThrow(/already on YouTube as old1; pass --update old1/)
		expect(fetch.calls).toEqual([])
		await publish(load(d), 'youtube', 'demo', { forceNew: true, env: ENV, fetch, log: logger() })
		expect(index(d).youtube).toBe('old1') // a recorded id is never overwritten
	})

	it('--update refreshes an uploaded video in place: metadata, captions, thumbnail; no re-upload', async () => {
		const d = project(), fetch = ytApi({ remote: { title: 'Old', description: 'Their notes.', tags: ['x'], categoryId: '28' } })
		await publish(load(d), 'youtube', 'demo', { update: 'vid9', env: ENV, fetch, log: logger() })
		expect(fetch.calls.some((c) => c.url.includes('uploadType=resumable'))).toBe(false)
		const putMeta = JSON.parse(fetch.calls.find((c) => c.method === 'PUT').body)
		expect(putMeta.id).toBe('vid9')
		expect(putMeta.snippet.title).toBe('Demo story')
		expect(putMeta.snippet.description).toMatch(/^Demo story\n\n0:00 Hook[\s\S]*\n\n---\n\nTheir notes\.\n$/)
		expect(fetch.calls.some((c) => c.url.includes('/captions?part=snippet') && c.method === 'POST')).toBe(true)
		expect(fetch.calls.some((c) => c.url.includes('thumbnails/set?videoId=vid9'))).toBe(true)
		expect(index(d).youtube).toBe('vid9')
	})

	it('without credentials it names the variables and sends nothing; without a build it says what to run', async () => {
		const fetch = ytApi()
		await expect(publish(load(project()), 'youtube', 'demo', { env: {}, fetch, log: logger() })).rejects.toThrow(/missing YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN/)
		await expect(publish(load(project({ built: false })), 'youtube', 'demo', { dryRun: true, env: {}, log: logger() })).rejects.toThrow(/no built 16:9 video .*emaki build demo/)
		expect(fetch.calls).toEqual([])
	})
})

describe('publish instagram', () => {
	const igApi = () => fakeFetch((c) => {
		if (c.url.startsWith('https://desk.example/api/admin/media/')) return { json: { ok: true } }
		if (c.method === 'POST' && c.url.endsWith('/1789/media')) return { json: { id: 'cont' } }
		if (c.url.includes('/cont?')) return { json: { status_code: 'FINISHED' } }
		if (c.url.endsWith('/media_publish')) return { json: { id: 'm1' } }
		if (c.url.includes('/m1?')) return { json: { permalink: 'https://www.instagram.com/reel/xyz/' } }
		if (c.url.includes('/1789?')) return { json: { username: 'sensei.hq' } }
		return { status: 500 }
	})
	const NOW = 1_800_000_000_000
	const sign = (key, exp) => createHmac('sha256', ENV.MEDIA_URL_SECRET).update(`${key}:${exp}`).digest('hex')

	it('--dry-run prints the Reel and sends nothing', async () => {
		const fetch = igApi(), log = logger()
		await publish(load(project()), 'instagram', 'demo', { dryRun: true, env: {}, fetch, log, length: () => 42 })
		expect(fetch.calls).toEqual([])
		expect(log.text()).toMatch(/Instagram Reel · demo · 42 s/)
		expect(log.text()).toMatch(/cover: +demo-en-cover-9x16\.jpg/)
		expect(log.text()).toMatch(/dry run: nothing posted/)
	})

	it('--verify names the account', async () => {
		const fetch = igApi(), log = logger()
		await publish(load(project()), 'instagram', undefined, { verify: true, env: ENV, fetch, log })
		expect(log.text()).toBe('Instagram posts as: @sensei.hq')
		expect(fetch.calls).toHaveLength(1)
	})

	it('uploads the Reel and cover to the desk, signs one-hour links for Meta, posts, and records the permalink', async () => {
		const d = project(), fetch = igApi(), log = logger()
		await publish(load(d), 'instagram', 'demo', { env: ENV, fetch, log, length: () => 42, sleep: async () => {}, now: () => NOW })
		expect(lines(fetch).slice(0, 3)).toEqual([
			'PUT https://desk.example/api/admin/media/demo/demo-en-9x16.mp4',
			'PUT https://desk.example/api/admin/media/demo/instagram-demo-en-cover-9x16.jpg',
			'POST https://graph.facebook.com/v21.0/1789/media'
		])
		expect(fetch.calls[0].headers['cf-access-client-id']).toBe('stager-id.access')
		const exp = NOW / 1000 + 3600
		const params = Object.fromEntries(new URLSearchParams(fetch.calls[2].body))
		expect(params.video_url).toBe(`https://desk.example/m/demo/demo-en-9x16.mp4?exp=${exp}&sig=${sign('demo/demo-en-9x16.mp4', exp)}`)
		expect(params.cover_url).toBe(`https://desk.example/m/demo/instagram-demo-en-cover-9x16.jpg?exp=${exp}&sig=${sign('demo/instagram-demo-en-cover-9x16.jpg', exp)}`)
		expect(params.caption).toBe('Demo story. What the reader gets.\n\nRead the story: https://site.example/articles/demo\n\n#dataquality #ai #metrics')
		expect(index(d).social.instagram).toBe('https://www.instagram.com/reel/xyz/')
		for (const s of SECRETS) expect(log.text()).not.toContain(s)
	})

	it('a staged caption (post.<locale>.json) wins; an existing link is never overwritten', async () => {
		const d = project(), fetch = igApi()
		put(d, 'content/films/demo/post.en.json', { instagram_reel: { caption: 'Staged caption.' } })
		put(d, 'content/stories/index.json', [{ slug: 'demo', publish_date: '2026-11-16', tags: [], social: { instagram: 'https://www.instagram.com/reel/old/' } }])
		await publish(load(d), 'instagram', 'demo', { videoUrl: 'https://cdn.example/v.mp4', coverUrl: 'https://cdn.example/c.jpg', env: { IG_USER_ID: '1789', IG_ACCESS_TOKEN: 'ig-token-zzz' }, fetch, log: logger(), length: () => 42, sleep: async () => {} })
		expect(fetch.calls.some((c) => c.url.includes('desk.example'))).toBe(false)
		const params = Object.fromEntries(new URLSearchParams(fetch.calls[0].body))
		expect(params).toMatchObject({ caption: 'Staged caption.', video_url: 'https://cdn.example/v.mp4', cover_url: 'https://cdn.example/c.jpg' })
		expect(index(d).social.instagram).toBe('https://www.instagram.com/reel/old/')
	})

	it('refuses half the URL pair, a Reel over 15 minutes, and missing staging credentials, before posting', async () => {
		const fetch = igApi(), igEnv = { IG_USER_ID: '1789', IG_ACCESS_TOKEN: 'ig-token-zzz' }
		await expect(publish(load(project()), 'instagram', 'demo', { videoUrl: 'https://x/v.mp4', env: igEnv, fetch, log: logger(), length: () => 42 })).rejects.toThrow(/both --video-url and --cover-url, or neither/)
		await expect(publish(load(project()), 'instagram', 'demo', { env: igEnv, fetch, log: logger(), length: () => 901 })).rejects.toThrow(/901 s is over the 15-minute Reels limit/)
		await expect(publish(load(project()), 'instagram', 'demo', { env: igEnv, fetch, log: logger(), length: () => 42 })).rejects.toThrow(/STAGER_CLIENT_ID, STAGER_CLIENT_SECRET, MEDIA_URL_SECRET/)
		await expect(publish(load(project()), 'instagram', 'demo', { env: {}, fetch, log: logger(), length: () => 42 })).rejects.toThrow(/missing IG_USER_ID, IG_ACCESS_TOKEN/)
		expect(fetch.calls).toEqual([])
	})

	it('an unknown channel is refused', async () => {
		await expect(publish(load(project()), 'tiktok', 'demo', { dryRun: true, env: {}, log: logger() })).rejects.toThrow(MotionError)
	})
})
