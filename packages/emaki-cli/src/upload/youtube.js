// YouTube Data API v3 with an OAuth refresh token (scopes youtube.upload + youtube.force-ssl): verify the channel,
// upload a video (resumable) with its caption track and custom thumbnail, and refresh an uploaded video in place.
import { randomBytes } from 'node:crypto'
import { call, callJson } from '../http.js'
import { die } from '../util.js'

const API = 'https://www.googleapis.com/youtube/v3', UPLOAD = 'https://www.googleapis.com/upload/youtube/v3'

/** multipart/related body from [contentType, bytes | string] parts. */
function multipart(parts) {
	const boundary = 'emaki' + randomBytes(8).toString('hex')
	const chunks = parts.flatMap(([type, data]) => [Buffer.from(`--${boundary}\r\nContent-Type: ${type}\r\n\r\n`), Buffer.from(data), Buffer.from('\r\n')])
	return { body: Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]), type: `multipart/related; boundary=${boundary}` }
}

const languageName = (code) => {
	try {
		return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
	} catch {
		return code
	}
}

export function youtube({ clientId, clientSecret, refreshToken, fetch = globalThis.fetch, log = console.info }) {
	let access
	const token = async () => (access ??= (await callJson(fetch, 'POST', 'https://oauth2.googleapis.com/token', {
		body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString(),
		headers: { 'content-type': 'application/x-www-form-urlencoded' }
	})).access_token)
	const auth = async (extra = {}) => ({ authorization: `Bearer ${await token()}`, ...extra })
	const get = async (url) => callJson(fetch, 'GET', url, { headers: await auth() })

	async function uploadCaption(videoId, srt, language = 'en') {
		const m = multipart([['application/json; charset=UTF-8', JSON.stringify({ snippet: { videoId, language, name: languageName(language) } })], ['application/octet-stream', srt]])
		await callJson(fetch, 'POST', `${UPLOAD}/captions?part=snippet`, { body: m.body, headers: await auth({ 'content-type': m.type }) })
	}
	async function setThumbnail(videoId, jpg) {
		const m = multipart([['image/jpeg', jpg]])
		await callJson(fetch, 'POST', `${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, { body: m.body, headers: await auth({ 'content-type': m.type }) })
	}

	return {
		/** The channel this credential posts as (read-only). */
		async verify() {
			const r = await get(`${API}/channels?part=snippet&mine=true`)
			if (!r.items?.length) die('this YouTube credential has no channel')
			return r.items[0].snippet.title
		},
		async getVideo(id) {
			const r = await get(`${API}/videos?part=snippet,contentDetails,status&id=${encodeURIComponent(id)}`)
			if (!r.items?.length) die(`no YouTube video ${id} on this channel`)
			return r.items[0]
		},
		/** Metadata in place; an omitted field keeps the remote value. The video file itself is never replaced. */
		async updateMetadata(id, { title, description, tags, categoryId } = {}) {
			const r = await get(`${API}/videos?part=snippet&id=${encodeURIComponent(id)}`)
			if (!r.items?.length) die(`no YouTube video ${id} on this channel`)
			const cur = r.items[0].snippet
			const snippet = { title: title ?? cur.title, description: description ?? cur.description ?? '', tags: tags ?? cur.tags ?? [], categoryId: categoryId ?? cur.categoryId ?? '28' }
			await callJson(fetch, 'PUT', `${API}/videos?part=snippet`, { body: JSON.stringify({ id, snippet }), headers: await auth({ 'content-type': 'application/json; charset=UTF-8' }) })
		},
		/** Replaces uploaded caption tracks with ours; automatic (ASR) tracks are left alone. */
		async replaceCaptions(id, srt, language = 'en') {
			const r = await get(`${API}/captions?part=snippet&videoId=${encodeURIComponent(id)}`)
			for (const c of r.items ?? [])
				if (String(c.snippet?.trackKind ?? '').toUpperCase() !== 'ASR') await call(fetch, 'DELETE', `${API}/captions?id=${encodeURIComponent(c.id)}`, { headers: await auth() })
			await uploadCaption(id, srt, language)
		},
		setThumbnail,
		/** Uploads a video; returns { id, url, privacy }. srt and thumb are optional. */
		async publish(video, { title, description = '', tags = [], privacy = 'unlisted', srt, thumb, short = false, categoryId = '28', language = 'en' }) {
			const meta = {
				snippet: { title: title.slice(0, 100), description: description.slice(0, 5000), tags: tags.slice(0, 30), categoryId },
				status: { privacyStatus: privacy, selfDeclaredMadeForKids: false }
			}
			const init = await call(fetch, 'POST', `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
				body: JSON.stringify(meta),
				headers: await auth({ 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(video.length) })
			})
			const session = init.headers.get('location')
			if (!session) die('YouTube did not return an upload session (no Location header)')
			const got = await callJson(fetch, 'PUT', session, { body: video, headers: await auth({ 'content-type': 'video/mp4' }) })
			const id = got.id, set = got.status?.privacyStatus ?? privacy
			if (set !== privacy) log(`warning: YouTube set privacy to "${set}" instead of "${privacy}"`)
			if (srt) await uploadCaption(id, srt, language)
			if (thumb) await setThumbnail(id, thumb)
			return { id, url: short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`, privacy: set }
		}
	}
}
