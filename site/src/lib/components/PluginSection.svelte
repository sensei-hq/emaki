<script lang="ts">
	import SectionHead from './SectionHead.svelte';
	import Chip from './Chip.svelte';
	import { plugin } from '$lib/data';
</script>

<section id="plugin" class="dot-section">
	<div class="mx-auto max-w-content px-6 py-section">
		<SectionHead eyebrow={plugin.eyebrow} title={plugin.title} lede={plugin.lede} />
		<div class="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
			{#each plugin.skills as s (s.name)}
				<div class="flex flex-col gap-2 rounded-xl border border-paper-edge bg-paper-mute p-6">
					<span class="font-mono text-sm font-semibold text-primary">{s.name}</span>
					<p class="m-0 text-sm text-ink-mute text-pretty">{s.body}</p>
				</div>
			{/each}
		</div>
		<div class="mt-8 flex flex-wrap items-center gap-2">
			<span class="mr-2 font-mono text-label uppercase text-ink-soft">Agents</span>
			{#each plugin.agents as a (a)}
				<Chip label={a} tone="accent" />
			{/each}
		</div>
	</div>
</section>
