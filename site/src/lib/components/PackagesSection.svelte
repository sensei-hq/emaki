<script lang="ts">
	import SectionHead from './SectionHead.svelte';
	import Chip from './Chip.svelte';
	import { packages } from '$lib/data';
</script>

<section id="packages" class="border-y border-line bg-paper-soft">
	<div class="mx-auto max-w-content px-6 py-section">
		<SectionHead eyebrow={packages.eyebrow} title={packages.title} />
		<div class="mt-12 grid gap-5 md:grid-cols-2">
			{#each packages.items as p (p.name)}
				<div class="flex flex-col gap-4 rounded-xl border border-paper-edge bg-paper p-7 transition-colors hover:border-accent">
					<a href={p.href} class="font-mono font-semibold text-lg text-ink hover:text-primary">{p.name}</a>
					<p class="m-0 text-sm text-ink-mute text-pretty leading-relaxed">{p.body}</p>
					<div class="flex flex-wrap gap-2">
						{#each p.chips as c (c)}
							<Chip label={c} />
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
