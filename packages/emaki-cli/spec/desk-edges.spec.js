// The desk client, stage and publish where a project or the desk leaves something out: no desk origin, a bad media
// key, a desk that answers without a list, pieces with no voice script or film, requests without a time or thread,
// a film without captions, thumbnail or 9:16 cover, a built description.txt, a video with no remote description, and
// the PNG → JPEG step (ffmpeg, stubbed here: the spec asserts what it is asked to do).
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { deskClient, deskReply, deskRequests, pieceStatus, pngToJpeg, postsFor, productionStatus, project as load, publish } from '../src/api.js'
import { DAY, ENV, fakeFetch, json, logger, project, put, tmp } from './helpers.js'

const ffmpeg = vi.hoisted(() => [])
vi.mock('../src/util.js', async (original) => ({ ...(await original()), run: (cmd, args) => { ffmpeg.push([cmd, ...args]); return '' } }))

const STAGER = { STAGER_CLIENT_ID: ENV.STAGER_CLIENT_ID, STAGER_CLIENT_SECRET: ENV.STAGER_CLIENT_SECRET }

describe('the desk client', () => {
	it('refuses to start without a desk origin (no ADMIN_ORIGIN and no site url)', () => {
		expect(() => deskClient(load(tmp()), { env: STAGER, fetch: fakeFetch() })).toThrow(/no desk origin: set ADMIN_ORIGIN, or "url" in content\/site\.json/)
	})

	it('refuses a media key that is not <slug>/<file>, before sending anything', async () => {
		const fetch = fakeFetch()
		await expect(deskClient(load(project()), { env: ENV, fetch }).putMedia('Bad/Key.MP4', Buffer.from('x'), 'video/mp4')).rejects.toThrow(/bad media key "Bad\/Key\.MP4"/)
		expect(fetch.calls).toEqual([])
	})

	it('reads a requests answer without a list as no requests', async () => {
		const log = logger()
		expect(await deskRequests(load(project()), { env: ENV, fetch: fakeFetch(() => ({ json: {} })), log })).toEqual([])
		expect(log.lines).toEqual(['no open requests'])
	})
})

describe('the desk plan', () => {
	it('counts the takes a piece needs from its voice script, else its film\'s scenes, else none', () => {
		const d = project()
		rmSync(join(d, 'content/films/demo/voice'), { recursive: true })
		const p = load(d)
		expect(pieceStatus(p, 'demo', 'en').status.takesNeeded).toBe(2)
		put(d, 'content/films/demo/film.json', { title: 'No scenes' })
		expect(pieceStatus(p, 'demo', 'en').status.takesNeeded).toBe(0)
		expect(pieceStatus(p, 'ghost', 'en')).toEqual({ script: null, status: { motion: false, takes: 0, takesNeeded: 0, film: true, render: false } })
	})

	it('reports no pieces without a stories index, and refuses a slug that is not in it', async () => {
		const d = project()
		rmSync(join(d, 'content/stories/index.json'))
		const fetch = fakeFetch(() => ({ json: { saved: 0 } })), log = logger()
		await productionStatus(load(d), undefined, { env: ENV, fetch, log })
		expect(JSON.parse(fetch.calls[0].body)).toEqual({ items: [] })
		expect(log.lines).toEqual(['reported 0 piece(s)'])
		await expect(productionStatus(load(d), 'demo', { env: ENV, fetch, log })).rejects.toThrow(/demo is not in content\/stories\/index\.json/)
	})

	it('lists a request without a time or a thread, and sends an empty reply when given no text', async () => {
		const log = logger()
		await deskRequests(load(project()), { env: ENV, fetch: fakeFetch(() => ({ json: { requests: [{ id: 3, slug: 'demo', kind: 'edit', status: 'open', author: 'me', body: 'Faster' }] } })), log })
		expect(log.lines).toEqual(['#3 demo · edit · open · me ', '   Faster'])
		const fetch = fakeFetch()
		await deskReply(load(project()), '3', undefined, { env: ENV, fetch, log: logger() })
		expect(JSON.parse(fetch.calls[0].body)).toEqual({ id: 3, reply: '' })
	})
})

describe('stage with files left out', () => {
	it('turns a carousel PNG into a JPEG with ffmpeg, in a temp folder', () => {
		ffmpeg.length = 0
		const out = pngToJpeg('/x/slide-01.PNG')
		expect(out).toMatch(/emaki-jpeg-[^/]+\/slide-01\.jpg$/)
		expect(ffmpeg).toEqual([['ffmpeg', '-y', '-loglevel', 'error', '-i', '/x/slide-01.PNG', '-q:v', '2', out]])
	})

	it('drafts the YouTube description from a built description.txt', () => {
		const d = project()
		put(d, 'production/demo/en/out/description.txt', '  Built description.  \n')
		expect(() => postsFor(load(d), 'demo', 'en')).toThrow(/wrote content\/films\/demo\/post\.en\.json/)
		expect(json(join(d, 'content/films/demo/post.en.json')).youtube.description).toBe('Built description.')
	})

	it('posts a film without captions, thumbnail or 9:16 cover with just its videos', () => {
		const d = project()
		for (const f of ['out/demo-en.srt', 'render/demo-en-cover-16x9.jpg', 'render/demo-en-cover-9x16.jpg']) rmSync(join(d, 'production/demo/en', f))
		put(d, 'content/films/demo/post.en.json', { youtube: { title: 'T' }, instagram_reel: { caption: 'C' } })
		const posts = postsFor(load(d), 'demo', 'en')
		expect(Object.keys(posts)).toEqual(['youtube', 'instagram_reel'])
		expect(posts.youtube[1].map((x) => x.path.split('/').pop())).toEqual(['demo-en-16x9.mp4'])
		expect(posts.instagram_reel[1].map((x) => x.path.split('/').pop())).toEqual(['demo-en-9x16.mp4'])
	})

	it('names the carousel folder as missing for a campaign day with no slides rendered yet', () => {
		const d = project()
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		expect(postsFor(load(d), 'demo', 'en').instagram_carousel[1]).toEqual([{ path: null, expect: join(d, 'films/campaign/carousels/demo') }])
	})
})

describe('publish with files left out', () => {
	it('updates a video that has no description yet with ours alone', async () => {
		const d = project()
		const fetch = fakeFetch((c) => {
			if (c.url.startsWith('https://oauth2.googleapis.com/token')) return { json: { access_token: 'acc' } }
			if (c.method === 'GET' && c.url.includes('/videos?')) return { json: { items: [{ snippet: { title: 'Old' } }] } }
			if (c.method === 'GET' && c.url.includes('/captions?')) return { json: { items: [] } }
			return { json: {} }
		})
		await publish(load(d), 'youtube', 'demo', { update: 'vid9', env: ENV, fetch, log: logger() })
		const meta = JSON.parse(fetch.calls.find((c) => c.method === 'PUT').body)
		expect(meta.snippet.description).toMatch(/^Demo story\n\n0:00 Hook[\s\S]*https:\/\/site\.example\/articles\/demo\n$/)
		expect(meta.snippet.description).not.toContain('---')
	})

	it('shows a Reel without a 9:16 cover on a dry run, and refuses to stage it on the desk', async () => {
		const d = project()
		rmSync(join(d, 'production/demo/en/render/demo-en-cover-9x16.jpg'))
		const log = logger()
		await publish(load(d), 'instagram', 'demo', { dryRun: true, env: {}, log, length: () => 42 })
		expect(log.text()).toMatch(/cover: +none!/)
		const fetch = fakeFetch()
		await expect(publish(load(d), 'instagram', 'demo', { env: ENV, fetch, log: logger(), length: () => 42 })).rejects.toThrow(/demo: no 9:16 cover; run `emaki render demo` first/)
		expect(fetch.calls).toEqual([])
	})

	it('refuses a Reel before the 9:16 film is built', async () => {
		const d = project()
		rmSync(join(d, 'production/demo/en/out/demo-en-9x16.mp4'))
		await expect(publish(load(d), 'instagram', 'demo', { dryRun: true, env: {}, log: logger(), length: () => 42 })).rejects.toThrow(/demo: no built 9:16 video \(production\/demo\/en\/out\/demo-en-9x16\.mp4\)/)
	})
})
