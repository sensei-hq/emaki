<script lang="ts">
  // A scene driven by a ScenePlayerState you own (an editor, an admin preview, a step-through): the state holds what
  // is loaded and where the playhead is; this mounts, renders and runs the clock. Remounts when player.key changes.
  import { onMount } from 'svelte';
  import { attachScene, type Mode, type ScenePlayerState } from '@senseihq/emaki';
  import { reactivePlayer } from './player.svelte.js';

  let { player, locale = 'en', mode = 'auto', controls = false }: { player: ScenePlayerState; locale?: string; mode?: Mode; controls?: boolean } = $props();
  const p = reactivePlayer(() => player);
  let host: HTMLDivElement;
  let width = $state(0);
  let view: ReturnType<typeof attachScene> | null = null;

  onMount(() => {
    view = attachScene(host, player, { locale, mode });
    return () => view?.destroy();
  });
  $effect(() => { view?.setLocale(locale); });
  $effect(() => { view?.setMode(mode); });
  $effect(() => { if (width) view?.fit(width); });
</script>

<div class="motion-player" bind:clientWidth={width}>
  <div bind:this={host}></div>
  {#if p.status === 'error'}
    <p class="mp-msg mp-error" role="alert">{p.error}</p>
  {:else if p.status === 'idle'}
    <p class="mp-msg">Loading the scene…</p>
  {/if}
  {#if controls && p.status === 'ready'}
    <div class="mp-bar">
      <button onclick={() => player.toggle()} aria-label={p.playing ? 'Pause' : 'Play'}>{p.playing ? '❚❚' : '▶'}</button>
      <input type="range" aria-label="Seek" min="0" max={p.dur} step="0.05" value={p.t} oninput={(e) => player.seek(Number(e.currentTarget.value))} />
      <span>{p.t.toFixed(1)} / {p.dur.toFixed(1)}</span>
    </div>
  {/if}
</div>

<style>
  .motion-player { position: relative; width: 100%; }
  .mp-msg { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; font: 14px system-ui; opacity: .7; }
  .mp-error { color: #b42318; padding: 0 24px; text-align: center; opacity: 1; }
  .mp-bar { display: flex; align-items: center; gap: 12px; margin-top: 10px; font: 12px ui-monospace, monospace; }
  .mp-bar button { width: 34px; height: 34px; border-radius: 50%; border: 1px solid currentColor; background: none; cursor: pointer; color: inherit; }
  .mp-bar input { flex: 1; }
</style>
