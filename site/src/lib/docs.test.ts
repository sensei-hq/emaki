// The /docs pages: every guide and package reference in docs/llms, in reading order, with working links. The site
// keeps committed copies of docs/llms (scripts/copy-docs.mjs), and a stale copy is what readers actually see, so
// the copies must match the source byte for byte.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addHeadingIds, findPage, pages, rewriteLinks } from './docs';

const LLMS = '../docs/llms';
const guides = readdirSync(`${LLMS}/guides`).filter((f) => f.endsWith('.md'));
const pkgs = readdirSync(`${LLMS}/packages`).filter((f) => f.endsWith('.txt'));

describe('docs', () => {
	it('the site copies match docs/llms', () => {
		for (const f of guides)
			expect(readFileSync(`src/lib/content/docs/guides/${f}`, 'utf-8'), f).toBe(readFileSync(`${LLMS}/guides/${f}`, 'utf-8'));
		for (const f of pkgs)
			expect(readFileSync(`src/lib/content/docs/packages/${f.replace('.txt', '.md')}`, 'utf-8'), f).toBe(
				readFileSync(`${LLMS}/packages/${f}`, 'utf-8')
			);
	});

	it('has a page for every guide and package: guides first, then packages core-first', () => {
		expect(pages.map((p) => p.slug).sort()).toEqual([...guides.map((f) => f.replace('.md', '')), ...pkgs.map((f) => f.replace('.txt', ''))].sort());
		expect(pages[0].slug).toBe('architecture');
		const firstPkg = pages.findIndex((p) => p.section === 'Packages');
		expect(pages.slice(0, firstPkg).every((p) => p.section === 'Guides')).toBe(true);
		expect(pages[firstPkg].slug).toBe('emaki');
	});

	it('gives every page a title, a description and rendered html', () => {
		for (const p of pages) {
			expect(p.title, p.slug).toBeTruthy();
			expect(p.description.length, p.slug).toBeGreaterThan(20);
			expect(p.html, p.slug).toContain('<h');
		}
		expect(findPage('emaki-svelte')?.title).toBe('@senseihq/emaki-svelte');
		expect(findPage('nope')).toBeUndefined();
	});

	it('points llms links at the site pages and repo paths at GitHub', () => {
		expect(rewriteLinks('<a href="/llms/packages/emaki-react.txt">r</a>')).toBe('<a href="/docs/emaki-react">r</a>');
		expect(rewriteLinks('<a href="/llms/guides/i18n.md#fallback">i</a>')).toBe('<a href="/docs/i18n#fallback">i</a>');
		expect(rewriteLinks('<a href="content-model.md">c</a>')).toBe('<a href="/docs/content-model">c</a>');
		expect(rewriteLinks('<a href="packages/emaki/src/mode.ts">m</a>')).toBe('<a href="https://github.com/sensei-hq/emaki/blob/main/packages/emaki/src/mode.ts">m</a>');
		expect(rewriteLinks('<a href="https://x.dev">x</a>')).toBe('<a href="https://x.dev">x</a>');
	});

	it('gives headings anchor ids', () => {
		expect(addHeadingIds('<h2>Light and <code>dark</code></h2>')).toBe('<h2 id="light-and-dark">Light and <code>dark</code></h2>');
		expect(addHeadingIds("<h3>Don&#39;t &lt;guess&gt;</h3>")).toBe('<h3 id="don-t-guess">Don&#39;t &lt;guess&gt;</h3>');
	});
});
