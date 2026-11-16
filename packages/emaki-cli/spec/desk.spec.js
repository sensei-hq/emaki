// emaki stage status | requests | reply: the producing machine's side of the desk's plan. It reports each piece's
// script and what exists for it, reads the open motion requests with their threads, and answers them. Ported from
// films/tools/stage.py (status, requests, reply).
import { describe, expect, it } from 'vitest'
import { deskReply, deskRequests, MotionError, productionStatus, project as load } from '../src/api.js'
import { DAY, ENV, fakeFetch, logger, project, put, SECRETS } from './helpers.js'

describe('production status', () => {
	it('reports every story\'s script and what is produced, as the desk plan shows it', async () => {
		const d = project()
		put(d, 'content/stories/index.json', [{ slug: 'demo', publish_date: '2026-11-16', tags: [] }, { slug: 'daily', publish_date: '2026-11-17', tags: [] }, { slug: 'idea', publish_date: '2026-11-18', tags: [] }])
		put(d, 'content/films/demo/script.md', '# Demo\nThe script.')
		put(d, 'production/demo/en/takes/take-01.wav', 'RIFF')
		put(d, 'films/campaign/days/day-02-daily.md', DAY)
		put(d, 'content/films/daily/film.json', { title: 'Daily', scenes: [{ id: 'hook', dur: 5 }, { id: 'close', dur: 5 }] })
		put(d, 'content/films/daily/voice/en.json', [{ scene: 'hook', text: 'a' }, { scene: 'close', text: 'b' }])
		put(d, 'production/daily/en/out/daily-en-9x16.mp4', 'TALL')
		put(d, 'films/campaign/carousels/daily/slide-01.png', 'PNG')
		put(d, 'films/campaign/carousels/daily/slide-02.png', 'PNG')
		const fetch = fakeFetch(() => ({ json: { ok: true, saved: 3 } })), log = logger()
		const r = await productionStatus(load(d), undefined, { env: ENV, fetch, log })
		expect(fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST https://desk.example/api/admin/production'])
		expect(fetch.calls[0].headers).toMatchObject({ 'cf-access-client-id': 'stager-id.access', 'content-type': 'application/json' })
		expect(JSON.parse(fetch.calls[0].body)).toEqual({ items: [
			{ slug: 'demo', script: '# Demo\nThe script.', status: { motion: true, film: true, takes: 1, takesNeeded: 2, render: true } },
			{ slug: 'daily', script: DAY, status: { motion: true, takes: 0, takesNeeded: 2, short: true, carousel: 2 } },
			{ slug: 'idea', script: null, status: { motion: false, film: true, takes: 0, takesNeeded: 0, render: false } }
		] })
		expect(r.saved).toBe(3)
		expect(log.text()).toBe('reported 3 piece(s)')
	})
	it('reports one piece when given a slug', async () => {
		const fetch = fakeFetch(() => ({ json: { ok: true, saved: 1 } }))
		await productionStatus(load(project()), 'demo', { env: ENV, fetch, log: logger() })
		expect(JSON.parse(fetch.calls[0].body).items.map((i) => i.slug)).toEqual(['demo'])
	})
	it('needs the stager credentials and sends nothing without them', async () => {
		const fetch = fakeFetch()
		await expect(productionStatus(load(project()), undefined, { env: {}, fetch, log: logger() })).rejects.toThrow(/STAGER_CLIENT_ID, STAGER_CLIENT_SECRET/)
		expect(fetch.calls).toEqual([])
	})
})

describe('motion requests', () => {
	const open = { requests: [
		{ id: 7, slug: 'demo', kind: 'edit', status: 'open', author: 'jerry@example.com', at: '2026-11-15T09:12:44Z', body: 'Slow the hook down.',
			thread: [{ id: 8, author: 'stager-id.access', body: 'On it.' }] }
	] }
	it('lists the open requests with their threads', async () => {
		const fetch = fakeFetch(() => ({ json: open })), log = logger()
		const r = await deskRequests(load(project()), { env: ENV, fetch, log })
		expect(fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET https://desk.example/api/admin/requests'])
		expect(fetch.calls[0].headers['cf-access-client-id']).toBe('stager-id.access')
		expect(r).toEqual(open.requests)
		expect(log.lines).toEqual(['#7 demo · edit · open · jerry@example.com 2026-11-15T09:12', '   Slow the hook down.', '   ↳ stager-id.access: On it.'])
	})
	it('says so when there are none', async () => {
		const log = logger()
		await deskRequests(load(project()), { env: ENV, fetch: fakeFetch(() => ({ json: { requests: [] } })), log })
		expect(log.text()).toBe('no open requests')
	})
	it('answers one, optionally marking it working or done', async () => {
		const fetch = fakeFetch(() => ({ json: { ok: true } }))
		await deskReply(load(project()), 7, 'Done: the hook holds 2 s longer.', { status: 'done', env: ENV, fetch, log: logger() })
		await deskReply(load(project()), '7', 'Looking at it.', { env: ENV, fetch, log: logger() })
		expect(fetch.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST https://desk.example/api/admin/requests', 'POST https://desk.example/api/admin/requests'])
		expect(JSON.parse(fetch.calls[0].body)).toEqual({ id: 7, reply: 'Done: the hook holds 2 s longer.', status: 'done' })
		expect(JSON.parse(fetch.calls[1].body)).toEqual({ id: 7, reply: 'Looking at it.' })
	})
	it('refuses a bad id or status before sending, and reports a refusal without secrets', async () => {
		const fetch = fakeFetch(() => ({ status: 404, json: { ok: false, reason: 'No such request' } }))
		await expect(deskReply(load(project()), 'x', 'hi', { env: ENV, fetch, log: logger() })).rejects.toThrow(/request id/)
		await expect(deskReply(load(project()), 7, 'hi', { status: 'closed', env: ENV, fetch, log: logger() })).rejects.toThrow(/working or done/)
		expect(fetch.calls).toEqual([])
		const err = await deskReply(load(project()), 9, 'hi', { env: ENV, fetch, log: logger() }).catch((e) => e)
		expect(err).toBeInstanceOf(MotionError)
		expect(err.message).toMatch(/→ 404: .*No such request/)
		for (const s of SECRETS) expect(err.message).not.toContain(s)
	})
})
