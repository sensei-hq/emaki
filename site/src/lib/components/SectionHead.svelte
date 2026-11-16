<script lang="ts">
	import Eyebrow from './Eyebrow.svelte';

	let { eyebrow, title, lede = '', align = 'left' }: { eyebrow: string; title: string; lede?: string; align?: 'left' | 'center' } =
		$props();
</script>

<div class="flex flex-col gap-4 {align === 'center' ? 'mx-auto items-center text-center' : 'items-start'}">
	<Eyebrow>{eyebrow}</Eyebrow>
	<h2 class="max-w-2xl font-display font-medium text-h2 text-ink text-balance">{title}</h2>
	{#if lede}
		<p class="max-w-2xl text-lg text-ink-mute text-pretty">{lede}</p>
	{/if}
</div>
