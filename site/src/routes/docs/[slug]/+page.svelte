<script lang="ts">
	import { findPage, pages } from '$lib/docs';
	import Seo from '$lib/components/Seo.svelte';

	let { data }: { data: { slug: string } } = $props();

	const current = $derived(findPage(data.slug));
	const idx = $derived(pages.findIndex((p) => p.slug === data.slug));
	const prev = $derived(idx > 0 ? pages[idx - 1] : undefined);
	const next = $derived(idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : undefined);
	const sections = ['Guides', 'Packages'] as const;
</script>

<Seo title="{current?.title ?? 'Docs'}: emaki" description={current?.description ?? 'emaki documentation.'} type="article" />

<div class="mx-auto grid max-w-content gap-12 px-6 py-16 md:grid-cols-[15rem_1fr]">
	<aside class="md:sticky md:top-24 md:self-start">
		<a href="/docs" class="font-mono text-label uppercase text-ink-soft hover:text-ink">Docs</a>
		{#each sections as s (s)}
			<div class="mt-6 px-3 font-mono text-xs uppercase tracking-wider text-ink-soft">{s}</div>
			<nav class="mt-2 flex flex-col gap-1" aria-label={s}>
				{#each pages.filter((p) => p.section === s) as p (p.slug)}
					<a
						href="/docs/{p.slug}"
						aria-current={p.slug === data.slug ? 'page' : undefined}
						class="rounded-md px-3 py-1.5 text-sm transition-colors {p.slug === data.slug ? 'bg-accent-soft font-medium text-primary' : 'text-ink-mute hover:bg-paper-soft hover:text-ink'}"
					>
						{p.title}
					</a>
				{/each}
			</nav>
		{/each}
	</aside>

	<article class="min-w-0">
		{#if current}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own docs/llms, rendered at build time -->
			<div class="doc-prose text-ink-mute">{@html current.html}</div>
		{/if}
		<div class="mt-16 flex items-center justify-between gap-4 border-t border-paper-edge pt-6">
			{#if prev}
				<a href="/docs/{prev.slug}" class="text-sm text-ink-mute hover:text-primary">← {prev.title}</a>
			{:else}
				<span></span>
			{/if}
			{#if next}
				<a href="/docs/{next.slug}" class="text-sm text-ink-mute hover:text-primary">{next.title} →</a>
			{/if}
		</div>
	</article>
</div>

<style>
	.doc-prose {
		line-height: 1.7;
		font-size: 0.95rem;
	}
	.doc-prose :global(h1),
	.doc-prose :global(h2),
	.doc-prose :global(h3) {
		font-family: Fraunces, Georgia, serif;
		font-weight: 500;
		color: var(--ink);
	}
	.doc-prose :global(h1) {
		font-size: 2.1rem;
		letter-spacing: -0.02em;
		line-height: 1.15;
		margin: 0 0 1.25rem;
	}
	.doc-prose :global(h2) {
		font-size: 1.45rem;
		margin: 2.75rem 0 1rem;
	}
	.doc-prose :global(h3) {
		font-size: 1.15rem;
		margin: 2rem 0 0.75rem;
	}
	.doc-prose :global(p),
	.doc-prose :global(ul),
	.doc-prose :global(ol),
	.doc-prose :global(table) {
		margin: 0 0 1.1rem;
	}
	.doc-prose :global(ul),
	.doc-prose :global(ol) {
		padding-left: 1.4rem;
	}
	.doc-prose :global(li) {
		margin: 0.35rem 0;
	}
	.doc-prose :global(a) {
		color: var(--primary);
	}
	.doc-prose :global(a:hover) {
		text-decoration: underline;
	}
	.doc-prose :global(strong) {
		font-weight: 600;
		color: var(--ink);
	}
	.doc-prose :global(code) {
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
		font-size: 0.85em;
		padding: 0.12rem 0.35rem;
		border-radius: 0.35rem;
		background: color-mix(in oklch, var(--ink) 8%, transparent);
	}
	.doc-prose :global(pre) {
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		line-height: 1.65;
		padding: 1.1rem 1.25rem;
		border-radius: 0.85rem;
		overflow-x: auto;
		background: color-mix(in oklch, var(--ink) 5%, transparent);
		border: 1px solid var(--paper-edge);
		margin: 0 0 1.4rem;
	}
	.doc-prose :global(pre code) {
		padding: 0;
		background: none;
		font-size: inherit;
	}
	.doc-prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
		display: block;
		overflow-x: auto;
	}
	.doc-prose :global(th),
	.doc-prose :global(td) {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--paper-edge);
	}
	.doc-prose :global(blockquote) {
		border-left: 3px solid color-mix(in oklch, var(--primary) 50%, transparent);
		padding-left: 1rem;
		margin: 0 0 1.1rem;
	}
</style>
