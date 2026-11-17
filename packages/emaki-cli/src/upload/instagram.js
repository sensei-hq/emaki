// Instagram Graph API (instagram_content_publish): verify the account, and post a Reel from a public video URL
// (Meta fetches the media itself): create the container, wait until it is processed, publish, read the permalink.
import { callJson } from '../http.js'
import { die } from '../util.js'

export function instagram({ userId, token, version = 'v21.0', fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tries = 60 }) {
	const base = `https://graph.facebook.com/${version}`
	const graph = (method, path, params = {}) => {
		const q = new URLSearchParams({ ...params, access_token: token }).toString()
		return method === 'GET'
			? callJson(fetch, 'GET', `${base}/${path}?${q}`)
			: callJson(fetch, method, `${base}/${path}`, { body: q, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
	}
	return {
		/** The account this token posts as (read-only). */
		async verify() {
			return (await graph('GET', String(userId), { fields: 'username' })).username ?? String(userId)
		},
		/** Posts a Reel; returns { url (permalink), id }. */
		async publishReel(videoUrl, caption, coverUrl, { shareToFeed = true } = {}) {
			const params = { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: shareToFeed ? 'true' : 'false', ...(coverUrl ? { cover_url: coverUrl } : {}) }
			const container = (await graph('POST', `${userId}/media`, params)).id
			for (let i = 0; ; i++) {
				const st = (await graph('GET', container, { fields: 'status_code' })).status_code
				if (st === 'FINISHED') break
				if (st === 'ERROR' || st === 'EXPIRED') die(`Instagram could not process the media (${st})`)
				if (i + 1 >= tries) die('Instagram took too long to process the media')
				await sleep(10000)
			}
			const id = (await graph('POST', `${userId}/media_publish`, { creation_id: container })).id
			return { url: (await graph('GET', id, { fields: 'permalink' })).permalink ?? null, id }
		}
	}
}
