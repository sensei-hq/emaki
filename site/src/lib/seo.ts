// Canonical origin (production), for canonical links, og:url and llms.txt.
export const SITE_URL = 'https://emaki.sensei-hq.com';

/** Default social share image (absolute URL). */
export const OG_IMAGE = `${SITE_URL}/favicon.svg`;

/** Absolute canonical URL for a pathname, without a trailing slash (except the root). */
export function canonicalFor(pathname: string): string {
	return SITE_URL + (pathname !== '/' ? pathname.replace(/\/+$/, '') : '/');
}
