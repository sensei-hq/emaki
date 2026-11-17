// The site sheet, render and carousel capture: a running one named by --url (which must answer), one already listening
// on the configured port, or the dev server emaki starts for the run and stops afterwards; and the message when
// Playwright is not installed. The "dev server" is a node one-liner on a free local port; nothing leaves the machine.
import { createServer } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chromium, openSite } from '../src/show-page.js'
import { MotionError } from '../src/util.js'
import { tmp } from './helpers.js'

vi.mock('playwright', () => { throw new Error('Cannot find package \'playwright\'') })

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

const site = (cfg = {}) => ({ cfg, root: tmp() })
const freePort = () => new Promise((ok) => {
	const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})
const listening = (port) => new Promise((ok) => {
	const s = createServer().listen(port, '127.0.0.1', () => ok(s))
})
const answers = (port) => new Promise((ok) => {
	const c = createServer().once('error', () => ok(true)).listen(port, '127.0.0.1', () => c.close(() => ok(false)))
})

describe('chromium', () => {
	it('says how to install Playwright when it is missing', async () => {
		await expect(chromium()).rejects.toThrow(new MotionError('sheet, render and carousel need Playwright: npm i -D playwright && npx playwright install chromium'))
	})
})

describe('openSite', () => {
	it('uses --url when it answers, and stops on one that does not', async () => {
		vi.stubGlobal('fetch', async () => new Response('ok'))
		const s = await openSite(site(), 'http://site.test/')
		expect(s.base).toBe('http://site.test')
		expect(s.show('demo', 'portrait', 'es')).toBe('http://site.test/show/demo?capture=1&o=portrait&locale=es')
		s.close()
		vi.stubGlobal('fetch', async () => { throw new Error('connect ECONNREFUSED') })
		await expect(openSite(site(), 'http://down.test')).rejects.toThrow(new MotionError(
			'the site at http://down.test is not responding (connect ECONNREFUSED); start it, or leave out --url to let emaki start it'))
	})

	it('uses what already listens on the configured port, with the configured capture path', async () => {
		const port = await freePort(), server = await listening(port)
		try {
			const s = await openSite(site({ port, showPath: '/capture/{slug}/{layout}/{locale}' }))
			expect(s.base).toBe(`http://localhost:${port}`)
			expect(s.show('demo', 'landscape', 'en')).toBe(`http://localhost:${port}/capture/demo/landscape/en`)
			s.close()
			expect(await answers(port)).toBe(true)
		} finally {
			server.close()
		}
	})

	it('starts the dev server when nothing listens, and stops it on close', async () => {
		const port = await freePort()
		const devCommand = `"${process.execPath}" -e "require('net').createServer().listen({port},'127.0.0.1')"`
		const s = await openSite(site({ port, devCommand }))
		expect(s.base).toBe(`http://localhost:${port}`)
		expect(await answers(port)).toBe(true)
		s.close()
		let up = true
		for (let i = 0; i < 50 && up; i++) {
			await new Promise((r) => setTimeout(r, 100))
			up = await answers(port)
		}
		expect(up).toBe(false)
	})

	it('stops the dev server process itself where its process group cannot be signalled (Windows)', async () => {
		const port = await freePort()
		// `exec`: the shell becomes the server, so stopping the process stops the server (as a Windows shell's child
		// would be); without it Linux's dash keeps the shell as the server's parent and only the shell dies.
		const devCommand = `exec "${process.execPath}" -e "require('net').createServer().listen({port},'127.0.0.1')"`
		const s = await openSite(site({ port, devCommand }))
		const kill = process.kill.bind(process)
		const groups = vi.spyOn(process, 'kill').mockImplementation((pid, sig) => {
			if (pid < 0) throw Object.assign(new Error('kill EINVAL'), { code: 'EINVAL' })
			return kill(pid, sig)
		})
		try {
			s.close()
			expect(groups).toHaveBeenCalledWith(expect.any(Number))
		} finally {
			groups.mockRestore()
		}
		let up = true
		for (let i = 0; i < 30 && up; i++) {
			await new Promise((r) => setTimeout(r, 100))
			up = await answers(port)
		}
		expect(up).toBe(false)
	})

	it('gives up after a minute when the dev server (npm run dev by default) never listens', async () => {
		const port = await freePort()
		vi.useFakeTimers({ toFake: ['setTimeout'] })
		let settled = false
		const run = openSite(site({ port })).catch((e) => e).finally(() => { settled = true })
		while (!settled) {
			await new Promise((r) => setImmediate(r))
			if (vi.getTimerCount()) vi.advanceTimersByTime(500)
		}
		expect(await run).toEqual(new MotionError(`the dev server did not start (npm run dev -- --port ${port} --strictPort)`))
	}, 30000)
})
