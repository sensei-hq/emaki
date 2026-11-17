// The React hooks: the core's ScenePlayerState and story controller notify, the hooks re-render; sizes come from a
// ResizeObserver that is let go on unmount.
import { act, createElement as h, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pkg from '../src/index.js';
import { usePlayerFor, useScenePlayer, useShowState, useSize, useWidth, type Show, type ShowState } from '../src/hooks.js';
import { ScenePlayerState, type SceneRef } from '@senseihq/emaki';
import { FakeResizeObserver, fakeShow, type FakeShow } from './fakes.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, el: HTMLElement;
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  root = createRoot(el);
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals(); });
const render = (node: ReactNode) => act(() => root.render(node));
const asShow = (s: FakeShow | null) => s as unknown as Show | null;

describe('@senseihq/emaki-react', () => {
  it('exports the components, the hooks and the core setup', () => {
    for (const k of ['MotionScene', 'MotionShow', 'ScenePlayer', 'ShowPage', 'useScenePlayer', 'usePlayerFor', 'useShowState', 'setupMotion', 'ScenePlayerState'] as const)
      expect(pkg[k], k).toBeTypeOf('function');
    expect(pkg.ScenePlayerState).toBe(ScenePlayerState);
  });
});

describe('useScenePlayer', () => {
  it('re-renders on every change of the player and stops listening on unmount', () => {
    const player = new ScenePlayerState();
    let renders = 0;
    function View() { renders++; const p = useScenePlayer(player); return h('p', null, `${p.status} ${p.t.toFixed(1)}/${p.dur}`); }
    render(h(View));
    expect(el.textContent).toBe('idle 0.0/0');
    act(() => { player.load({ film: 'f', scene: 's', layout: 'figure' }); player.markReady(4); });
    expect(el.textContent).toBe('ready 0.0/4');
    act(() => player.seek(1.5));
    expect(el.textContent).toBe('ready 1.5/4');
    act(() => root.unmount());
    const after = renders;
    player.seek(3);
    expect(renders).toBe(after);
    root = createRoot(el);
  });
});

describe('usePlayerFor', () => {
  it('owns one player, points it at the ref, and reloads only when the ref changes', () => {
    const seen: ScenePlayerState[] = [];
    function View({ r }: { r: SceneRef | null }) { const p = usePlayerFor(r); seen.push(p); return h('p', null, p.key); }
    render(h(View, { r: null }));
    expect(el.textContent).toBe('');
    expect(seen[0].ref).toBeNull();

    render(h(View, { r: { film: 'f', scene: 'a', layout: 'figure' } }));
    expect(el.textContent).toBe('f:a:figure:');
    const v = seen.at(-1)!.version;
    render(h(View, { r: { film: 'f', scene: 'a', layout: 'figure' } }));
    expect(seen.at(-1)!.version).toBe(v);

    render(h(View, { r: { film: 'f', scene: 'a', layout: 'figure', src: 'js' } }));
    expect(el.textContent).toBe('f:a:figure:js');
    expect(seen.at(-1)!.ref).toEqual({ film: 'f', scene: 'a', layout: 'figure', src: 'js' });
    expect(new Set(seen).size).toBe(1);
  });
});

describe('useShowState', () => {
  const label = (s: ShowState | null) => (s ? `${s.index}:${s.playing ? 'play' : 'pause'}:${s.sound ? 'snd' : 'mute'}:${s.layout}` : 'none');
  function View({ show }: { show: FakeShow | null }) { return h('p', null, label(useShowState(asShow(show)))); }

  it('follows the controller, swaps listeners with it, and lets go on unmount', () => {
    const a = fakeShow(), b = fakeShow();
    render(h(View, { show: a }));
    expect(el.textContent).toBe('0:play:mute:landscape');
    expect(a.listeners.size).toBe(1);
    act(() => { a.next(); a.toggle(); a.setSound(true); });
    expect(el.textContent).toBe('1:pause:snd:landscape');

    render(h(View, { show: b }));
    expect(a.listeners.size).toBe(0);
    expect(b.listeners.size).toBe(1);
    act(() => b.setLayout('portrait'));
    expect(el.textContent).toBe('0:play:mute:portrait');

    render(h(View, { show: null }));
    expect(el.textContent).toBe('none');
    expect(b.listeners.size).toBe(0);

    render(h(View, { show: a }));
    act(() => root.unmount());
    expect(a.listeners.size).toBe(0);
    root = createRoot(el);
  });

  it('starts empty without a controller', () => {
    render(h(View, { show: null }));
    expect(el.textContent).toBe('none');
  });
});

describe('useWidth and useSize', () => {
  function Width({ attach }: { attach: boolean }) { const [ref, w] = useWidth<HTMLDivElement>(); return h('div', { ref: attach ? ref : undefined, id: 'w' }, `w=${w}`); }
  function Size({ attach }: { attach: boolean }) { const [ref, s] = useSize<HTMLDivElement>(); return h('div', { ref: attach ? ref : undefined, id: 's' }, `${s.w}x${s.h}`); }

  it('track the element they are attached to and disconnect on unmount', () => {
    render(h('div', null, h(Width, { attach: true }), h(Size, { attach: true })));
    const w = el.querySelector('#w')!, s = el.querySelector('#s')!;
    expect(FakeResizeObserver.all.map((ro) => ro.observed)).toEqual([[w], [s]]);
    act(() => { FakeResizeObserver.resize(w, 320); FakeResizeObserver.resize(s, 640, 360); });
    expect(w.textContent).toBe('w=320');
    expect(s.textContent).toBe('640x360');
    act(() => root.unmount());
    expect(FakeResizeObserver.all.every((ro) => ro.disconnected)).toBe(true);
    root = createRoot(el);
  });

  it('observe nothing when the ref is not attached', () => {
    render(h('div', null, h(Width, { attach: false }), h(Size, { attach: false })));
    expect(FakeResizeObserver.all).toEqual([]);
    expect(el.textContent).toBe('w=00x0');
  });
});
