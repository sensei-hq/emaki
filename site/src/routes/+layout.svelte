<script lang="ts">
	import 'virtual:uno.css';
	import '@fontsource/fraunces/400.css';
	import '@fontsource/fraunces/500.css';
	import '@fontsource/inter/400.css';
	import '@fontsource/inter/500.css';
	import '@fontsource/inter/600.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import '../app.css';
	import { vibe } from '@rokkit/states';
	import { themable } from '@rokkit/actions';
	import { browser } from '$app/environment';
	import { startMotion } from '$lib/emaki';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';

	let { children } = $props();

	// Seed vibe from the mode the pre-paint themeHook resolved; `use:themable` then owns data-mode on <html> and
	// <body> (and storage, and other tabs). The films' scenes follow that same data-mode. One style only: zen-sumi.
	if (browser) {
		vibe.allowedStyles = ['zen-sumi'];
		vibe.style = 'zen-sumi';
		const dm = document.documentElement.dataset.mode;
		if (dm === 'light' || dm === 'dark') vibe.mode = dm;
		startMotion();
	}
</script>

<svelte:body use:themable={{ theme: vibe, storageKey: 'emaki-theme' }} />

<div class="flex min-h-screen flex-col">
	<SiteHeader />
	<main class="flex-1">
		{@render children()}
	</main>
	<SiteFooter />
</div>
