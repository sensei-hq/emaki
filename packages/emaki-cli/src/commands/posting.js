// emaki stage (+ status, requests, reply), publish, carousel: after the build, stage for approval on the posting desk,
// or publish straight to a platform. Credentials come from the environment only (STAGER_*, MEDIA_URL_SECRET, YT_*,
// IG_*; see the README).
import { MotionError } from '../util.js'
import { act, P } from './run.js'

const list = (v) => [v ?? []].flat().flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean)

/** Staging on the desk, publishing, and the carousel. */
export function postingCommands(prog) {
	prog.command('stage <slug>')
		.describe('Upload a finished piece\'s media and post text to the posting desk for approval (STAGER_CLIENT_ID/SECRET).')
		.option('--channels', 'youtube,instagram_reel,instagram_carousel,x (default: all)')
		.option('--locale', 'Locale (default: the site default)')
		.option('--dry-run', 'Print the posts; send nothing', false)
		.action(act(async (slug, o) => {
			const { stage } = await import('../stage.js')
			await stage(P(), slug, { locale: o.locale, channels: o.channels ? list(o.channels) : undefined, dryRun: o['dry-run'] })
		}))

	prog.command('stage status [slug]')
		.describe('Report each piece\'s script and what is produced to the desk\'s plan.')
		.option('--locale', 'Locale (default: the site default)')
		.action(act(async (slug, o) => {
			const { productionStatus } = await import('../desk-plan.js')
			await productionStatus(P(), slug, { locale: o.locale })
		}))

	prog.command('stage requests')
		.describe('The open motion requests from the desk, with their threads.')
		.action(act(async () => {
			const { deskRequests } = await import('../desk-plan.js')
			await deskRequests(P())
		}))

	prog.command('stage reply <id> [text]')
		.describe('Answer a motion request; --working or --done moves it on.')
		.option('--working', 'Mark it working', false)
		.option('--done', 'Mark it done', false)
		.action(act(async (id, text, o) => {
			if (o.working && o.done) throw new MotionError('--working or --done, not both')
			const { deskReply } = await import('../desk-plan.js')
			await deskReply(P(), id, text ?? '', { status: o.done ? 'done' : o.working ? 'working' : undefined })
		}))

	prog.command('publish <channel> [slug]')
		.describe('Post a finished film straight to youtube or instagram and record the link (YT_* / IG_* keys).')
		.option('--locale', 'Locale (default: the site default)')
		.option('--privacy', 'YouTube: public | unlisted | private', 'unlisted')
		.option('--update', 'YouTube: refresh this uploaded video id in place (no re-upload)')
		.option('--force-new', 'YouTube: upload even when an id is already recorded', false)
		.option('--description-mode', 'With --update: prepend | replace', 'prepend')
		.option('--video-url', 'Instagram: public MP4 URL (skips staging on the desk)')
		.option('--cover-url', 'Instagram: public JPEG URL for the cover (with --video-url)')
		.option('--dry-run', 'Print exactly what would post; touch nothing', false)
		.option('--verify', 'Check the credentials (read-only) and name the account', false)
		.action(act(async (channel, slug, o) => {
			if (!o.verify && !slug) throw new MotionError('a slug is required (or --verify)')
			const { publish } = await import('../publish.js')
			await publish(P(), channel, slug, {
				locale: o.locale, privacy: o.privacy, update: o.update && String(o.update), forceNew: o['force-new'], descriptionMode: o['description-mode'],
				videoUrl: o['video-url'], coverUrl: o['cover-url'], dryRun: o['dry-run'], verify: o.verify
			})
		}))

	prog.command('carousel [slug]')
		.describe('Render a campaign day\'s Instagram carousel (1080×1350 PNGs) from its day script (needs Playwright).')
		.option('--all', 'Every day script', false)
		.option('--locale', 'Locale (default: the site default)')
		.action(act(async (slug, o) => {
			const { carousel } = await import('../carousel.js')
			await carousel(P(), [slug, ...o._].filter(Boolean).map(String), { all: o.all, locale: o.locale })
		}))
}
