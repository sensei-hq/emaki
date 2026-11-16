// Vue reactivity over the core: the core notifies, a shallowRef version makes reads tracked.
import { onBeforeUnmount, shallowRef, ref, watch, type Ref } from 'vue';
import type { createShow, Layout, ScenePlayerState } from '@senseihq/emaki';

/** A reactive view of a ScenePlayerState: read `state.value.t` etc. in templates; call methods on the player. */
export function useScenePlayer(player: ScenePlayerState) {
  const version = ref(player.version);
  const off = player.subscribe(() => { version.value = player.version; });
  onBeforeUnmount(off);
  const snap = () => ({ t: player.t, dur: player.dur, status: player.status, error: player.error, playing: player.playing, key: player.key, version: version.value });
  const state = shallowRef(snap());
  watch(version, () => { state.value = snap(); });
  return state;
}

export type Show = Awaited<ReturnType<typeof createShow>>;
export interface ShowState { index: number; local: number; playing: boolean; sound: boolean; layout: Layout }

/** Reactive state of a story player controller (from <MotionShow @ready>). */
export function useShowState(show: Ref<Show | null>) {
  const state = shallowRef<ShowState | null>(null);
  let off: (() => void) | null = null;
  watch(show, (s) => {
    off?.(); off = null;
    state.value = s ? { ...s.state } : null;
    if (s) off = s.on((x) => { state.value = { ...x }; }) as () => void;
  }, { immediate: true });
  onBeforeUnmount(() => off?.());
  return state;
}

/** Size of an element via ResizeObserver. */
export function useSize(el: Ref<HTMLElement | null>) {
  const size = shallowRef({ w: 0, h: 0 });
  let ro: ResizeObserver | null = null;
  watch(el, (e) => {
    ro?.disconnect();
    if (!e) return;
    ro = new ResizeObserver(([x]) => { size.value = { w: x.contentRect.width, h: x.contentRect.height }; });
    ro.observe(e);
  }, { immediate: true, flush: 'post' });
  onBeforeUnmount(() => ro?.disconnect());
  return size;
}
