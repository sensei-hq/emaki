import { marked } from 'marked';

// The /docs pages: committed copies of docs/llms (scripts/copy-docs.mjs), rendered with marked at build time. The
// content is ours and trusted, so the HTML is injected as is.
const raws = import.meta.glob('./content/docs/*/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

const REPO_BLOB = 'https://github.com/sensei-hq/emaki/blob/main';

marked.setOptions({ gfm: true });
// docs/llms is plain Markdown written for people and agents: it carries no HTML, but it does write placeholders like
// `stories/<locale>/<slug>.json` outside code spans, which marked would emit as (unknown, invisible) tags. Render any
// raw HTML as text instead.
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
marked.use({ renderer: { html: ({ text }) => escapeHtml(text) } });

export type Section = 'Guides' | 'Packages';

// Reading order and short titles. Guides read in this order; packages go core first, then the wrappers, the
// posting desk and the CLI (the order they are published in). Anything not listed sorts last under its H1.
const GUIDES: Record<string, string> = {
	architecture: 'Architecture',
	'content-model': 'Content model',
	'scene-authoring': 'Scene authoring',
	i18n: 'Languages',
	'voice-and-video': 'Voice and video'
};
const PACKAGES = ['emaki', 'emaki-svelte', 'emaki-react', 'emaki-vue', 'emaki-posting', 'emaki-cli'];

export type DocPage = { slug: string; section: Section; order: number; title: string; description: string; raw: string; html: string };

/** Anchor id from a heading's rendered inner HTML. Tags go (inline markup can split a word); an entity stands for
 *  punctuation, so it becomes a separator rather than leaking its name ("don-39-t"). Nothing is decoded back to `<`,
 *  so markup never re-enters the id attribute. */
function headingSlug(inner: string): string {
	return inner
		.replace(/<[^>]*>/g, '')
		.replace(/&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/gi, '-')
		.toLowerCase()
		.trim()
		.replace(/[^\w]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Gives every heading an id so in-page anchors resolve; the inner HTML is kept exactly as marked rendered it. */
export function addHeadingIds(html: string): string {
	return html.replace(/<(h[1-6])>(.*?)<\/\1>/g, (_all, tag, inner) => `<${tag} id="${headingSlug(inner)}">${inner}</${tag}>`);
}

/** llms links (`/llms/packages/emaki.txt`, `/llms/guides/i18n.md#x`) and bare guide links (`content-model.md`) go to
 *  their /docs page; any other repo-relative path goes to GitHub; external, anchor and mail links stay. */
export function rewriteLinks(html: string): string {
	return html.replace(/href="([^"]+)"/g, (all, href: string) => {
		if (/^(https?:)?\/\/|^#|^mailto:/i.test(href)) return all;
		const doc = href.match(/^(?:\/llms\/(?:guides|packages)\/|\.\/)?([a-z0-9-]+)\.(?:md|txt)(#[^"]*)?$/i);
		if (doc) return `href="/docs/${doc[1]}${doc[2] ?? ''}"`;
		if (!href.startsWith('/')) return `href="${REPO_BLOB}/${href.replace(/^\.\//, '')}"`;
		return all;
	});
}

const h1Of = (raw: string, fallback: string) => raw.match(/^#\s+(.+)$/m)?.[1].trim() ?? fallback;

/** The first prose paragraph after the H1, as plain text clamped for a meta description. */
function descriptionFrom(raw: string, fallback: string): string {
	for (const block of raw.replace(/^#\s+.+$/m, '').split(/\n\s*\n/)) {
		const t = block.trim();
		if (!t || /^(#|```|\||>|<|[-*]\s|\d+\.\s)/.test(t)) continue;
		const text = t
			.replace(/`([^`]+)`/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/\*+/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		if (text.length < 20) continue;
		return text.length > 155 ? text.slice(0, 152).trimEnd() + '…' : text;
	}
	return fallback;
}

export const pages: DocPage[] = Object.entries(raws)
	.map(([path, raw]) => {
		const [dir, file] = path.split('/').slice(-2);
		const slug = file.replace(/\.md$/, '');
		const section: Section = dir === 'packages' ? 'Packages' : 'Guides';
		const rank = section === 'Guides' ? Object.keys(GUIDES).indexOf(slug) : PACKAGES.indexOf(slug);
		const title = (section === 'Guides' && GUIDES[slug]) || h1Of(raw, slug);
		return {
			slug,
			section,
			order: (section === 'Guides' ? 0 : 100) + (rank < 0 ? 99 : rank),
			title,
			description: descriptionFrom(raw, `${title}: emaki documentation.`),
			raw,
			html: rewriteLinks(addHeadingIds(marked.parse(raw) as string))
		};
	})
	.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

export function findPage(slug: string): DocPage | undefined {
	return pages.find((p) => p.slug === slug);
}
