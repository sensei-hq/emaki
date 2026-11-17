// Svelte 5 reactivity over the core's framework-free state: the core notifies, a $state counter makes reads tracked.
import { ticks as showTicks, type createShow, type Layout, type ScenePlayerState } from '@senseihq/emaki';

/** Reactive reads of a ScenePlayerState: `p.t`, `p.playing`, `p.status` update the UI as the player changes. */
export function reactivePlayer(get: () => ScenePlayerState) {
  let v = $state(0);
  $effect(() => get().subscribe(() => { v++; }));
  const read = <T>(f: (p: ScenePlayerState) => T) => () => { v; return f(get()); };
  return {
    get t() { return read((p) => p.t)(); },
    get dur() { return read((p) => p.dur)(); },
    get status() { return read((p) => p.status)(); },
    get error() { return read((p) => p.error)(); },
    get playing() { return read((p) => p.playing)(); },
    get key() { return read((p) => p.key)(); },
    get ref() { return read((p) => p.ref)(); },
  };
}

type Show = Awaited<ReturnType<typeof createShow>>;
export type ShowHandle = ReturnType<typeof reactiveShow>;

/** Reactive state of a story player (createShow): index, playhead, playing, sound, layout, whether it has started
 *  (a poster has not), per-scene progress ticks, plus the controller as `api`. The playhead is read once a frame. */
export function reactiveShow() {
  let api = $state<Show | null>(null);
  let st = $state({ index: 0, local: 0, playing: false, sound: false, layout: 'landscape' as Layout, started: true });
  let off: (() => void) | null = null, raf = 0;
  const follow = () => {
    if (api && api.state.local !== st.local) st.local = api.state.local;
    raf = requestAnimationFrame(follow);
  };
  return {
    get api() { return api; },
    get index() { return st.index; },
    get local() { return st.local; },
    get playing() { return st.playing; },
    get sound() { return st.sound; },
    get layout() { return st.layout; },
    get started() { return st.started; },
    get count() { return api?.timeline.scenes.length ?? 0; },
    get ticks() { void st.index; void st.local; return api ? showTicks(api) : []; },
    attach(s: Show) {
      api = s; st = { ...s.state }; off = s.on((x) => { st = { ...x }; }) as () => void;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(follow);
    },
    detach() { cancelAnimationFrame(raf); off?.(); api?.destroy(); api = null; },
  };
}
