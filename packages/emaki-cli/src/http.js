// HTTP for the media pipeline (stage, publish): one injectable fetch, and failures as MotionErrors that name the
// method, the URL without its query (where tokens travel) and the response status and text. Credentials go in headers
// or bodies, never into a message.
import { die } from './util.js'

const bare = (url) => String(url).split('?')[0]

/** Sends one request; a non-2xx answer or a network error stops the run. Returns the Response. */
export async function call(fetchFn, method, url, { body, headers = {} } = {}) {
	let r
	try {
		r = await fetchFn(url, { method, body, headers })
	} catch (e) {
		die(`${method} ${bare(url)}: ${e instanceof Error ? e.message : e}`)
	}
	if (!r.ok) die(`${method} ${bare(url)} → ${r.status}: ${(await r.text()).slice(0, 400)}`)
	return r
}

/** call() and parse the JSON answer ({} for an empty body). */
export async function callJson(fetchFn, method, url, opts) {
	const text = await (await call(fetchFn, method, url, opts)).text()
	return text ? JSON.parse(text) : {}
}

/** Dies naming every missing variable: credentials come from the environment (or CI secrets) only. */
export function need(env, ...names) {
	const missing = names.filter((n) => !env[n])
	if (missing.length) die(`missing ${missing.join(', ')}: set them in the environment (or CI secrets), never in emaki.config.json`)
}
