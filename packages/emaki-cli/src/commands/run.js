// What every command shares: act() turns a MotionError into "emaki: <message>" and exit 1 (anything else is a bug and
// shows its stack), P() reads the project in the current folder, loc() is --locale or the site's default.
import { project } from '../config.js'
import { MotionError } from '../util.js'

/** Runs a command; a MotionError prints its message and exits 1, anything else is a bug and shows its stack. */
export const act = (fn) => async (...args) => {
	try {
		await fn(...args)
	} catch (e) {
		if (e instanceof MotionError) {
			console.error(`emaki: ${e.message}`)
			process.exit(1)
		}
		throw e
	}
}
export const P = () => project()
export const loc = (o, p) => o.locale ?? p.site.defaultLocale
