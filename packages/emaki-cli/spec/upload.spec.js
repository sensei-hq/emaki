// The upload clients behind `emaki publish`: YouTube Data API (OAuth refresh token) and the Instagram Graph API.
// Ported from films/tools/uploader.py. Every request goes through the injected fetch; these specs assert what is sent.
import { describe, expect, it } from 'vitest'
import { instagram, MotionError, youtube } from '../src/api.js'
import { fakeFetch, logger, SECRETS } from './helpers.js'

const YT = { clientId: 'yt-client', clientSecret: 'yt-secret-zzz', refreshToken: 'yt-refresh-zzz' }
const route = (table) => (c) => {
	for (const [match, res] of table) if (c.url.includes(match) && (!res.method || res.method === c.method)) return typeof res.reply === 'function' ? res.reply(c) : res.reply
	return { status: 500, body: `unexpected ${c.method} ${c.url}` }
}
const TOKEN = ['oauth2.googleapis.com/token', { reply: { json: { access_token: 'acc-1' } } }]
const text = (b) => (Buffer.isBuffer(b) ? b.toString('latin1') : String(b))

describe('youtube', () => {
	it('verify: trades the refresh token for an access token and names the channel (read-only)', async () => {
		const fetch = fakeFetch(route([TOKEN, ['youtube/v3/channels', { reply: { json: { items: [{ snippet: { title: 'Sensei HQ' } }] } } }]]))
		expect(await youtube({ ...YT, fetch }).verify()).toBe('Sensei HQ')
		const [tok, ch] = fetch.calls
		expect(tok).toMatchObject({ method: 'POST', url: 'https://oauth2.googleapis.com/token', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
		expect(Object.fromEntries(new URLSearchParams(tok.body))).toEqual({ client_id: 'yt-client', client_secret: 'yt-secret-zzz', refresh_token: 'yt-refresh-zzz', grant_type: 'refresh_token' })
		expect(ch).toMatchObject({ method: 'GET', url: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', headers: { authorization: 'Bearer acc-1' } })
	})

	it('publish: a resumable upload, then the caption track and the thumbnail', async () => {
		const fetch = fakeFetch(route([
			TOKEN,
			['upload/youtube/v3/videos?uploadType=resumable', { reply: { headers: { location: 'https://upload.example/session-1' } } }],
			['upload.example/session-1', { reply: { json: { id: 'vid123', status: { privacyStatus: 'unlisted' } } } }],
			['upload/youtube/v3/captions', { reply: { json: { id: 'cap1' } } }],
			['thumbnails/set?videoId=vid123', { reply: { json: {} } }]
		]))
		const video = Buffer.from('VIDEO-BYTES'), r = await youtube({ ...YT, fetch, log: logger() }).publish(video, {
			title: 'T'.repeat(120), description: 'Desc', tags: Array.from({ length: 40 }, (_, i) => `t${i}`), privacy: 'unlisted',
			srt: Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHi\n'), thumb: Buffer.from('JPEG'), language: 'es'
		})
		expect(r).toEqual({ id: 'vid123', url: 'https://www.youtube.com/watch?v=vid123', privacy: 'unlisted' })
		expect(fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
			'POST https://oauth2.googleapis.com/token',
			'POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
			'PUT https://upload.example/session-1',
			'POST https://www.googleapis.com/upload/youtube/v3/captions?part=snippet',
			'POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=vid123'
		])
		const [, init, bytes, cap, thumb] = fetch.calls
		expect(init.headers).toMatchObject({ authorization: 'Bearer acc-1', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(video.length) })
		const meta = JSON.parse(init.body)
		expect(meta.snippet.title).toHaveLength(100)
		expect(meta.snippet.tags).toHaveLength(30)
		expect(meta).toMatchObject({ snippet: { description: 'Desc', categoryId: '28' }, status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false } })
		expect(Buffer.compare(bytes.body, video)).toBe(0)
		expect(bytes.headers['content-type']).toBe('video/mp4')
		expect(cap.headers['content-type']).toMatch(/^multipart\/related; boundary=/)
		expect(text(cap.body)).toContain('"snippet":{"videoId":"vid123","language":"es","name":"Spanish"}')
		expect(text(cap.body)).toContain('00:00:00,000 --> 00:00:01,000')
		expect(text(thumb.body)).toContain('Content-Type: image/jpeg')
		expect(text(thumb.body)).toContain('JPEG')
	})

	it('publish: a Short links /shorts/, and a privacy YouTube changed is reported', async () => {
		const log = logger()
		const fetch = fakeFetch(route([
			TOKEN,
			['uploadType=resumable', { reply: { headers: { location: 'https://upload.example/s' } } }],
			['upload.example/s', { reply: { json: { id: 'sh1', status: { privacyStatus: 'private' } } } }]
		]))
		const r = await youtube({ ...YT, fetch, log }).publish(Buffer.from('V'), { title: 'Short', description: '', tags: [], privacy: 'public', short: true })
		expect(r).toEqual({ id: 'sh1', url: 'https://www.youtube.com/shorts/sh1', privacy: 'private' })
		expect(log.text()).toMatch(/YouTube set privacy to "private" instead of "public"/)
	})

	it('update: refreshes metadata in place, replaces our caption tracks (never the automatic ones) and sets the thumbnail', async () => {
		const fetch = fakeFetch(route([
			TOKEN,
			['videos?part=snippet&id=vid9', { method: 'GET', reply: { json: { items: [{ snippet: { title: 'Old', description: 'Old desc', tags: ['x'], categoryId: '27' } }] } } }],
			['youtube/v3/videos?part=snippet', { method: 'PUT', reply: { json: {} } }],
			['captions?part=snippet&videoId=vid9', { method: 'GET', reply: { json: { items: [{ id: 'asr', snippet: { trackKind: 'asr' } }, { id: 'ours', snippet: { trackKind: 'standard' } }] } } }],
			['captions?id=ours', { method: 'DELETE', reply: { body: '' } }],
			['upload/youtube/v3/captions', { reply: { json: {} } }],
			['thumbnails/set?videoId=vid9', { reply: { json: {} } }]
		]))
		const yt = youtube({ ...YT, fetch })
		await yt.updateMetadata('vid9', { title: 'New', description: 'New desc' })
		await yt.replaceCaptions('vid9', Buffer.from('SRT'))
		await yt.setThumbnail('vid9', Buffer.from('JPEG'))
		const put = fetch.calls.find((c) => c.method === 'PUT')
		expect(JSON.parse(put.body)).toEqual({ id: 'vid9', snippet: { title: 'New', description: 'New desc', tags: ['x'], categoryId: '27' } })
		expect(fetch.calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['https://www.googleapis.com/youtube/v3/captions?id=ours'])
		expect(fetch.calls.filter((c) => c.url.includes('oauth2')).length).toBe(1) // one access token per client
	})

	it('a refused request stops with the API status and message, and no secret', async () => {
		const fetch = fakeFetch(route([['oauth2.googleapis.com/token', { reply: { status: 400, json: { error: 'invalid_grant' } } }]]))
		const err = await youtube({ ...YT, fetch }).verify().catch((e) => e)
		expect(err).toBeInstanceOf(MotionError)
		expect(err.message).toMatch(/POST https:\/\/oauth2\.googleapis\.com\/token → 400: .*invalid_grant/)
		for (const s of SECRETS) expect(err.message).not.toContain(s)
	})
})

describe('instagram', () => {
	const IG = { userId: '1789', token: 'ig-token-zzz' }
	it('verify: names the account the token posts as (read-only)', async () => {
		const fetch = fakeFetch(() => ({ json: { username: 'sensei.hq', id: '1789' } }))
		expect(await instagram({ ...IG, fetch }).verify()).toBe('sensei.hq')
		const u = new URL(fetch.calls[0].url)
		expect(fetch.calls[0].method).toBe('GET')
		expect(u.origin + u.pathname).toBe('https://graph.facebook.com/v21.0/1789')
		expect(Object.fromEntries(u.searchParams)).toEqual({ fields: 'username', access_token: 'ig-token-zzz' })
	})

	it('publishReel: a REELS container, waits until it is FINISHED, publishes, returns the permalink', async () => {
		let polls = 0
		const fetch = fakeFetch((c) => {
			if (c.method === 'POST' && c.url.endsWith('/1789/media')) return { json: { id: 'cont1' } }
			if (c.method === 'GET' && c.url.includes('/cont1?')) return { json: { status_code: ++polls < 3 ? 'IN_PROGRESS' : 'FINISHED' } }
			if (c.method === 'POST' && c.url.endsWith('/1789/media_publish')) return { json: { id: 'media9' } }
			if (c.method === 'GET' && c.url.includes('/media9?')) return { json: { permalink: 'https://www.instagram.com/reel/abc/' } }
			return { status: 500 }
		})
		const sleeps = []
		const r = await instagram({ ...IG, version: 'v22.0', fetch, sleep: async (ms) => sleeps.push(ms) }).publishReel('https://desk.example/m/demo/v.mp4?exp=1&sig=2', 'Caption', 'https://desk.example/m/demo/c.jpg?exp=1&sig=3')
		expect(r).toEqual({ url: 'https://www.instagram.com/reel/abc/', id: 'media9' })
		const create = fetch.calls[0]
		expect(create.url).toBe('https://graph.facebook.com/v22.0/1789/media')
		expect(create.headers['content-type']).toBe('application/x-www-form-urlencoded')
		expect(Object.fromEntries(new URLSearchParams(create.body))).toEqual({
			media_type: 'REELS', video_url: 'https://desk.example/m/demo/v.mp4?exp=1&sig=2', caption: 'Caption', share_to_feed: 'true',
			cover_url: 'https://desk.example/m/demo/c.jpg?exp=1&sig=3', access_token: 'ig-token-zzz'
		})
		expect(sleeps).toEqual([10000, 10000])
		expect(Object.fromEntries(new URLSearchParams(fetch.calls.find((c) => c.url.endsWith('media_publish')).body))).toEqual({ creation_id: 'cont1', access_token: 'ig-token-zzz' })
	})

	it('stops when Instagram cannot process the media, or takes too long', async () => {
		const failing = fakeFetch((c) => (c.method === 'POST' ? { json: { id: 'c' } } : { json: { status_code: 'ERROR' } }))
		await expect(instagram({ ...IG, fetch: failing, sleep: async () => {} }).publishReel('u', 'c')).rejects.toThrow(/could not process the media \(ERROR\)/)
		const slow = fakeFetch((c) => (c.method === 'POST' ? { json: { id: 'c' } } : { json: { status_code: 'IN_PROGRESS' } }))
		await expect(instagram({ ...IG, fetch: slow, sleep: async () => {}, tries: 3 }).publishReel('u', 'c')).rejects.toThrow(/took too long/)
		expect(slow.calls.filter((c) => c.method === 'POST')).toHaveLength(1) // never published
	})

	it('a refused request names the path, never the token in its query', async () => {
		const fetch = fakeFetch(() => ({ status: 400, json: { error: { message: 'Invalid OAuth access token.' } } }))
		const err = await instagram({ ...IG, fetch }).verify().catch((e) => e)
		expect(err.message).toMatch(/GET https:\/\/graph\.facebook\.com\/v21\.0\/1789 → 400: .*Invalid OAuth/)
		expect(err.message).not.toContain('ig-token-zzz')
	})
})
