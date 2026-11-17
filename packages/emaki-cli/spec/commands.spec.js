// The media pipeline as `emaki` commands: stage (+ status, requests, reply), publish, carousel, campaign. Runs the real
// CLI in a child process with an environment that holds no credentials, so nothing can reach a network.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DAY, json, project, put } from './helpers.js'

const CLI = join(import.meta.dirname, '..', 'src', 'index.js')
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ADMIN_|STAGER_|MEDIA_|YT_|IG_|X_)/.test(k)))
const emaki = (cwd, ...args) => {
	const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8', env: clean })
	return { code: r.status, out: r.stdout, err: r.stderr }
}

describe('emaki commands', () => {
	it('lists the new commands in its help', () => {
		const { out, code } = emaki(project(), '--help')
		expect(code).toBe(0)
		for (const c of ['stage', 'stage status', 'stage requests', 'stage reply', 'publish', 'carousel', 'campaign status', 'campaign shortfilm', 'campaign posted', 'campaign due', 'campaign calendar'])
			expect(out, c).toMatch(new RegExp(`\\n\\s+${c}\\s`))
	})

	it('stage --dry-run prints the posts and needs no credentials', () => {
		const d = project()
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		const { out, code, err } = emaki(d, 'stage', 'demo', '--dry-run', '--channels', 'youtube,x')
		expect(err).toBe('')
		expect(code).toBe(0)
		expect(out).toMatch(/--- youtube\n\{/)
		expect(out).toMatch(/--- x\n\{/)
		expect(out).not.toMatch(/--- instagram/)
	})

	it('stage without credentials names the variables and exits 1', () => {
		const d = project()
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		const r = emaki(d, 'stage', 'demo')
		expect(r.code).toBe(1)
		expect(r.err).toMatch(/^emaki: missing STAGER_CLIENT_ID, STAGER_CLIENT_SECRET/)
		expect(emaki(d, 'stage', 'status').err).toMatch(/missing STAGER_CLIENT_ID/)
		expect(emaki(d, 'stage', 'requests').err).toMatch(/missing STAGER_CLIENT_ID/)
		expect(emaki(d, 'stage', 'reply', 'x', 'hi').err).toMatch(/request id must be a number/)
		expect(emaki(d, 'stage', 'reply', '7', 'hi', '--done', '--working').err).toMatch(/--working or --done, not both/)
	})

	it('publish --dry-run shows what would post; --verify without keys names them', () => {
		const d = project()
		const yt = emaki(d, 'publish', 'youtube', 'demo', '--dry-run', '--privacy', 'public')
		expect(yt.code).toBe(0)
		expect(yt.out).toMatch(/YouTube · Demo story · privacy public[\s\S]*dry run: nothing posted/)
		const v = emaki(d, 'publish', 'instagram', '--verify')
		expect(v.code).toBe(1)
		expect(v.err).toMatch(/missing IG_USER_ID, IG_ACCESS_TOKEN/)
		expect(emaki(d, 'publish', 'youtube').err).toMatch(/a slug is required \(or --verify\)/)
	})

	it('campaign due prints JSON; campaign posted records links; campaign calendar writes the file', () => {
		const d = project()
		put(d, 'films/campaign/calendar.csv', 'date,product,theme,title,status,script\n2026-11-16,DBD,DBD week,Title,expanded,days/day-01-demo.md\n')
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		const due = emaki(d, 'campaign', 'due', '--date', '2026-11-16')
		expect(due.code).toBe(0)
		expect(JSON.parse(due.out)).toMatchObject({ slug: 'demo', story: 'https://site.example/articles/demo' })
		const posted = emaki(d, 'campaign', 'posted', 'demo', '--youtube', '12345', '--x', 'https://x.com/i/web/status/1')
		expect(posted.code).toBe(0)
		expect(json(join(d, 'content/stories/index.json'))[0].social).toEqual({ youtube: 'https://www.youtube.com/watch?v=12345', x: 'https://x.com/i/web/status/1' })
		expect(emaki(d, 'campaign', 'calendar').out).toMatch(/wrote films\/campaign\/CALENDAR\.md \(1 days\)/)
		const st = emaki(d, 'campaign', 'status', '--from', '2026-11-16', '--days', '3')
		expect(st.code).toBe(0)
		expect(st.out).toMatch(/2026-11-16 +DBD +Title/)
		const sf = emaki(d, 'campaign', 'shortfilm', 'demo')
		expect(sf.err).toMatch(/content\/films\/demo already exists/)
	})

	it('fit and campaign status print their tables', () => {
		const d = project()
		const fit = emaki(d, 'fit', 'demo', '--check')
		expect(fit.err).toBe('')
		expect(fit.out).toBe([
			'scene        design  holds   take   runs',
			'hook           12.0    0.0    0.0   12.0  (no take)',
			'close          18.0    0.0    0.0   18.0  (no take)',
			'total 30.0 s (en)',
			''
		].join('\n'))
		put(d, 'films/campaign/calendar.csv', 'date,product,theme,title,status,script\n2026-11-16,DBD,DBD week,Title,expanded,days/day-01-demo.md\n2026-11-17,Rokkit,Rokkit week,"A title longer than forty-six characters, cut short",planned,\n')
		put(d, 'films/campaign/days/day-01-demo.md', DAY)
		expect(emaki(d, 'campaign', 'posted', 'demo', '--youtube', '12345', '--x', 'https://x.com/i/web/status/1').code).toBe(0)
		const st = emaki(d, 'campaign', 'status', '--from', '2026-11-16', '--days', '3')
		expect(st.out).toBe([
			'date        topic       title                                          story film takes rndr short car posts',
			'2026-11-16  DBD         Title                                          yes   yes     0   -   yes    0  Y·X',
			'2026-11-17  Rokkit      A title longer than forty-six characters, cut  (no day script yet)',
			'',
			'posts: Y = YouTube, I = Instagram, X = X; · = not yet',
			''
		].join('\n'))
	})

	it('carousel needs a slug or --all', () => {
		expect(emaki(project(), 'carousel').err).toMatch(/name a slug, or --all/)
	})
})
