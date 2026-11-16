// Small helpers shared by the commands. Errors that the user should read go through die(), which throws a
// MotionError: the CLI prints its message and exits 1; tests catch it.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export class MotionError extends Error {}
/** @returns {never} */
export function die(msg) {
	throw new MotionError(msg)
}

export const load = (p) => JSON.parse(readFileSync(p, 'utf-8'))
export function save(p, data) {
	mkdirSync(dirname(p), { recursive: true })
	writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
}
export const exists = (p) => existsSync(p)

/** Runs a program (no shell) and returns stdout; dies with the tail of stderr on failure. */
export function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, ...opts })
	if (r.error) die(`${cmd}: ${r.error.code === 'ENOENT' ? 'not installed (not on PATH)' : r.error.message}`)
	if (r.status) die(`${cmd} failed: ${(r.stderr || '').slice(-800)}`)
	return r.stdout
}

/** True when `cmd` is on PATH. */
export function which(cmd) {
	try {
		execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

/** Length of an audio or video file in seconds (ffprobe). */
export const mediaLength = (p) =>
	parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).trim())

/** key=value pairs from --opt, values parsed as JSON when they are JSON (numbers, booleans). */
export function parseOpts(items) {
	const out = {}
	for (const it of [items ?? []].flat()) {
		const i = String(it).indexOf('=')
		if (i < 0) continue
		const k = it.slice(0, i), v = it.slice(i + 1)
		try {
			out[k] = JSON.parse(v)
		} catch {
			out[k] = v
		}
	}
	return out
}

export const pad2 = (n) => String(n).padStart(2, '0')
export const today = () => new Date().toISOString().slice(0, 10)
