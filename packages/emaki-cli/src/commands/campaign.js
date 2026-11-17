// emaki campaign status | shortfilm | posted | due | calendar: the daily series from the command line.
import { act, P } from './run.js'

const yes = (b) => (b ? 'yes' : ' - ')

/** One day of campaign status: what exists for it, or that it has no day script yet. */
function statusRow(r) {
	const head = `${r.date}  ${r.topic.slice(0, 11).padEnd(11)} ${r.title.slice(0, 46).padEnd(46)}`
	if (!r.script) return `${head} (no day script yet)`
	const posts = ['youtube', 'instagram', 'x'].map((k) => (r.posts[k] ? k[0].toUpperCase() : '·')).join('')
	return `${head} ${yes(r.story)}   ${yes(r.film)}  ${String(r.takes).padStart(4)}  ${yes(r.render)}  ${yes(r.built)}  ${String(r.carousel).padStart(3)}  ${posts}`
}

/** The campaign commands. */
export function campaignCommands(prog) {
	prog.command('campaign status')
		.describe('What is due, and for each day what exists: story, film, takes, render, Short, carousel, posts.')
		.option('--days', 'How many days', 14)
		.option('--from', 'First date YYYY-MM-DD (default: today in the site\'s time zone)')
		.action(act(async (o) => {
			const { campaignStatus } = await import('../campaign.js')
			console.info(`${'date'.padEnd(10)}  ${'topic'.padEnd(11)} ${'title'.padEnd(46)} story film takes rndr short car posts`)
			for (const r of campaignStatus(P(), { from: o.from && String(o.from), days: Number(o.days) })) console.info(statusRow(r))
			console.info('\nposts: Y = YouTube, I = Instagram, X = X; · = not yet')
		}))

	prog.command('campaign shortfilm <slug>')
		.describe('Set up a Short\'s film (scenes and voice lines) from its day script\'s voiceover table.')
		.option('--locale', 'Locale (default: the site default)')
		.action(act(async (slug, o) => {
			const { shortFilm } = await import('../campaign.js')
			const r = shortFilm(P(), slug, { locale: o.locale })
			console.info(`wrote ${r.path}: ${r.scenes} beats. Next: build the scenes, then \`emaki voice ${slug}\`, \`emaki fit ${slug}\`, \`emaki render ${slug} --o portrait\`.`)
		}))

	prog.command('campaign posted <slug>')
		.describe('Record where a piece was posted: the campaign ledger and the story\'s social links.')
		.option('--youtube', 'Video id or URL')
		.option('--instagram', 'Post URL')
		.option('--x', 'Post URL')
		.action(act(async (slug, o) => {
			const { campaignPosted } = await import('../campaign.js')
			const s = (v) => (v === undefined || v === true ? undefined : String(v))
			const r = campaignPosted(P(), slug, { youtube: s(o.youtube), instagram: s(o.instagram), x: s(o.x) })
			console.info(`recorded ${slug}: ${JSON.stringify(r)}. Commit content/stories/index.json; the next build links the posts.`)
		}))

	prog.command('campaign due')
		.describe('The piece for one day (default today in the site\'s time zone), as JSON, for automation.')
		.option('--date', 'YYYY-MM-DD')
		.action(act(async (o) => {
			const { campaignDue } = await import('../campaign.js')
			console.info(JSON.stringify(campaignDue(P(), { date: o.date && String(o.date) }), null, 2))
		}))

	prog.command('campaign calendar')
		.describe('Rewrite CALENDAR.md in the campaign folder from calendar.csv.')
		.action(act(async () => {
			const { campaignCalendar } = await import('../campaign.js')
			const r = campaignCalendar(P())
			console.info(`wrote ${r.path} (${r.days} days)`)
		}))
}
