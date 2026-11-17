// The Vue composables: the core's ScenePlayerState and story controller notify, refs update and the view re-renders;
// listeners and ResizeObservers are let go when the component unmounts.
import { createApp, defineComponent, h, nextTick, ref, shallowRef, toRaw, type App, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pkg from '../src/index.js';
import { useScenePlayer, useShowState, useSize, type Show } from '../src/composables.js';
import { ScenePlayerState } from '@senseihq/emaki';
import { FakeResizeObserver, fakeShow, type FakeShow } from './fakes.js';

let el: HTMLElement, app: App | null;
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => { app?.unmount(); app = null; el.remove(); vi.unstubAllGlobals(); });
function mount(setup: () => () => ReturnType<typeof h>) { app = createApp(defineComponent({ setup })); app.mount(el); }
const unmount = () => { app!.unmount(); app = null; };

describe('@senseihq/emaki-vue', () => {
  it('exports the components, the composables and the core setup', () => {
    for (const k of ['useScenePlayer', 'useShowState', 'setupMotion', 'ScenePlayerState'] as const) expect(pkg[k], k).toBeTypeOf('function');
    for (const k of ['MotionScene', 'MotionShow', 'ScenePlayer', 'ShowPage'] as const) expect(pkg[k].name).toBe(k);
    expect(pkg.ScenePlayerState).toBe(ScenePlayerState);
  });
});

describe('useScenePlayer', () => {
  it('snapshots the player on every change and stops listening on unmount', async () => {
    const player = new ScenePlayerState();
    let state!: ReturnType<typeof useScenePlayer>;
    mount(() => { state = useScenePlayer(player); return () => h('p', `${state.value.status} ${state.value.t.toFixed(1)}/${state.value.dur}`); });
    expect(el.textContent).toBe('idle 0.0/0');
    player.load({ film: 'f', scene: 's', layout: 'figure' });
    player.markReady(4);
    player.play();
    await nextTick();
    expect(el.textContent).toBe('ready 0.0/4');
    expect(state.value).toEqual({ t: 0, dur: 4, status: 'ready', error: '', playing: true, key: 'f:s:figure:', version: player.version });
    player.fail('broken');
    await nextTick();
    expect(state.value).toMatchObject({ status: 'error', error: 'broken', playing: false });
    unmount();
    const v = state.value.version;
    player.seek(1);
    await nextTick();
    expect(state.value.version).toBe(v);
  });
});

describe('useScenePlayer with a player kept in a Vue ref', () => {
  it('follows the player behind the reactive proxy', async () => {
    const held = ref(new ScenePlayerState());
    let state!: ReturnType<typeof useScenePlayer>;
    mount(() => { state = useScenePlayer(held.value as unknown as ScenePlayerState); return () => h('p', state.value.status); });
    toRaw(held.value).load({ film: 'f', scene: 's', layout: 'figure' });
    toRaw(held.value).markReady(4);
    await nextTick();
    expect(el.textContent).toBe('ready');
  });
});

describe('useShowState', () => {
  it('follows the playhead once a frame, says whether the show has started, and stops following on unmount', async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let n = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++n, cb); return n; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
    const s = fakeShow(3, false);
    let state!: ReturnType<typeof useShowState>;
    mount(() => { state = useShowState(shallowRef(s as unknown as Show)); return () => h('p', `${state.value?.started} ${state.value?.local}`); });
    expect(el.textContent).toBe('false 0');
    s.advance(1.5);
    [...frames.values()].forEach((f) => { frames.clear(); f(0); });
    await nextTick();
    expect(el.textContent).toBe('false 1.5');
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it('follows whichever controller the ref holds, swapping listeners with it', async () => {
    const show = shallowRef<FakeShow | null>(null), a = fakeShow(), b = fakeShow();
    let state!: ReturnType<typeof useShowState>;
    mount(() => { state = useShowState(show as unknown as Ref<Show | null>); return () => h('p', state.value ? `${state.value.index}:${state.value.playing}` : 'none'); });
    expect(el.textContent).toBe('none');

    show.value = a;
    await nextTick();
    expect(el.textContent).toBe('0:true');
    a.next(); a.toggle();
    await nextTick();
    expect(el.textContent).toBe('1:false');
    expect(a.listeners.size).toBe(1);

    show.value = b;
    await nextTick();
    expect(a.listeners.size).toBe(0);
    expect(state.value).toEqual(b.state);
    b.setLayout('portrait');
    expect(state.value!.layout).toBe('portrait');

    show.value = null;
    await nextTick();
    expect(state.value).toBeNull();
    expect(b.listeners.size).toBe(0);

    show.value = a;
    await nextTick();
    unmount();
    expect(a.listeners.size).toBe(0);
  });

  it('unmounts cleanly without ever having a controller', () => {
    mount(() => { useShowState(ref(null)); return () => h('p'); });
    expect(() => unmount()).not.toThrow();
  });
});

describe('useSize', () => {
  it('observes the element the ref holds, moves with it, and disconnects on unmount', async () => {
    const which = ref<'a' | 'b' | 'none'>('a'), box = ref<HTMLElement | null>(null);
    let size!: ReturnType<typeof useSize>;
    mount(() => {
      size = useSize(box);
      return () => which.value === 'none' ? h('p', 'gone') : h('div', { ref: box, id: which.value, key: which.value }, `${size.value.w}x${size.value.h}`);
    });
    await nextTick();
    const a = el.querySelector('#a')!;
    expect(FakeResizeObserver.all.map((r) => r.observed)).toEqual([[a]]);
    FakeResizeObserver.resize(a, 640, 360);
    await nextTick();
    expect(a.textContent).toBe('640x360');

    which.value = 'b';
    await nextTick(); await nextTick();
    const b = el.querySelector('#b')!;
    expect(FakeResizeObserver.all[0].disconnected).toBe(true);
    expect(FakeResizeObserver.all[1].observed).toEqual([b]);

    which.value = 'none';
    await nextTick(); await nextTick();
    expect(FakeResizeObserver.all[1].disconnected).toBe(true);
    expect(FakeResizeObserver.all).toHaveLength(2);
    unmount();
  });

  it('disconnects the live observer on unmount, and unmounts cleanly with none', async () => {
    const box = ref<HTMLElement | null>(null);
    mount(() => { useSize(box); return () => h('div', { ref: box }); });
    await nextTick();
    expect(FakeResizeObserver.all).toHaveLength(1);
    unmount();
    expect(FakeResizeObserver.all[0].disconnected).toBe(true);

    mount(() => { useSize(ref(null)); return () => h('p'); });
    expect(() => unmount()).not.toThrow();
  });
});
