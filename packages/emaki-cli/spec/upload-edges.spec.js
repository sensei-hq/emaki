// The upload clients where the platform answers with less than usual: no username or permalink, no channel or video,
// a video whose snippet lacks fields, caption tracks without a kind, no upload session, no privacy in the answer;
// plus a Reel posted without a cover or to the feed, the default ten-second wait between processing checks, and a
// caption language Intl cannot name.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instagram, youtube } from '../src/api.js'
import { fakeFetch, logger } from './helpers.js'

afterEach(() => vi.useRealTimers())

const YT = { clientId: 'yt-client', clientSecret: 'yt-secret-zzz', refreshToken: 'yt-refresh-zzz' }
/** A YouTube API that hands out a token and answers the rest from `reply(call)`. */
const ytFetch = (reply) => fakeFetch((c) => (c.url.startsWith('https://oauth2.googleapis.com/token') ? { json: { access_token: 'acc' } } : reply(c)))
const multipartJson = (body) => JSON.parse(body.toString('utf-8').split('\r\n\r\n')[1].split('\r\n')[0])

describe('youtube, answered sparsely', () => {
	it('refuses a credential with no channel, and a video id the channel does not have', async () => {
		const yt = youtube({ ...YT, fetch: ytFetch(() => ({ json: {} })) })
		await expect(yt.verify()).rejects.toThrow(/this YouTube credential has no channel/)
		await expect(yt.getVideo('v1')).rejects.toThrow(/no YouTube video v1 on this channel/)
		await expect(yt.updateMetadata('v1', { title: 'T' })).rejects.toThrow(/no YouTube video v1 on this channel/)
	})

	it('keeps every remote field an update leaves out, and defaults the ones the video lacks', async () => {
		for (const [cur, want] of [
			[{ title: 'Old', description: 'D', tags: ['a'], categoryId: '22' }, { title: 'Old', description: 'D', tags: ['a'], categoryId: '22' }],
			[{ title: 'Old' }, { title: 'Old', description: '', tags: [], categoryId: '28' }]
		]) {
			const fetch = ytFetch((c) => (c.method === 'GET' ? { json: { items: [{ snippet: cur }] } } : { json: {} }))
			await youtube({ ...YT, fetch }).updateMetadata('v1')
			expect(JSON.parse(fetch.calls.find((c) => c.method === 'PUT').body)).toEqual({ id: 'v1', snippet: want })
		}
	})

	it('deletes caption tracks without a kind, reads no list as no tracks, and names a language code Intl cannot', async () => {
		let tracks = { items: [{ id: 'c1' }, { id: 'c2', snippet: { trackKind: 'asr' } }] }
		const fetch = ytFetch((c) => (c.method === 'GET' ? { json: tracks } : { json: {} }))
		await youtube({ ...YT, fetch }).replaceCaptions('v1', Buffer.from('srt'), 'x!')
		expect(fetch.calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['https://www.googleapis.com/youtube/v3/captions?id=c1'])
		expect(multipartJson(fetch.calls.at(-1).body).snippet).toEqual({ videoId: 'v1', language: 'x!', name: 'x!' })
		tracks = {}
		fetch.calls.length = 0
		await youtube({ ...YT, fetch }).replaceCaptions('v1', Buffer.from('srt'))
		expect(fetch.calls.map((c) => c.method)).toEqual(['POST', 'GET', 'POST'])
		expect(multipartJson(fetch.calls.at(-1).body).snippet).toEqual({ videoId: 'v1', language: 'en', name: 'English' })
	})

	it('stops when the upload gets no session, and takes the asked privacy when the answer names none', async () => {
		const none = ytFetch(() => ({ json: {} }))
		await expect(youtube({ ...YT, fetch: none, log: logger() }).publish(Buffer.from('v'), { title: 'T' })).rejects.toThrow(/no Location header/)
		const log = logger()
		const fetch = ytFetch((c) => (c.url.includes('uploadType=resumable') ? { headers: { location: 'https://upload.example/s' } } : { json: { id: 'v2' } }))
		expect(await youtube({ ...YT, fetch, log }).publish(Buffer.from('v'), { title: 'T', privacy: 'private' })).toEqual({ id: 'v2', url: 'https://www.youtube.com/watch?v=v2', privacy: 'private' })
		expect(log.lines).toEqual([])
	})
})

const IG = { userId: '1789', token: 'ig-token-zzz' }

describe('instagram, answered sparsely', () => {
	it('names the account by its id when the answer has no username', async () => {
		expect(await instagram({ ...IG, fetch: fakeFetch(() => ({ json: {} })) }).verify()).toBe('1789')
	})

	it('posts a Reel without a cover and off the feed, waits ten seconds between checks, and returns no permalink when none is given', async () => {
		vi.useFakeTimers()
		let checks = 0
		const fetch = fakeFetch((c) => {
			if (c.url.endsWith('/1789/media')) return { json: { id: 'cont' } }
			if (c.url.includes('/cont?')) return { json: { status_code: ++checks < 2 ? 'IN_PROGRESS' : 'FINISHED' } }
			if (c.url.endsWith('/media_publish')) return { json: { id: 'm1' } }
			return { json: {} }
		})
		const posting = instagram({ ...IG, fetch }).publishReel('https://cdn.example/v.mp4', 'Hi', undefined, { shareToFeed: false })
		await vi.advanceTimersByTimeAsync(9999)
		expect(checks).toBe(1)
		await vi.advanceTimersByTimeAsync(1)
		expect(await posting).toEqual({ url: null, id: 'm1' })
		expect(checks).toBe(2)
		const params = Object.fromEntries(new URLSearchParams(fetch.calls[0].body))
		expect(params).toEqual({ media_type: 'REELS', video_url: 'https://cdn.example/v.mp4', caption: 'Hi', share_to_feed: 'false', access_token: 'ig-token-zzz' })
	})
})
