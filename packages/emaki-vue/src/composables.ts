// Vue reactivity over the core: the core notifies, a shallowRef version makes reads tracked.
import { onBeforeUnmount, shallowRef, ref, toRaw, watch, type Ref } from 'vue';
import type { createShow, Layout, ScenePlayerState } from '@senseihq/emaki';

/** A reactive view of a ScenePlayerState: read `state.value.t` etc. in templates; call methods on the player.
 *  A player kept in a ref or reactive() arrives as a proxy, which cannot reach the class's private fields: use the
 *  object behind it. */
export function useScenePlayer(held: ScenePlayerState) {
  const player = toRaw(held);
  const version = ref(player.version);
  const off = player.subscribe(() => { version.value = player.version; });
  onBeforeUnmount(off);
  const snap = () => ({ t: player.t, dur: player.dur, status: player.status, error: player.error, playing: player.playing, key: player.key, version: version.value });
  const state = shallowRef(snap());
  watch(version, () => { state.value = snap(); });
  return state;
}

export type Show = Awaited<ReturnType<typeof createShow>>;
export interface ShowState { index: number; local: number; playing: boolean; sound: boolean; layout: Layout; started: boolean }

/** Reactive state of a story player controller (from <MotionShow @ready>), following the playhead (read once a
 *  frame; it moves without notifications). `started` is false on a poster. */
export function useShowState(show: Ref<Show | null>) {
  const state = shallowRef<ShowState | null>(null);
  let off: (() => void) | null = null, raf = 0;
  const follow = () => {
    const s = show.value, x = state.value;
    if (s && x && s.state.local !== x.local) state.value = { ...x, local: s.state.local };
    raf = requestAnimationFrame(follow);
  };
  watch(show, (s) => {
    off?.(); off = null; cancelAnimationFrame(raf);
    state.value = s ? { ...s.state } : null;
    if (s) { off = s.on((x) => { state.value = { ...x }; }) as () => void; raf = requestAnimationFrame(follow); }
  }, { immediate: true });
  onBeforeUnmount(() => { off?.(); cancelAnimationFrame(raf); });
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
