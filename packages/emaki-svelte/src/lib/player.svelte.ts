// Svelte 5 reactivity over the core's framework-free state: the core notifies, a $state counter makes reads tracked.
import type { createShow, Layout, ScenePlayerState } from '@senseihq/emaki';

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

/** Reactive state of a story player (createShow): index, playing, sound, layout, plus the controller as `api`. */
export function reactiveShow() {
  let api = $state<Show | null>(null);
  let st = $state({ index: 0, local: 0, playing: false, sound: false, layout: 'landscape' as Layout });
  let off: (() => void) | null = null;
  return {
    get api() { return api; },
    get index() { return st.index; },
    get playing() { return st.playing; },
    get sound() { return st.sound; },
    get layout() { return st.layout; },
    get count() { return api?.timeline.scenes.length ?? 0; },
    attach(s: Show) { api = s; st = { ...s.state }; off = s.on((x) => { st = { ...x }; }) as () => void; },
    detach() { off?.(); api?.destroy(); api = null; },
  };
}
