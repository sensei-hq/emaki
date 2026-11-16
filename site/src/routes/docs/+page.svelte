<script lang="ts">
	import Eyebrow from '$lib/components/Eyebrow.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import CodeFrame from '$lib/components/CodeFrame.svelte';
	import { pages } from '$lib/docs';
	import { INIT } from '$lib/data';

	const sections = ['Guides', 'Packages'] as const;
</script>

<Seo title="Docs: emaki" description="Guides and package references for emaki: architecture, the content model, scene authoring, languages, voice and video, and every package." />

<section class="dot-section">
	<div class="mx-auto max-w-content px-6 py-section">
		<div class="flex flex-col gap-4">
			<Eyebrow>Documentation</Eyebrow>
			<h1 class="m-0 font-display font-medium text-h2 text-ink">Docs</h1>
			<p class="m-0 max-w-2xl text-lg text-ink-mute text-pretty">
				Written to be easy for people and coding agents to follow. Also as
				<a href="/llms.txt" class="text-primary hover:underline">/llms.txt</a> and
				<a href="/llms-full.txt" class="text-primary hover:underline">/llms-full.txt</a>.
			</p>
		</div>

		<div class="mt-8 rounded-xl border border-paper-edge bg-paper-mute p-6">
			<div class="font-display font-medium text-lg text-ink">Start a project</div>
			<p class="m-0 mt-1 max-w-2xl text-sm text-ink-mute text-pretty">
				Detects your framework and writes the sample story, the film source, the capture route and the Claude plugin.
			</p>
			<div class="mt-4 max-w-xl"><CodeFrame filename="terminal" code={INIT} /></div>
		</div>

		{#each sections as s (s)}
			<h2 class="mb-0 mt-14 font-display font-medium text-2xl text-ink">{s}</h2>
			<div class="mt-5 grid gap-4 sm:grid-cols-2">
				{#each pages.filter((p) => p.section === s) as p (p.slug)}
					<a href="/docs/{p.slug}" class="group flex items-center justify-between gap-4 rounded-xl border border-paper-edge bg-paper-mute p-6 transition-colors hover:border-accent">
						<span class="flex flex-col gap-1">
							<span class="font-display font-medium text-xl text-ink">{p.title}</span>
							<span class="text-sm text-ink-mute text-pretty">{p.description}</span>
						</span>
						<span class="text-primary transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
					</a>
				{/each}
			</div>
		{/each}
	</div>
</section>
