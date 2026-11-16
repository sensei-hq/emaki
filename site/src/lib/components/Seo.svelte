<script lang="ts">
	import { page } from '$app/state';
	import { canonicalFor, OG_IMAGE } from '$lib/seo';

	// Per-page title, description, canonical URL and Open Graph / Twitter tags. Site-wide constants live in app.html.
	let {
		title,
		description,
		type = 'website',
		image = OG_IMAGE
	}: { title: string; description: string; type?: 'website' | 'article'; image?: string } = $props();

	const canonical = $derived(canonicalFor(page.url.pathname));
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content={type} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={image} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
</svelte:head>
