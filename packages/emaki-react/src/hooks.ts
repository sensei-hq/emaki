// React state over the core: the core notifies, useSyncExternalStore re-renders. Nothing here touches the DOM.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ScenePlayerState, type createShow, type Layout, type SceneRef } from '@senseihq/emaki';

/** Re-renders whenever the player changes; returns it for reads (p.t, p.playing, p.status) and calls (p.seek(2)). */
export function useScenePlayer(player: ScenePlayerState) {
  useSyncExternalStore(
    (cb) => player.subscribe(cb),
    () => player.version,
    () => player.version,
  );
  return player;
}

/** A player you own, created once and pointed at `ref` (reloads when film, scene or layout change). */
export function usePlayerFor(ref: SceneRef | null) {
  const player = useMemo(() => new ScenePlayerState(), []);
  const key = ref ? `${ref.film}:${ref.scene}:${ref.layout}:${ref.src ?? ''}` : '';
  useEffect(() => { if (ref) player.load(ref); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useScenePlayer(player);
}

export type Show = Awaited<ReturnType<typeof createShow>>;
export interface ShowState { index: number; local: number; playing: boolean; sound: boolean; voiceOn: boolean; layout: Layout; started: boolean }

/** State of a story player controller (from <MotionShow onReady>): re-renders on scene, play, sound, layout changes,
 *  and follows the playhead (read once a frame; it moves without notifications). `started` is false on a poster. */
export function useShowState(show: Show | null): ShowState | null {
  const [st, setSt] = useState<ShowState | null>(show ? show.state : null);
  useEffect(() => {
    if (!show) return setSt(null);
    setSt(show.state);
    const off = show.on((s) => setSt({ ...s }));
    let raf = 0;
    const follow = () => {
      const local = show.state.local;
      setSt((s) => (s && s.local !== local ? { ...s, local } : s));
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [show]);
  return st;
}

/** Width of an element, tracked with a ResizeObserver. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [s, setS] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setS({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, s] as const;
}
