<script lang="ts">
	// One scene of the sample film with the two things a reader can change without re-authoring it: the language
	// (strings/<locale>.json) and the light (the film's dark look, or the page's mode).
	import { MotionScene } from '@senseihq/emaki-svelte';
	import type { Mode } from '@senseihq/emaki';
	import SectionHead from './SectionHead.svelte';
	import { FILM, showcase } from '$lib/data';

	let locale = $state<string>(showcase.locales[0].id);
	let mode = $state<Mode>('auto');
</script>

{#snippet choice(name: string, options: readonly { id: string; label: string }[], value: string, pick: (id: string) => void)}
	<fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
		<legend class="mb-2 p-0 font-mono text-label uppercase text-ink-soft">{name}</legend>
		<div class="inline-flex flex-wrap gap-1 rounded-lg border border-paper-edge bg-paper p-1">
			{#each options as o (o.id)}
				<label class="relative cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors focus-within:outline-2 focus-within:outline-primary {value === o.id ? 'bg-accent-soft text-primary font-medium' : 'text-ink-mute hover:text-ink'}">
					<input type="radio" class="pick" name={name} value={o.id} checked={value === o.id} onchange={() => pick(o.id)} />
					{o.label}
				</label>
			{/each}
		</div>
	</fieldset>
{/snippet}

<section id="showcase" class="dot-section">
	<div class="mx-auto grid max-w-content items-center gap-12 px-6 py-section lg:grid-cols-[1fr_1.3fr]">
		<div class="flex flex-col gap-8">
			<SectionHead eyebrow={showcase.eyebrow} title={showcase.title} lede={showcase.lede} />
			<div class="flex flex-wrap gap-6">
				{@render choice('Language', showcase.locales, locale, (id) => (locale = id))}
				{@render choice('Light', showcase.modes, mode, (id) => (mode = id as Mode))}
			</div>
		</div>
		<div data-testid="showcase-scene" class="overflow-hidden rounded-xl border border-paper-edge bg-paper-soft">
			<MotionScene film={FILM} scene={showcase.scene} {locale} {mode} />
		</div>
	</div>
</section>

<style>
	/* The real radio covers its label, transparent: the label's text is what shows, the input is what is clicked,
	   focused and announced. */
	.pick {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
</style>
