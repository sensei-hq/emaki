// The Vue components over the core: each mounts the core's DOM side (attachScene, createShow, installCapture) into
// its element, forwards prop changes to it, renders chrome from the core's state, and tears it down on unmount.
import { createApp, h, nextTick, ref, shallowReactive, toRaw, type App, type Component } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, figurePlayer, installCapture, ScenePlayerState, useSource, voiceLines, type VoiceLine } from '@senseihq/emaki';
import { MotionScene, MotionShow, ScenePlayer, ShowPage } from '../src/index.js';
import type { Show } from '../src/composables.js';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => {
  const core = await actual<typeof import('@senseihq/emaki')>();
  return { ...core, attachScene: vi.fn(), createShow: vi.fn(), installCapture: vi.fn(), figurePlayer: vi.fn(core.figurePlayer), voiceLines: vi.fn() };
});

let el: HTMLElement, app: App | null, views: ReturnType<typeof fakeView>[], shows: FakeShow[];
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  views = []; shows = [];
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async (_stage, _film, o) => { const s = fakeShow(3, !o?.poster); shows.push(s); return s as never; });
  vi.mocked(installCapture).mockReset().mockImplementation(async () => { const s = fakeShow(); shows.push(s); return s as never; });
  vi.mocked(figurePlayer).mockClear();
  vi.mocked(voiceLines).mockReset().mockResolvedValue([{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }]);
  // The real chrome asks the real registry for voice lines (the mock above only covers the wrapper's own import).
  useSource({ films: async () => [], css: async () => '', scene: async () => null, voiceText: async () => null });
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
    expect(opts).toEqual({ locale: 'en', layout: 'landscape', mode: 'auto', slide: 1, loop: false, poster: false });
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
    await click('Sound on');
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');

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

  it('with description, opens the voiceover script under a Description button; without lines, no button', async () => {
    const props = await mount(MotionShow, { film: 'f', description: true });
    expect(vi.mocked(voiceLines)).toHaveBeenCalledWith('f', 'en');
    expect(el.querySelector('p:not(.emk-cap)')).toBeNull();
    await click('Description ▸');
    expect([...el.querySelectorAll('p:not(.emk-cap)')].map((p) => p.textContent)).toEqual(['Line A.', 'Line B.']);
    expect(button('Description ▾').getAttribute('aria-expanded')).toBe('true');
    await click('Description ▾');
    expect(el.querySelector('p:not(.emk-cap)')).toBeNull();

    vi.mocked(voiceLines).mockResolvedValueOnce(null);
    props.film = 'g';
    await settle();
    expect(el.textContent).not.toContain('Description');
  });

  it('keeps the newest lines when the film changes mid-load', async () => {
    let release!: (v: VoiceLine[] | null) => void;
    vi.mocked(voiceLines).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const props = await mount(MotionShow, { film: 'f', description: true });
    props.film = 'g';
    await settle();
    release([{ scene: 'a', text: 'Late.' }]);
    await settle();
    expect(el.textContent).not.toContain('Late.');
    await click('Description ▸');
    expect(el.querySelector('p:not(.emk-cap)')!.textContent).toBe('Line A.');
  });
});

describe('MotionShow aspect-locked stage', () => {
  const fitStyle = () => (el.querySelector('[role=application]')!.firstElementChild as HTMLElement).getAttribute('style') ?? '';
  const flat = (s: string) => s.replace(/\s+/g, '');

  it('keeps the content aspect ratio: width-driven off portrait, height-driven on it, never flex-filled', async () => {
    await mount(MotionShow, { film: 'f', layout: 'landscape' });
    let style = flat(fitStyle());
    expect(style).toContain('aspect-ratio:1920/1080');
    expect(style).toContain('width:100%');
    expect(style).toContain('max-height:100%');
    expect(style).toContain('margin:auto');
    expect(style).not.toMatch(/flex:1|flex-grow/);
    unmount();

    await mount(MotionShow, { film: 'f', layout: 'portrait' });
    style = flat(fitStyle());
    expect(style).toContain('aspect-ratio:1080/1920');
    expect(style).toContain('height:100%');
    expect(style).toContain('max-width:100%');
    expect(style).toContain('margin:auto');
    expect(style).not.toMatch(/flex:1|flex-grow/);
  });

  it('re-aspects the stage when the layout prop changes, still fitting the show to the box', async () => {
    const props = await mount(MotionShow, { film: 'f', layout: 'landscape' as 'landscape' | 'portrait' });
    expect(flat(fitStyle())).toContain('aspect-ratio:1920/1080');
    props.layout = 'portrait';
    await settle();
    const style = flat(fitStyle());
    expect(style).toContain('aspect-ratio:1080/1920');
    expect(style).toContain('height:100%');
    expect(shows[0].setLayout).toHaveBeenCalledWith('portrait');
    expect(shows[0].fit).toHaveBeenCalled();
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

describe('MotionShow poster, cover and progress (as the Svelte player)', () => {
  let frames: Map<number, FrameRequestCallback>, next: number;
  const frame = async () => { const due = [...frames.values()]; frames.clear(); due.forEach((f) => f(performance.now())); await settle(); };
  beforeEach(() => {
    frames = new Map(); next = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  });

  it('with poster, opens on the cover frame with a play button; the click starts it, and a restart after that skips the poster', async () => {
    const props = await mount(MotionShow, { film: 'f', poster: true, title: 'F', length: '1 min', locale: 'en' });
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ poster: true });
    expect(button('Play the film: F').textContent).toContain('Play the film · 1 min');
    expect(button('Next scene')).not.toBeUndefined();
    await click('Play the film: F');
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(el.textContent).toContain('1 / 3');
    props.locale = 'es';
    await settle();
    expect(vi.mocked(createShow).mock.calls[1][2]).toMatchObject({ locale: 'es', poster: false });
  });

  it('shows the standard chrome before the first play in poster mode, the play button over the stage only', async () => {
    await mount(MotionShow, { film: 'f', poster: true, title: 'F', length: '1 min' });
    const bar = el.querySelector('.emk-bar')!;
    expect(bar.getAttribute('role')).toBe('toolbar');
    expect([...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous scene', 'Play', 'Next scene',
      'Scene 1: Scene 1', 'Scene 2: Scene 2', 'Scene 3: Scene 3',
      'Sound on', 'Full screen',
    ]);
    // The play button covers the stage box, not the bar: the bar survives a notification unchanged.
    const root = el.querySelector('[role=application]')!;
    const play = button('Play the film: F');
    expect(root.children[0].contains(play)).toBe(true);
    expect(root.children[0].contains(bar)).toBe(false);
    shows[0].play();
    await settle();
    expect(el.querySelector('.emk-bar')).toBe(bar);
    // Playing from the bar starts the poster show.
    await click('Pause');
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(shows[0].state.started).toBe(true);
  });

  it('with a cover, paints the image and creates nothing until the first click, which plays it with sound on', async () => {
    await mount(MotionShow, { film: 'f', cover: '/covers/f.jpg', title: 'F', length: '1 min' });
    expect(createShow).not.toHaveBeenCalled();
    expect(el.querySelector('img')!.getAttribute('src')).toBe('/covers/f.jpg');
    expect(button('Play the film: F').textContent).toContain('Play the film · 1 min');
    await click('Play the film: F');
    expect(createShow).toHaveBeenCalledOnce();
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ poster: true });
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('1 / 3');
  });

  it('draws a tick per scene that fills as it plays and jumps there on click, and links to full screen', async () => {
    await mount(MotionShow, { film: 'f', fullscreenHref: '/show/f' });
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/show/f');
    await click('Scene 3: Scene 3');
    expect(shows[0].go).toHaveBeenCalledWith(2);
    shows[0].advance(1);
    await frame();
    const fills = ['Scene 1: Scene 1', 'Scene 2: Scene 2', 'Scene 3: Scene 3'].map((n) => (button(n).firstElementChild as HTMLElement).style.width);
    expect(fills).toEqual(['100%', '100%', '50%']);
  });

  it('names the play button plainly without a title or length, and drops a show a newer start overtook', async () => {
    let resolve!: (s: Show) => void;
    vi.mocked(createShow).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const props = await mount(MotionShow, { film: 'f', poster: true });
    props.film = 'g';
    await settle();
    const late = fakeShow();
    resolve(late as unknown as Show);
    await settle();
    expect(late.destroy).toHaveBeenCalled();
    expect(button('Play the film').textContent).toBe('Play the film');
  });
});

describe('MotionShow standard chrome', () => {
  let frames: Map<number, FrameRequestCallback>, next: number;
  beforeEach(() => {
    frames = new Map(); next = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  });

  it('renders the core icon bar with ticks and a count, and no pop-out without a href', async () => {
    await mount(MotionShow, { film: 'f' });
    await settle();
    expect([...el.querySelectorAll('.emk-bar button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous scene', 'Pause', 'Next scene',
      'Scene 1: Scene 1', 'Scene 2: Scene 2', 'Scene 3: Scene 3',
      'Sound on', 'Full screen',
    ]);
    expect(el.querySelector('.emk-bar svg')).not.toBeNull();
    expect(el.querySelector('.emk-count')!.textContent).toBe('1 / 3');
    expect(el.querySelector('.emk-popout')).toBeNull();
  });

  it('pops out to playerHref, preferring it over the fullscreenHref alias', async () => {
    await mount(MotionShow, { film: 'f', playerHref: '/p/f', fullscreenHref: '/show/f' });
    const pop = el.querySelector('.emk-popout') as HTMLAnchorElement;
    expect(pop.getAttribute('href')).toBe('/p/f');
    expect(pop.getAttribute('aria-label')).toBe('Open the player on its own page');
  });

  it('treats fullscreenHref as the pop-out href when playerHref is absent', async () => {
    await mount(MotionShow, { film: 'f', fullscreenHref: '/show/f' });
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/show/f');
  });

  it('overrides icons and ticks', async () => {
    const star = '<svg viewBox="0 0 24 24" data-star="yes"><path d="M12 2l3 7h7l-5.5 4.5L18.5 22 12 17.5 5.5 22l2-8.5L2 9h7z"/></svg>';
    await mount(MotionShow, { film: 'f', icons: { pause: star }, renderTick: (t: { name: string }) => `<i>${t.name}!</i>` });
    expect(el.querySelector('.emk-toggle')!.innerHTML).toContain('data-star');
    expect([...el.querySelectorAll('.emk-tick')].map((t) => t.innerHTML)).toEqual(['<i>Scene 1!</i>', '<i>Scene 2!</i>', '<i>Scene 3!</i>']);
  });

  it('captions the voiced scene behind the CC toggle', async () => {
    useSource({ films: async () => [], css: async () => '', scene: async () => null, voiceText: async () => [{ scene: 's0', text: 'Hello.' }] });
    await mount(MotionShow, { film: 'f' });
    await settle();
    const cc = el.querySelector('.emk-cc') as HTMLButtonElement;
    const cap = el.querySelector('.emk-cap') as HTMLElement;
    expect(cap.hidden).toBe(true);
    cc.click();
    expect(cc.getAttribute('aria-pressed')).toBe('true');
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Hello.');
  });

  it('keeps CC on across scenes (no chrome remount on advance)', async () => {
    useSource({ films: async () => [], css: async () => '', scene: async () => null, voiceText: async () => [{ scene: 's0', text: 'Hello.' }] });
    await mount(MotionShow, { film: 'f' });
    await settle();
    await click('Captions');
    const bar = el.querySelector('[role=toolbar]')!;
    await click('Next scene');
    expect(el.querySelector('[role=toolbar]')).toBe(bar);
    expect((el.querySelector('.emk-cc') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('remounts chrome on input change, skipping while dropped', async () => {
    const props = await mount(MotionShow, { film: 'f', playerHref: '/a', controls: true });
    await settle();
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/a');
    props.playerHref = '/b';
    await settle();
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/b');
    props.controls = false;
    await settle();
    expect(el.querySelector('.emk-bar')).toBeNull();
    props.playerHref = '/c';
    await settle();
    expect(el.querySelector('.emk-bar')).toBeNull();
    props.controls = true;
    await settle();
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/c');
  });

  it('hides the chrome with controls=false, and brings it back', async () => {
    const props = await mount(MotionShow, { film: 'f', controls: false });
    expect(el.querySelector('.emk-bar')).toBeNull();
    props.controls = true;
    await settle();
    expect(el.querySelector('.emk-bar')).not.toBeNull();
    props.controls = false;
    await settle();
    expect(el.querySelector('.emk-bar')).toBeNull();
  });

  it('keeps one chrome across a film change and drops it on unmount', async () => {
    const props = await mount(MotionShow, { film: 'f' });
    expect(frames.size).toBe(2);
    props.film = 'g';
    await settle();
    expect(el.querySelectorAll('.emk-bar')).toHaveLength(1);
    expect(frames.size).toBe(2);
    unmount();
    expect(frames.size).toBe(0);
  });

  it('answers chrome keys once (no double toggle with the root handler)', async () => {
    await mount(MotionShow, { film: 'f' });
    const show = shows[0];
    show.toggle.mockClear();
    el.querySelector('.emk-toggle')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(show.toggle).toHaveBeenCalledTimes(1);
  });
});

