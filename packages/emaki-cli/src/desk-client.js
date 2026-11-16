// The posting desk as the producing machine sees it: the HTTP contract of @senseihq/emaki-posting's createDesk
// (media/<key> PUT, stage, production, requests), called with the stager's Cloudflare Access service token.
//   ADMIN_ORIGIN (default: content/site.json url), ADMIN_API (default /api/admin),
//   STAGER_CLIENT_ID, STAGER_CLIENT_SECRET.
import { createHash } from 'node:crypto'
import { validKey } from '@senseihq/emaki-posting'
import { callJson, need } from './http.js'
import { die } from './util.js'

export const deskOrigin = (p, env) => (env.ADMIN_ORIGIN || p.site.url || '').replace(/\/$/, '')

export function deskClient(p, { env = process.env, fetch = globalThis.fetch } = {}) {
	need(env, 'STAGER_CLIENT_ID', 'STAGER_CLIENT_SECRET')
	const origin = deskOrigin(p, env)
	if (!origin) die('no desk origin: set ADMIN_ORIGIN, or "url" in content/site.json')
	const api = origin + (env.ADMIN_API || '/api/admin').replace(/\/$/, '')
	const auth = { 'CF-Access-Client-Id': env.STAGER_CLIENT_ID, 'CF-Access-Client-Secret': env.STAGER_CLIENT_SECRET }
	const post = (path, data) => callJson(fetch, 'POST', api + path, { body: JSON.stringify(data), headers: { ...auth, 'content-type': 'application/json' } })
	return {
		origin,
		/** Uploads one file to the desk's media store; the desk checks the sha256. */
		async putMedia(key, bytes, type) {
			if (!validKey(key)) die(`bad media key "${key}": <slug>/<file>, lower-case letters, digits, . _ -`)
			const sha256 = createHash('sha256').update(bytes).digest('hex')
			await callJson(fetch, 'PUT', `${api}/media/${key}`, { body: bytes, headers: { ...auth, 'x-content-sha256': sha256, 'content-type': type } })
			return sha256
		},
		/** Stages one channel's post (media already uploaded); returns { content_sha }. */
		stage: (slug, channel, postBody) => post('/stage', { slug, channel, post: postBody }),
		/** Reports scripts and production status for the desk's plan; returns { saved }. */
		production: (items) => post('/production', { items }),
		/** The open requests from the desk, each with its thread. */
		requests: async () => (await callJson(fetch, 'GET', api + '/requests', { headers: auth })).requests ?? [],
		/** Answers a request, optionally moving it to working or done. */
		reply: (id, reply, status) => post('/requests', { id, reply, ...(status ? { status } : {}) })
	}
}
