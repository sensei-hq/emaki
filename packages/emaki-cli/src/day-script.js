// A campaign day script (<campaign>/days/day-NN-<slug>.md, or days/<locale>/…): one piece's copy for every channel.
// Reads both the website's labels (**YouTube title:**, **YouTube description:**) and the plugin template's (**Title:**,
// **Description:** under "## N · YouTube").
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exists } from './util.js'

/** The campaign folder: emaki.config.json "campaign" (default campaign/). */
export const campaignDir = (p) => join(p.root, p.cfg.campaign ?? 'campaign')

/** The slug in a day script's file name: day-07-some-slug.md → some-slug. */
export const slugOfScript = (file) => file.replace(/^.*\//, '').replace(/\.md$/, '').replace(/^day-\d+-/, '')

/** Path of the day script for a slug (the locale's folder first), or null. */
export function dayScriptPath(p, slug, locale) {
	for (const dir of [join(campaignDir(p), 'days', locale), join(campaignDir(p), 'days')]) {
		if (!exists(dir)) continue
		const f = readdirSync(dir).sort().find((n) => /^day-\d+-.+\.md$/.test(n) && slugOfScript(n) === slug)
		if (f) return join(dir, f)
	}
	return null
}

export const dayScript = (p, slug, locale) => {
	const f = dayScriptPath(p, slug, locale)
	return f ? readFileSync(f, 'utf-8') : null
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The text after **Label:** up to a blank line before the next label, the next label line, a heading, or the end. */
export function field(md, ...labels) {
	for (const label of labels) {
		const m = md.match(new RegExp(`\\*\\*${esc(label)}:\\*\\*[ \\t]*([\\s\\S]*?)(?=\\n\\s*\\n\\*\\*|\\n\\*\\*[^*\\n]+:\\*\\*|\\n#{1,6} |$(?![\\s\\S]))`))
		if (m) return m[1].trim()
	}
	return ''
}

/** "1. text" lines of a block, numbers dropped. */
export const numbered = (block) => block.split('\n').map((l) => l.trim()).filter((l) => /^\d+\.\s/.test(l)).map((l) => l.replace(/^\d+\.\s*/, '').trim())

/** The channel copy of a day script. */
export function channelCopy(md) {
	const ytDesc = field(md, 'YouTube description', 'Description')
	const thread = md.includes('**Thread:**') ? md.split('**Thread:**')[1].split('\n## ')[0] : ''
	return {
		youtube: { title: field(md, 'YouTube title', 'Title').slice(0, 100), description: ytDesc, tags: [...ytDesc.matchAll(/#(\w+)/g)].map((m) => m[1]) },
		caption: [field(md, 'Caption'), field(md, 'Hashtags')].filter(Boolean).join('\n\n'),
		x: { text: field(md, 'Post'), thread: numbered(thread) }
	}
}

/** The topic in the heading: "# Day 01 · Mon Nov 16 · DBD: Title" → DBD. */
export const topicOf = (md) => md.match(/^# Day \d+ · .+? · (.+?): /m)?.[1] ?? ''

/** The carousel slides: the numbered lines of "## N · Instagram carousel" before **Caption:** (\n in a line breaks it). */
export function slidesOf(md) {
	const parts = md.split(/^## \d+ · Instagram carousel.*$/m)
	if (parts.length < 2) return []
	const block = parts[1].split('**Caption:**')[0].split(/^## /m)[0]
	return numbered(block).map((s) => s.replaceAll('\\n', '\n'))
}

/** The voiceover table: | # | Voiceover | On screen | rows. */
export const beatsOf = (md) => [...md.matchAll(/^\| (\d+) \| (.+?) \| (.+?) \|$/gm)].map((m) => ({ n: Number(m[1]), text: m[2].trim(), screen: m[3].trim() }))
