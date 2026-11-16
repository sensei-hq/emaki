/**
 * Syncs docs/llms into the site (predev, prebuild, check; also `bun run sync:docs`):
 *
 *   ../docs/llms/guides/*.md     → src/lib/content/docs/guides/    (rendered at /docs/<name>)
 *   ../docs/llms/packages/*.txt  → src/lib/content/docs/packages/<name>.md
 *
 * docs/llms stays the one source; the copies are committed so a plain checkout renders, and
 * src/lib/docs.test.ts fails when a copy drifts from its source.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const llms = resolve(here, '..', '..', 'docs', 'llms');
const dest = resolve(here, '..', 'src', 'lib', 'content', 'docs');

if (!existsSync(llms)) {
	console.error(`  ! missing ${llms}`);
	process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
for (const [dir, ext] of [['guides', '.md'], ['packages', '.txt']]) {
	mkdirSync(join(dest, dir), { recursive: true });
	for (const f of readdirSync(join(llms, dir)).filter((n) => n.endsWith(ext)))
		copyFileSync(join(llms, dir, f), join(dest, dir, f.replace(/\.txt$/, '.md')));
}
console.log('docs sync complete.');
