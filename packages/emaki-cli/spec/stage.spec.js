// emaki stage: upload a finished piece's media and post text to the posting desk (its HTTP contract, stager
// credentials), so a person can approve exactly that. Ported from the website's films/tools/stage.py.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MotionError, project as load, stage } from '../src/api.js'
import { DAY, ENV, fakeFetch, json, logger, project, put, SECRETS, sha } from './helpers.js'

const desk = (fetch) => fetch.calls.map((c) => `${c.method} ${c.url}`)
const staged = (fetch) => fetch.calls.filter((c) => c.url.endsWith('/api/admin/stage')).map((c) => JSON.parse(c.body))
const ok = ({ url }) => (url.endsWith('/stage') ? { json: { ok: true, content_sha: 'c0ffee1234567890' } } : { json: { ok: true } })

/** A film whose post text was written and checked (the first run drafts it). */
function film() {
	const d = project()
	put(d, 'content/films/demo/post.en.json', {
		youtube: { title: 'Demo story', description: 'What the reader gets.', tags: ['ai'], short: false },
		instagram_reel: { caption: 'Demo story. Link in bio.' },
		x: { text: 'Demo story: what the reader gets.', thread: ['Read it: https://site.example/articles/demo'] }
	})
	return d
}

describe('stage: a film', () => {
	it('drafts post.<locale>.json from the story on the first run and stops for a read-through, sending nothing', async () => {
		const d = project(), fetch = fakeFetch()
		await expect(stage(load(d), 'demo', { env: ENV, fetch, log: logger() })).rejects.toThrow(/wrote content\/films\/demo\/post\.en\.json/)
		const draft = json(join(d, 'content/films/demo/post.en.json'))
		expect(draft.youtube).toMatchObject({ title: 'Demo story', tags: ['data-quality', 'ai', 'metrics'], short: false })
		expect(draft.youtube.description).toContain('https://site.example/articles/demo')
		expect(draft.instagram_reel.caption).toMatch(/^Demo story\. What the reader gets\./)
		expect(draft.instagram_reel.caption).toContain('#dataquality #ai #metrics')
		expect(draft.x.text).toBe('Demo story: What the reader gets.')
		expect(draft.x.thread[0]).toContain('https://site.example/articles/demo')
		expect(fetch.calls).toEqual([])
	})

	it('uploads each file once with its sha256, then stages each channel through the desk API', async () => {
		const d = film(), fetch = fakeFetch(ok), log = logger()
		const r = await stage(load(d), 'demo', { env: ENV, fetch, log })
		const wide = readFileSync(join(d, 'production/demo/en/out/demo-en-16x9.mp4'))
		expect(desk(fetch)).toEqual([
			'PUT https://desk.example/api/admin/media/demo/demo-en-16x9.mp4',
			'PUT https://desk.example/api/admin/media/demo/demo-en.srt',
			'PUT https://desk.example/api/admin/media/demo/youtube-demo-en-thumb.jpg',
			'POST https://desk.example/api/admin/stage',
			'PUT https://desk.example/api/admin/media/demo/demo-en-9x16.mp4',
			'PUT https://desk.example/api/admin/media/demo/instagram-demo-en-cover-9x16.jpg',
			'POST https://desk.example/api/admin/stage',
			'POST https://desk.example/api/admin/stage' // x reuses the 16:9 video already uploaded
		])
		const put1 = fetch.calls[0]
		expect(put1.headers).toMatchObject({ 'cf-access-client-id': 'stager-id.access', 'x-content-sha256': sha(wide), 'content-type': 'video/mp4' })
		expect(put1.headers['cf-access-client-secret']).toBe(ENV.STAGER_CLIENT_SECRET)
		expect(Buffer.compare(put1.body, wide)).toBe(0)
		expect(fetch.calls[1].headers['content-type']).toBe('text/plain')
		const [yt, reel, x] = staged(fetch)
		expect(yt).toEqual({
			slug: 'demo', channel: 'youtube',
			post: {
				title: 'Demo story', description: 'What the reader gets.', tags: ['ai'], short: false,
				media: [
					{ key: 'demo/demo-en-16x9.mp4', sha256: sha(wide), type: 'video/mp4' },
					{ key: 'demo/demo-en.srt', sha256: sha(readFileSync(join(d, 'production/demo/en/out/demo-en.srt'))), type: 'text/plain' },
					{ key: 'demo/youtube-demo-en-thumb.jpg', sha256: sha(Buffer.from('THUMB')), type: 'image/jpeg' }
				]
			}
		})
		expect(reel.post).toEqual({ caption: 'Demo story. Link in bio.', media: [
			{ key: 'demo/demo-en-9x16.mp4', sha256: sha(Buffer.from('TALL'.repeat(64))), type: 'video/mp4' },
			{ key: 'demo/instagram-demo-en-cover-9x16.jpg', sha256: sha(Buffer.from('COVER')), type: 'image/jpeg' }
		] })
		expect(x.post.media).toEqual([{ key: 'demo/demo-en-16x9.mp4', sha256: sha(wide), type: 'video/mp4' }])
		expect(r.staged.map((s) => [s.channel, s.content_sha])).toEqual([['youtube', 'c0ffee1234567890'], ['instagram_reel', 'c0ffee1234567890'], ['x', 'c0ffee1234567890']])
		expect(log.text()).toMatch(/youtube: staged \(c0ffee1234\), 3 file\(s\)/)
		for (const s of SECRETS) expect(log.text()).not.toContain(s)
	})

	it('--channels stages only those; a channel whose media is missing is skipped and named', async () => {
		const d = film(), fetch = fakeFetch(ok), log = logger()
		rmSync(join(d, 'production/demo/en/out/demo-en-9x16.mp4'))
		const r = await stage(load(d), 'demo', { channels: ['youtube', 'instagram_reel'], env: ENV, fetch, log })
		expect(staged(fetch).map((s) => s.channel)).toEqual(['youtube'])
		expect(r.skipped).toEqual([{ channel: 'instagram_reel', missing: ['production/demo/en/out/demo-en-9x16.mp4'] }])
		expect(log.text()).toMatch(/instagram_reel: skipped, missing production\/demo\/en\/out\/demo-en-9x16\.mp4/)
	})

	it('a channel the project does not know is refused before anything is sent', async () => {
		const fetch = fakeFetch(ok)
		await expect(stage(load(film()), 'demo', { channels: ['tiktok'], env: ENV, fetch, log: logger() })).rejects.toThrow(/unknown channel "tiktok"/)
		expect(fetch.calls).toEqual([])
	})
})

describe('stage: a campaign day', () => {
	function day() {
		const d = project()
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		for (const n of ['01', '02', '03']) put(d, `films/campaign/carousels/demo/slide-${n}.png`, `PNG${n}`)
		return d
	}
	const toJpeg = (png) => { const out = png.replace(/\.png$/, '.jpg'); writeFileSync(out, readFileSync(png, 'utf-8').replace('PNG', 'JPG')); return out }

	it('takes every channel\'s text from the day script and the 9:16 film as the Short', async () => {
		const d = day(), fetch = fakeFetch(ok)
		await stage(load(d), 'demo', { env: ENV, fetch, log: logger(), toJpeg })
		const posts = Object.fromEntries(staged(fetch).map((s) => [s.channel, s.post]))
		const tall = { key: 'demo/demo-en-9x16.mp4', sha256: sha(Buffer.from('TALL'.repeat(64))), type: 'video/mp4' }
		expect(posts.youtube).toEqual({
			title: 'Your database deserves version control too #DBD #shorts',
			description: "Code lives in git. The schema often lives in someone's head.\n\nRead the full explainer: https://site.example/articles/demo\n#database #postgres",
			tags: ['database', 'postgres'], short: true, media: [tall]
		})
		expect(posts.instagram_reel).toEqual({ caption: 'Your app code is versioned. Is your schema?\n\n#database #postgres', media: [tall] })
		expect(posts.instagram_carousel.media).toEqual(['01', '02', '03'].map((n) => ({ key: `demo/instagram-slide-${n}.jpg`, sha256: sha(`JPG${n}`), type: 'image/jpeg' })))
		expect(posts.x).toEqual({ text: 'Your code is in git. Your schema is a console session?', thread: ['Schema as code: every table is a file.', 'Full explainer: https://site.example/articles/demo'], media: [tall] })
		expect(fetch.calls.filter((c) => c.method === 'PUT' && c.url.endsWith('demo-en-9x16.mp4'))).toHaveLength(1)
	})

	it('reads the plugin template\'s labels too (Title, Description under "## 2 · YouTube")', async () => {
		const d = day()
		put(d, 'films/campaign/days/day-01-demo.md', DAY.replace('**YouTube title:**', '**Title:**').replace('**YouTube description:**', '**Description:**'))
		const r = await stage(load(d), 'demo', { dryRun: true, env: {}, log: logger(), toJpeg })
		expect(r.posts.youtube.title).toBe('Your database deserves version control too #DBD #shorts')
		expect(r.posts.youtube.description).toMatch(/^Code lives in git\./)
	})
})

describe('stage: safety', () => {
	it('--dry-run sends no request at all, needs no credentials, and shows each post with its media hashes', async () => {
		const fetch = fakeFetch(ok), log = logger()
		const r = await stage(load(film()), 'demo', { dryRun: true, env: {}, fetch, log })
		expect(fetch.calls).toEqual([])
		expect(r.posts.youtube.media[0]).toEqual({ key: 'demo/demo-en-16x9.mp4', sha256: expect.stringMatching(/^[0-9a-f]{64}$/), type: 'video/mp4' })
		expect(log.text()).toMatch(/--- youtube\n\{/)
		expect(r.staged).toEqual([])
	})
	it('without the stager credentials it names the variables and sends nothing', async () => {
		const fetch = fakeFetch(ok)
		await expect(stage(load(film()), 'demo', { env: { ADMIN_ORIGIN: 'https://desk.example' }, fetch, log: logger() }))
			.rejects.toThrow(/STAGER_CLIENT_ID, STAGER_CLIENT_SECRET/)
		expect(fetch.calls).toEqual([])
	})
	it('the desk origin defaults to the site url; ADMIN_API moves the API prefix', async () => {
		const fetch = fakeFetch(ok)
		const { ADMIN_ORIGIN: _, ...env } = ENV
		await stage(load(film()), 'demo', { channels: ['x'], env: { ...env, ADMIN_API: '/desk/api' }, fetch, log: logger() })
		expect(fetch.calls[0].url).toBe('https://site.example/desk/api/media/demo/demo-en-16x9.mp4')
	})
	it('a refusal from the desk stops the run with its status and reason, and no secret in the message', async () => {
		const fetch = fakeFetch(({ url }) => (url.endsWith('/stage') ? { status: 400, json: { ok: false, reason: 'demo/demo-en-16x9.mp4 is not uploaded with that sha256' } } : { json: { ok: true } }))
		const err = await stage(load(film()), 'demo', { channels: ['x'], env: ENV, fetch, log: logger() }).catch((e) => e)
		expect(err).toBeInstanceOf(MotionError)
		expect(err.message).toMatch(/POST https:\/\/desk\.example\/api\/admin\/stage → 400: .*not uploaded with that sha256/)
		for (const s of SECRETS) expect(err.message).not.toContain(s)
	})
	it('a piece that is not in the stories index is refused', async () => {
		await expect(stage(load(film()), 'nope', { dryRun: true, env: {}, log: logger() })).rejects.toThrow(/nope is not in content\/stories\/index\.json/)
	})
	it('nothing it stages carries a credential', async () => {
		const d = film(), fetch = fakeFetch(ok)
		await stage(load(d), 'demo', { env: ENV, fetch, log: logger() })
		for (const c of fetch.calls.filter((c) => typeof c.body === 'string')) for (const s of SECRETS) expect(c.body).not.toContain(s)
		expect(existsSync(join(d, 'emaki.config.json')) && readFileSync(join(d, 'emaki.config.json'), 'utf-8')).not.toMatch(/secret|token/i)
	})
})
