<script lang="ts">
	// The emaki mark: a picture scroll (emaki) unrolled between its two rods, three frames on the band.
	let { class: cls = '' }: { class?: string } = $props();
</script>

<svg viewBox="0 0 32 32" class={cls} aria-hidden="true" fill="none">
	<rect x="3" y="5" width="4" height="22" rx="2" fill="currentColor" />
	<rect x="25" y="5" width="4" height="22" rx="2" fill="currentColor" />
	<rect x="7" y="8" width="18" height="16" rx="1.5" fill="var(--primary)" opacity="0.14" />
	<rect x="9" y="12" width="4" height="8" rx="1" fill="var(--primary)" />
	<rect x="14" y="12" width="4" height="8" rx="1" fill="var(--primary)" opacity="0.7" />
	<rect x="19" y="12" width="4" height="8" rx="1" fill="var(--primary)" opacity="0.4" />
</svg>
