import { pages } from '$lib/docs';
import { SITE_URL } from '$lib/seo';
import { INIT, REPO } from '$lib/data';

export const prerender = true;

// The llms.txt convention: a curated plain-text index of the docs for coding agents. The charset is explicit so
// static hosts do not serve the dashes as mojibake.
export function GET() {
	const lines = [
		'# emaki',
		'',
		'> Motion stories: one set of JSON scenes per story renders an article’s figures, a story player and narrated',
		'> 16:9 and 9:16 videos, in every language, in light and dark. Framework-free core on npm under @senseihq, with',
		'> Svelte, React and Vue wrappers and web components, a posting desk, and a CLI that installs a Claude plugin.',
		'',
		'## Quick setup',
		'',
		`- \`${INIT}\`: detects the framework; writes the sample content, config, film source, /show route and the plugin`,
		''
	];
	for (const section of ['Guides', 'Packages'] as const) {
		lines.push(`## ${section}`, '');
		for (const p of pages.filter((x) => x.section === section)) lines.push(`- [${p.title}](${SITE_URL}/docs/${p.slug}): ${p.description}`);
		lines.push('');
	}
	lines.push('## Full text', '', `- [All docs, concatenated](${SITE_URL}/llms-full.txt)`, `- [Source repository](${REPO})`, '');
	return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
