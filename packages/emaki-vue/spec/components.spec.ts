// The Vue components over the core: each mounts the core's DOM side (attachScene, createShow, installCapture) into
// its element, forwards prop changes to it, renders chrome from the core's state, and tears it down on unmount.
import { createApp, h, nextTick, ref, shallowReactive, toRaw, type App, type Component } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, figurePlayer, installCapture, ScenePlayerState } from '@senseihq/emaki';
import { MotionScene, MotionShow, ScenePlayer, ShowPage } from '../src/index.js';
import type { Show } from '../src/composables.js';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => {
  const core = await actual<typeof import('@senseihq/emaki')>();
  return { ...core, attachScene: vi.fn(), createShow: vi.fn(), installCapture: vi.fn(), figurePlayer: vi.fn(core.figurePlayer) };
});

let el: HTMLElement, app: App | null, views: ReturnType<typeof fakeView>[], shows: FakeShow[];
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  views = []; shows = [];
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async () => { const s = fakeShow(); shows.push(s); return s as never; });
  vi.mocked(installCapture).mockReset().mockImplementation(async () => { const s = fakeShow(); shows.push(s); return s as never; });
  vi.mocked(figurePlayer).mockClear();
});
afterEach(() => { app?.unmount(); app = null; el.remove(); vi.unstubAllGlobals(); });
const settle = async () => { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };
/** Mounts `c` with reactive props (change them to update the component); `attrs` for listeners and refs. */
async function mount<P extends object>(c: Component, props: P, attrs: Record<string, unknown> = {}) {
  const p = shallowReactive({ ...props }) as P;
  app = createApp({ render: () => h(c, { ...p, ...attrs }) });
  app.mount(el);
  await settle();
  return p;
}
const unmount = () => { app!.unmount(); app = null; };
const button = (name: string) => [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!;
const click = async (name: string) => { button(name).dispatchEvent(new MouseEvent('click', { bubbles: true })); await settle(); };
const key = (k: string) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.querySelector('[role=application]')!.dispatchEvent(e); return e; };

describe('MotionScene', () => {
  it('attaches a figure player for the scene, forwards prop changes, fits to its width, and destroys on unmount', async () => {
    const props = await mount(MotionScene, { film: 'f', scene: 'a', locale: 'en', mode: 'auto' as 'auto' | 'dark' });
    const box = el.firstElementChild as HTMLElement, host = box.firstElementChild as HTMLElement;
    expect(box.className).toBe('motion-scene');
    const [hostArg, player, opts] = vi.mocked(attachScene).mock.calls[0];
    expect(hostArg).toBe(host);
    expect(player).toBe(vi.mocked(figurePlayer).mock.results[0].value);
    expect(player.ref).toEqual({ film: 'f', scene: 'a', layout: 'figure' });
    expect(opts).toEqual({ locale: 'en', mode: 'auto', autoplay: true });

    props.scene = 'b'; props.locale = 'de'; props.mode = 'dark';
    await settle();
    expect(player.ref).toEqual({ film: 'f', scene: 'b', layout: 'figure' });
    expect(views[0].setLocale).toHaveBeenCalledWith('de');
    expect(views[0].setMode).toHaveBeenCalledWith('dark');

    FakeResizeObserver.resize(box, 0);
    await settle();
    expect(views[0].fit).not.toHaveBeenCalled();
    FakeResizeObserver.resize(box, 480);
    await settle();
    expect(views[0].fit).toHaveBeenCalledWith(480);
    unmount();
    expect(views[0].destroy).toHaveBeenCalledOnce();
  });
});

describe('ScenePlayer', () => {
  it('shows loading, then the error, from the player it is given', async () => {
    const player = new ScenePlayerState();
    await mount(ScenePlayer, { player });
    expect(vi.mocked(attachScene).mock.calls[0].slice(1)).toEqual([player, { locale: 'en', mode: 'auto', autoplay: false }]);
    expect(el.textContent).toBe('Loading the scene…');
    player.fail('no film "f"');
    await settle();
    expect(el.querySelector('[role=alert]')!.textContent).toBe('no film "f"');
  });

  it('with controls, plays, pauses and seeks the player', async () => {
    const player = new ScenePlayerState();
    player.load({ film: 'f', scene: 'a', layout: 'landscape' });
    await mount(ScenePlayer, { player, controls: true });
    expect(el.querySelector('button')).toBeNull();
    player.markReady(4);
    await settle();
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(el.textContent).toContain('0.0 / 4.0');
    await click('Play');
    expect(player.playing).toBe(true);
    expect(button('Pause').textContent).toBe('❚❚');
    await click('Pause');
    expect(player.playing).toBe(false);
    const range = el.querySelector('input[type=range]') as HTMLInputElement;
    range.value = '2.5';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(player.t).toBe(2.5);
    expect(el.textContent).toContain('2.5 / 4.0');
  });

  it('without controls, shows nothing once ready', async () => {
    const player = new ScenePlayerState();
    player.load({ film: 'f', scene: 'a', layout: 'landscape' });
    player.markReady(4);
    await mount(ScenePlayer, { player });
    expect(el.textContent).toBe('');
  });

  it('takes a player kept in a Vue ref (a reactive proxy, which cannot reach the class\'s private fields)', async () => {
    const held = ref(new ScenePlayerState()), raw = toRaw(held.value);
    raw.load({ film: 'f', scene: 'a', layout: 'landscape' });
    await mount(ScenePlayer, { player: held.value as unknown as ScenePlayerState, controls: true });
    expect(vi.mocked(attachScene).mock.calls[0][1]).toBe(raw);
    raw.markReady(4);
    await settle();
    await click('Play');
    expect(raw.playing).toBe(true);
    expect(button('Pause')).toBeDefined();
  });
});

describe('MotionShow', () => {
  it('creates the show in its stage, emits ready, drives it from its buttons and keys, and destroys it', async () => {
    const onReady = vi.fn();
    const props = await mount(MotionShow, { film: 'f', layout: 'landscape' as 'landscape' | 'portrait' }, { onReady });
    const [stage, film, opts] = vi.mocked(createShow).mock.calls[0];
    expect(film).toBe('f');
    expect(opts).toEqual({ locale: 'en', layout: 'landscape', mode: 'auto', slide: 1, loop: false });
    expect(stage.parentElement!.parentElement).toBe(el.querySelector('[role=application]'));
    const show = shows[0];
    expect(onReady).toHaveBeenCalledWith(show);
    expect(show.fit).toHaveBeenCalledWith(0, 0);
    expect(el.textContent).toContain('1 / 3');

    await click('Next scene');
    expect(el.textContent).toContain('2 / 3');
    await click('Previous scene');
    expect(show.prev).toHaveBeenCalled();
    await click('Pause');
    expect(show.state.playing).toBe(false);
    await click('Sound off');
    expect(button('Sound on').getAttribute('aria-pressed')).toBe('true');

    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(show.next).toHaveBeenCalledTimes(2);
    expect(key('x').defaultPrevented).toBe(false);

    FakeResizeObserver.resize(stage.parentElement!, 800, 450);
    await settle();
    expect(show.fit).toHaveBeenLastCalledWith(800, 450);
    props.layout = 'portrait';
    await settle();
    expect(show.setLayout).toHaveBeenCalledWith('portrait');
    expect(show.fit).toHaveBeenLastCalledWith(800, 450);

    unmount();
    expect(show.destroy).toHaveBeenCalled();
  });

  it('starts over when the film changes, destroying the old show', async () => {
    const props = await mount(MotionShow, { film: 'f', controls: false });
    expect(el.querySelector('button')).toBeNull();
    props.film = 'g';
    await settle();
    expect(shows[0].destroy).toHaveBeenCalled();
    expect(vi.mocked(createShow).mock.calls.map((c) => c[1])).toEqual(['f', 'g']);
  });

  it('exposes the show, and ignores keys, layout and size until it is ready', async () => {
    let resolve!: (s: Show) => void;
    vi.mocked(createShow).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const exposed: { show?: { value: Show | null } } = {};
    const props = await mount(MotionShow, { film: 'f', layout: 'landscape' as 'landscape' | 'portrait' }, { ref: (x: unknown) => { if (x) exposed.show = (x as { show: { value: Show | null } }).show; } });
    expect(key('ArrowRight').defaultPrevented).toBe(false);
    props.layout = 'portrait';
    FakeResizeObserver.resize(el.querySelector('[role=application]')!.firstElementChild!, 300, 200);
    await settle();
    const late = fakeShow();
    resolve(late as unknown as Show);
    await settle();
    expect(late.setLayout).not.toHaveBeenCalled();
    expect(late.fit).toHaveBeenCalledWith(300, 200);
    expect(exposed.show).toBeDefined();
  });
});

describe('ShowPage', () => {
  it('without capture, is a full-window story player', async () => {
    await mount(ShowPage, { film: 'f', layout: 'portrait', locale: 'de' });
    expect((el.firstElementChild as HTMLElement).style.position).toBe('fixed');
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ layout: 'portrait', locale: 'de', mode: 'auto' });
    expect(installCapture).not.toHaveBeenCalled();
    unmount();
    expect(shows[0].destroy).toHaveBeenCalled();
  });

  it('passes a chosen mode to the player', async () => {
    await mount(ShowPage, { film: 'f', mode: 'dark' });
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ mode: 'dark' });
  });

  it('with capture, installs the capture contract (light unless asked) and destroys it on unmount', async () => {
    await mount(ShowPage, { film: 'f', capture: true });
    expect(vi.mocked(installCapture).mock.calls[0]).toEqual([el.firstElementChild, 'f', 'landscape', 'en', { mode: 'light', src: undefined }]);
    unmount();
    expect(shows[0].destroy).toHaveBeenCalled();
    await mount(ShowPage, { film: 'f', capture: true, mode: 'dark', src: 'js' });
    expect(vi.mocked(installCapture).mock.calls[1][4]).toEqual({ mode: 'dark', src: 'js' });
    expect(createShow).not.toHaveBeenCalled();
  });
});
