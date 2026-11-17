import { pages } from '$lib/docs';

export const prerender = true;

/** Every docs page, concatenated in reading order, for agents that want the whole corpus in one fetch. */
export function GET() {
	return new Response(pages.map((p) => p.raw.trim()).join('\n\n---\n\n') + '\n', {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}
