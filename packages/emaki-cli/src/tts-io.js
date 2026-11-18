// What every text-to-speech provider shares: the TTSError a check or a synthesis throws, running a command, a take
// in the shape fit and build expect, keys from the environment, and the HTTP calls the cloud providers make.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export class TTSError extends Error {}
export const fail = (m) => { throw new TTSError(m) }
export const lang = (locale) => locale.split('-')[0]

export function sh(cmd, args, input) {
	const r = spawnSync(cmd, args, { input, encoding: input == null ? 'utf-8' : undefined, maxBuffer: 256 * 1024 * 1024 })
	if (r.error) fail(`${cmd}: ${r.error.code === 'ENOENT' ? 'not installed' : r.error.message}`)
	if (r.status) fail(`${cmd}: ${String(r.stderr).slice(-400)}`)
	return r.stdout
}

/** Any audio file or bytes → 48 kHz mono WAV with 0.1 s head air at dst. */
export function toTake(src, dst) {
	const dir = mkdtempSync(join(tmpdir(), 'emaki-'))
	try {
		let file = src
		if (typeof src !== 'string') { file = join(dir, 'raw'); writeFileSync(file, src) }
		sh('ffmpeg', ['-v', 'error', '-y', '-i', file, '-af', 'adelay=100|100', '-ar', '48000', '-ac', '1', dst])
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

export function inTemp(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'emaki-'))
	try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

export function env(...names) {
	for (const n of names) if (process.env[n]) return process.env[n]
	return fail(`set ${names.join(' or ')} in the environment (never in files)`)
}

export async function post(url, body, headers, as = 'bytes') {
	const r = await fetch(url, { method: 'POST', body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), headers })
	if (!r.ok) fail(`${new URL(url).host}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`)
	return as === 'json' ? r.json() : Buffer.from(await r.arrayBuffer())
}

export async function get(url, headers) {
	const r = await fetch(url, { headers })
	if (!r.ok) fail(`${new URL(url).host}: HTTP ${r.status}`)
	return r.json()
}
