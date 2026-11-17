<script lang="ts">
	// A code surface in two forms: one file (a title bar with its name and a copy button) or tabs (one per sample).
	type Tab = { id: string; label: string; code: string };
	let { filename = 'code', code = '', copyable = true, tabs }: { filename?: string; code?: string; copyable?: boolean; tabs?: Tab[] } =
		$props();

	let picked = $state<string | null>(null);
	const current = $derived(tabs?.find((t) => t.id === picked) ?? tabs?.[0]);
	const shown = $derived(tabs?.length ? (current?.code ?? '') : code);

	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(shown);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// no clipboard (an insecure origin or a test): leave the button as it was
		}
	}
</script>

<div class="code-surface overflow-hidden" style="border-radius:14px; border:1px solid var(--code-border); box-shadow:var(--code-shadow)">
	{#if tabs?.length}
		<div class="flex items-center overflow-x-auto" role="tablist" style="background:var(--code-bar); gap:2px; padding:8px 10px 0; border-bottom:1px solid var(--code-border)">
			{#each tabs as t (t.id)}
				<button
					role="tab"
					aria-selected={t.id === current?.id}
					onclick={() => (picked = t.id)}
					class="font-mono"
					style="appearance:none; border:none; cursor:pointer; font-size:13px; font-weight:500; padding:9px 14px; border-radius:8px 8px 0 0; {t.id === current?.id
						? 'color:var(--code-text); background:var(--code-bg);'
						: 'color:var(--code-idle); background:transparent;'}"
				>
					{t.label}
				</button>
			{/each}
		</div>
	{:else}
		<div class="flex items-center gap-2" style="background:var(--code-bar); padding:11px 14px; border-bottom:1px solid var(--code-border)">
			<span class="font-mono" style="font-size:12.5px; color:var(--code-idle)">{filename}</span>
			{#if copyable}
				<button
					onclick={copy}
					class="font-mono"
					aria-label="Copy code to clipboard"
					style="margin-left:auto; appearance:none; border:none; cursor:pointer; font-size:11.5px; color:var(--code-idle); background:var(--code-copy-bg); padding:4px 10px; border-radius:6px"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			{/if}
		</div>
	{/if}
	<pre class="font-mono" style="margin:0; background:var(--code-bg); color:var(--code-text); padding:20px; font-size:13.5px; line-height:1.75; overflow-x:auto">{shown}</pre>
</div>
