// Canonical origin (production), for canonical links, og:url and llms.txt.
export const SITE_URL = 'https://emaki.sensei-hq.com';

/** Default social share image (absolute URL): the 512 px icon, since social cards do not render SVG. */
export const OG_IMAGE = `${SITE_URL}/icon-512.png`;

/** Absolute canonical URL for a pathname, without a trailing slash (except the root). */
export function canonicalFor(pathname: string): string {
	return SITE_URL + (pathname !== '/' ? pathname.replace(/\/+$/, '') : '/');
}
