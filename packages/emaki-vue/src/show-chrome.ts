// A MotionShow's standard chrome: mounted into the host div below the stage once a show is there,
// dropped with it (and on controls off or unmount), its toggles bridged to the controlled props. Under
// a controlled prop a press only emits: the prop, not the press, drives the player.
import { onBeforeUnmount, watch, type Ref, type ShallowRef, type VNodeRef } from 'vue';
import { mountPlayerChrome, type PlayerChrome, type PlayerChromeOptions } from '@senseihq/emaki';
import { controlledToggle, type Show } from './composables.js';

/** The chrome's props, read live (input changes remount it; controlled props drive it in place). */
export interface ShowChromeProps {
  readonly film: string; readonly locale: string; readonly controls: boolean;
  readonly playerHref: string; readonly fullscreenHref: string; readonly voiceToggle: boolean;
  readonly sound: boolean | undefined; readonly cc: boolean | undefined; readonly voice: boolean | undefined;
  readonly icons: PlayerChromeOptions['icons']; readonly renderTick: PlayerChromeOptions['renderTick'];
}

export interface ChromeEmit {
  sound: (on: boolean) => void;
  cc: (on: boolean) => void;
  voice: (on: boolean) => void;
}

// M reaches straight into the show: emit the request, and under a defined sound keep it from the
// chrome. (V and C arrive as toggle clicks, which the wrapped handlers see.)
function chromeKeyCapture(show: ShallowRef<Show | null>, props: ShowChromeProps, emit: ChromeEmit, e: KeyboardEvent): void {
  if (e.key.toLowerCase() !== 'm') return;
  emit.sound(!(props.sound ?? show.value!.state.sound));
  if (props.sound === undefined) return;
  e.stopImmediatePropagation();
  e.preventDefault();
}

/** Mounts the standard chrome into the host div (its captions pinned over the stage); returns the callback ref. */
export function useShowChrome(stage: Ref<HTMLElement | null>, show: ShallowRef<Show | null>, props: ShowChromeProps, emit: ChromeEmit): Exclude<VNodeRef, string | Ref> {
  let chrome: PlayerChrome | null = null;
  let chromeEl: HTMLElement | null = null;
  // Controlled captions live one level down: the chrome owns the CC toggle state, so this mirrors it
  // (chromeCc) and keeps the chrome's original CC handler (ccOrig) to drive it with. Both reset with
  // the chrome: a remount starts from a fresh, captions-off chrome.
  let chromeCc = false, ccOrig: (() => void) | null = null;
  const applyCc = () => {
    if (props.cc === undefined || props.cc === chromeCc || !ccOrig) return;
    ccOrig();
    chromeCc = props.cc;
  };
  let keyCapture: ((e: KeyboardEvent) => void) | null = null;
  const dropChrome = () => {
    if (keyCapture) chromeEl!.removeEventListener('keydown', keyCapture, true);
    keyCapture = null;
    chrome?.destroy(); chrome = null; chromeEl = null; ccOrig = null; chromeCc = false;
  };
  // Vue re-invokes callback refs on re-render: remount only for a new host, or toggles (CC/mute)
  // would wipe on every scene change. Input changes remount through the watch below instead.
  // Controlled props never remount: they drive the show and the chrome in place (see the watches).
  const mount = (host: HTMLElement) => {
    dropChrome();
    chromeEl = host;
    chrome = mountPlayerChrome(host, show.value!, { film: props.film, locale: props.locale, stage: stage.value!,
      playerHref: props.playerHref || props.fullscreenHref || undefined, icons: props.icons, renderTick: props.renderTick,
      voiceToggle: props.voiceToggle });
    // The chrome's own toggles stay the interaction point, but under a controlled prop a press only
    // emits: the prop, not the press, drives the player. (The buttons always exist right after mount;
    // the chrome only removes CC/VO later, when the film has no voice lines.)
    const mute = host.querySelector('.emk-mute') as HTMLButtonElement, vo = host.querySelector('.emk-voice') as HTMLButtonElement | null,
      cc = host.querySelector('.emk-cc') as HTMLButtonElement;
    const origMute = mute.onclick as () => void, origCc = cc.onclick as () => void;
    ccOrig = origCc;
    mute.onclick = () => controlledToggle(props.sound, !show.value!.state.sound, (on) => emit.sound(on), origMute);
    if (vo) {
      const origVo = vo.onclick as () => void;
      vo.onclick = () => controlledToggle(props.voice, !show.value!.state.voiceOn, (on) => emit.voice(on), origVo);
    }
    cc.onclick = () => controlledToggle(props.cc, !chromeCc, (on) => emit.cc(on), () => { chromeCc = !chromeCc; origCc(); });
    keyCapture = (e: KeyboardEvent) => chromeKeyCapture(show, props, emit, e);
    host.addEventListener('keydown', keyCapture, true);
    applyCc();
  };
  const chromeHost: Exclude<VNodeRef, string | Ref> = (host) => {
    if (!host) { dropChrome(); return; }
    if (chromeEl === host) return;
    mount(host as HTMLElement);
  };
  watch([() => props.controls, () => props.playerHref, () => props.fullscreenHref, () => props.icons, () => props.renderTick, () => props.voiceToggle], () => {
    if (chromeEl) mount(chromeEl);
  });
  watch(() => props.cc, applyCc);
  onBeforeUnmount(dropChrome);
  return chromeHost;
}
