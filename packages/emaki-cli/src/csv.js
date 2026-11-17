// CSV with a header line (the campaign's calendar.csv). A small state machine: one handler per character, inside or
// outside quotes; each returns how many extra characters it consumed.

const endCell = (s) => { s.row.push(s.cell); s.cell = '' }
const endRow = (s) => { endCell(s); s.rows.push(s.row); s.row = [] }

/** Inside quotes: "" is a quote, a lone " closes the quotes, anything else (commas, newlines) is text. */
function quotedChar(s, text, i) {
	const c = text[i]
	if (c !== '"') s.cell += c
	else if (text[i + 1] === '"') { s.cell += '"'; return 1 }
	else s.quoted = false
	return 0
}

/** Outside quotes: " opens quotes, a comma ends the cell, \n, \r or \r\n ends the row. */
const PLAIN = {
	'"': (s) => { s.quoted = true; return 0 },
	',': (s) => { endCell(s); return 0 },
	'\n': (s) => { endRow(s); return 0 },
	'\r': (s, text, i) => { endRow(s); return text[i + 1] === '\n' ? 1 : 0 }
}
function plainChar(s, text, i) {
	const special = PLAIN[text[i]]
	if (special) return special(s, text, i)
	s.cell += text[i]
	return 0
}

/** Every row of `text` as an array of cells, blank rows included. */
function csvRows(text) {
	const s = { rows: [], row: [], cell: '', quoted: false }
	for (let i = 0; i < text.length; i++) i += (s.quoted ? quotedChar : plainChar)(s, text, i)
	if (s.cell || s.row.length) endRow(s)
	return s.rows
}

/** Rows of a CSV with a header line, as objects. Quoted fields may hold commas, newlines and "" quotes. */
export function parseCsv(text) {
	const [head = [], ...body] = csvRows(text).filter((r) => r.some((x) => x !== ''))
	return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])))
}
