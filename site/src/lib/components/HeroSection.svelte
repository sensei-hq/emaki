<script lang="ts">
	// The hero: what emaki is, and the sample film playing live beside it. The film's mode is left on auto, so it
	// follows the page's data-mode: flip the theme and the scenes go dark with it.
	import { Button } from '@rokkit/ui';
	import { MotionShow } from '@senseihq/emaki-svelte';
	import ArrowIcon from './ArrowIcon.svelte';
	import { FILM, hero } from '$lib/data';
</script>

<section class="relative overflow-hidden">
	<div class="pointer-events-none absolute inset-0 bg-dots mask-fade-b"></div>
	<div class="anim-rise relative mx-auto grid max-w-content items-center gap-12 px-6 pb-20 pt-16 md:pt-24 lg:grid-cols-[1fr_1.15fr]">
		<div class="flex flex-col items-start gap-6">
			<div class="inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-sm font-semibold text-primary">
				<span class="font-mono">{hero.badge[0]}</span>
				<span class="text-ink-soft">·</span>
				{hero.badge[1]}
			</div>
			<h1 class="m-0 font-display font-medium text-display text-ink text-balance">{hero.title}</h1>
			<p class="m-0 max-w-xl text-lg text-ink-mute text-pretty">{hero.lede}</p>
			<div class="flex flex-wrap items-center gap-3 pt-1">
				<Button href={hero.primaryCta.href} variant="primary" size="lg">
					{hero.primaryCta.label}
					<ArrowIcon />
				</Button>
				<Button href={hero.secondaryCta.href} variant="default" style="outline" size="lg">
					{hero.secondaryCta.label}
				</Button>
			</div>
		</div>
		<figure class="m-0 flex flex-col gap-3">
			<div
				data-testid="hero-film"
				class="overflow-hidden rounded-xl border border-paper-edge bg-paper-soft"
				style="aspect-ratio: 16 / 10.4; box-shadow: 0 30px 80px -40px color-mix(in oklch, var(--ink) 35%, transparent)"
			>
				<MotionShow film={FILM} loop />
			</div>
			<figcaption class="px-1 font-mono text-xs text-ink-soft">{hero.note}</figcaption>
		</figure>
	</div>
</section>
