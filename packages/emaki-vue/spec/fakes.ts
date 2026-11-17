// Stand-ins for the core's DOM side (attachScene, createShow) and the browser's ResizeObserver, so a spec can drive
// what the wrapper binds to and watch what the wrapper asks of it.
import { vi } from 'vitest';
import type { Layout } from '@senseihq/emaki';

export type ShowState = { index: number; local: number; playing: boolean; sound: boolean; layout: Layout; started: boolean };

/** A story player controller with the core's surface; its state moves the way the real one's does. */
export function fakeShow(scenes = 3, started = true) {
  const listeners = new Set<(s: ShowState) => void>();
  const st: ShowState = { index: 0, local: 0, playing: true, sound: false, layout: 'landscape', started };
  const emit = () => listeners.forEach((l) => l({ ...st }));
  const go = (i: number) => { st.index = (i + scenes) % scenes; st.local = 0; emit(); };
  return {
    listeners,
    film: { slug: 'film' },
    timeline: { duration: scenes * 2, scenes: Array.from({ length: scenes }, (_, i) => ({ id: `s${i}`, name: `Scene ${i + 1}`, start: i * 2, dur: 2 })) },
    get state() { return { ...st }; },
    /** Move the playhead without a notification, as the clock does between frames. */
    advance(local: number) { st.local = local; },
    on(l: (s: ShowState) => void) { listeners.add(l); return () => listeners.delete(l); },
    next: vi.fn(() => go(st.index + 1)),
    prev: vi.fn(() => go(st.index - 1)),
    go: vi.fn(go),
    play: vi.fn(() => { st.playing = true; emit(); }),
    pause: vi.fn(() => { st.playing = false; emit(); }),
    toggle: vi.fn(() => { st.playing = !st.playing; emit(); }),
    start: vi.fn(async () => { st.started = true; emit(); }),
    replay: vi.fn(),
    restart: vi.fn(),
    setSound: vi.fn((on: boolean) => { st.sound = on; emit(); }),
    setLayout: vi.fn((l: Layout) => { st.layout = l; emit(); }),
    seek: vi.fn(async () => {}),
    fit: vi.fn(),
    destroy: vi.fn(() => listeners.clear()),
  };
}
export type FakeShow = ReturnType<typeof fakeShow>;

/** What attachScene hands back: every call recorded. */
export function fakeView() {
  return { fit: vi.fn(), setLocale: vi.fn(), setMode: vi.fn(), destroy: vi.fn() };
}

/** ResizeObserver for jsdom (which has none): resize(el, w, h) reports a new size to whoever observes el. */
export class FakeResizeObserver {
  static all: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private cb: (entries: { contentRect: { width: number; height: number } }[]) => void) { FakeResizeObserver.all.push(this); }
  observe(el: Element) { this.observed.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  static resize(el: Element, width: number, height = 0) {
    for (const ro of FakeResizeObserver.all) if (!ro.disconnected && ro.observed.includes(el)) ro.cb([{ contentRect: { width, height } }]);
  }
}
