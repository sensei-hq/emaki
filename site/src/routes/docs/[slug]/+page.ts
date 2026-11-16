import { error } from '@sveltejs/kit';
import { findPage, pages } from '$lib/docs';

export const prerender = true;

/** One prerendered HTML file per docs page. */
export function entries() {
	return pages.map((p) => ({ slug: p.slug }));
}

export function load({ params }: { params: { slug: string } }) {
	if (!findPage(params.slug)) error(404, `No docs page "${params.slug}"`);
	return { slug: params.slug };
}
