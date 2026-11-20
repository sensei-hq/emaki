<script lang="ts">
  // An article figure: one scene, looping while it is on screen with a `hold` s rest on its last frame, or a still
  // under reduced motion. Pass `t` to drive it yourself. When the scene has sound (its slice of the film's score, its
  // narration, or both), a speaker button plays it in step with the loop (off until the reader turns it on). When the
  // scene has a voice line, a CC toggle captions it with an overlay. `sound`/`cc`/`voice` plus
  // `onsoundchange`/`onccchange` lift that state to the app: a defined prop drives the figure (the app wins over the
  // toggles) while every toggle still emits; undefined keeps per-instance toggles. <MotionScene film="..." scene="..." />
  import { onMount, untrack } from 'svelte';
  import { attachScene, DEFAULT_CHROME_ICONS, figurePlayer, sceneSound, type Layout, type Mode } from '@senseihq/emaki';

  let { film, scene, layout = 'figure', locale = 'en', mode = 'auto', autoplay = true, t = undefined, hold = 2, label = '', class: cls = '',
    sound = undefined, cc = undefined, voice = undefined, onsoundchange = undefined, onccchange = undefined }:
    { film: string; scene: string; layout?: Layout; locale?: string; mode?: Mode; autoplay?: boolean; t?: number; hold?: number; label?: string; class?: string;
      /** Controlled speaker: a defined value drives the sound (the app wins over the toggle). */ sound?: boolean;
      /** Controlled captions: a defined value shows or hides the overlay. */ cc?: boolean;
      /** Controlled voice cut: false plays the score without the narration. */ voice?: boolean;
      onsoundchange?: (on: boolean) => void; onccchange?: (on: boolean) => void } = $props();

  let host: HTMLDivElement;
  let width = $state(0);
  let hasSound = $state(false), soundOn = $state(false);
  let ccOn = $state(false), line = $state<string | null | undefined>(undefined);
  // What the figure shows: a defined prop wins over the per-instance toggle.
  const shownSound = $derived(sound ?? soundOn);
  const shownCc = $derived(cc ?? ccOn);
  const player = figurePlayer({ film: '', scene: '', layout: 'figure' });
  let view: ReturnType<typeof attachScene> | null = null;
  let snd: ReturnType<typeof sceneSound> | null = null;

  // The caption line, reloaded with the figure's language; a load a newer one overtook is dropped.
  let captionTicket = 0;
  function loadCaption() {
    const target = snd;
    if (!target) return;
    const mine = ++captionTicket;
    line = undefined;
    target.caption.then((text) => { if (mine === captionTicket) line = text; });
  }

  // A defined prop drives the figure: voice cuts or restores the narration (restoring while sounding re-cues
  // the take, which the cut stopped), sound toggles the speaker to match.
  async function applyControlled() {
    if (!snd) return;
    if (voice !== undefined && voice !== snd.voiceOn) {
      snd.setVoice(voice);
      if (voice && snd.on) await snd.cue(player.t);
    }
    if (sound !== undefined && sound !== snd.on) {
      await snd.toggle(player.t);
      soundOn = snd.on;
    }
  }

  onMount(() => {
    player.load({ film, scene, layout });
    player.hold = hold;
    snd = sceneSound(film, scene, locale);
    view = attachScene(host, player, { locale, mode, autoplay: autoplay && t === undefined, sound: snd });
    snd.available.then((ok) => (hasSound = ok && t === undefined && !player.still));
    loadCaption();
    void applyControlled();
    return () => view?.destroy();
  });
  $effect(() => { const ref = { film, scene, layout }; untrack(() => { if (view && (ref.film !== player.ref?.film || ref.scene !== player.ref?.scene || ref.layout !== player.ref?.layout)) player.load(ref); }); });
  $effect(() => { const l = locale; untrack(() => { view?.setLocale(l); if (snd) { snd.setLocale(l); loadCaption(); } }); });
  $effect(() => { view?.setMode(mode); });
  $effect(() => { player.hold = hold; });
  $effect(() => { if (t !== undefined && view) untrack(() => { player.pause(); player.seek(t!); }); });
  $effect(() => { if (width) view?.fit(width); });
  $effect(() => { sound; voice; untrack(() => { void applyControlled(); }); });

  async function toggleSound() {
    if (!snd) return;
    const next = !shownSound;
    onsoundchange?.(next);
    if (sound !== undefined) return;
    await snd.toggle(player.t);
    soundOn = snd.on;
  }

  function toggleCc() {
    const next = !shownCc;
    onccchange?.(next);
    if (cc === undefined) ccOn = next;
  }
</script>

<div class="motion-scene {cls}" bind:clientWidth={width} role="img" aria-label={label || undefined}>
  <div bind:this={host}></div>
  {#if line}
    <button class="emk-scene-cc" onclick={toggleCc} aria-pressed={shownCc} aria-label="Captions" title="Captions">
      <span aria-hidden="true">CC</span>
    </button>
    <p class="emk-scene-cap" aria-live="polite" hidden={!shownCc}>{line}</p>
  {/if}
  {#if hasSound}
    <button class="ms-snd" onclick={toggleSound} aria-pressed={shownSound} aria-label={shownSound ? 'Turn sound off' : 'Turn sound on'} title={shownSound ? 'Sound on' : 'Sound off'}>
      {@html shownSound ? DEFAULT_CHROME_ICONS.soundOn : DEFAULT_CHROME_ICONS.soundOff}
    </button>
  {/if}
</div>

<style>
  .motion-scene { position: relative; width: 100%; }
  .ms-snd, .emk-scene-cc {
    position: absolute; bottom: 10px; width: 34px; height: 34px; padding: 6px; border-radius: 50%;
    /* Its own colours, like video controls: it sits on the scene, whose mode can differ from the page's, so it must
       not borrow the page's text colour or system colours (Canvas turns dark with the OS). */
    border: 1px solid rgb(255 255 255 / 0.3); background: rgb(20 18 15 / 0.7); color: #fff;
    cursor: pointer; opacity: 0.8; transition: opacity 0.15s;
  }
  .ms-snd { right: 10px; }
  .emk-scene-cc { right: 52px; font: 700 11px/1 system-ui; letter-spacing: .04em; display: grid; place-items: center; }
  .ms-snd:hover, .ms-snd:focus-visible, .ms-snd[aria-pressed='true'],
  .emk-scene-cc:hover, .emk-scene-cc:focus-visible, .emk-scene-cc[aria-pressed='true'] { opacity: 1; }
  .ms-snd svg { width: 100%; height: 100%; fill: currentColor; }
  .emk-scene-cap {
    position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); max-width: 82%; margin: 0;
    padding: .35em .8em; border-radius: .4rem; background: rgb(20 18 15 / 0.78); color: #fff;
    font: 12px/1.4 system-ui; text-align: center;
  }
</style>
