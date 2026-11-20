// The React components over the core: each mounts the core's DOM side (attachScene, createShow, installCapture) into
// its element, forwards prop changes to it, renders chrome from the core's state, and tears it down on unmount.
import { act, createElement as h, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, installCapture, ScenePlayerState, useSource, voiceLines, type VoiceLine } from '@senseihq/emaki';
import { MotionScene, MotionShow, ScenePlayer, ShowPage } from '../src/index.js';
import type { Show } from '../src/hooks.js';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => ({
  ...(await actual<typeof import('@senseihq/emaki')>()),
  attachScene: vi.fn(), createShow: vi.fn(), installCapture: vi.fn(), voiceLines: vi.fn(),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, el: HTMLElement, views: ReturnType<typeof fakeView>[], shows: FakeShow[];
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  root = createRoot(el);
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  views = []; shows = [];
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async (_stage, _film, o) => { const s = fakeShow(3, !o?.poster); shows.push(s); return s as never; });
  vi.mocked(installCapture).mockReset().mockImplementation(async () => { const s = fakeShow(); shows.push(s); return s as never; });
  vi.mocked(voiceLines).mockReset().mockResolvedValue([{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }]);
  // The chrome reads voice lines through the core's own import (past this file's voiceLines mock), so the core
  // gets a source: one line, enough to keep the CC toggle.
  useSource({ films: async () => [], css: async () => '', scene: async () => null, voiceText: async () => [{ scene: 's0', text: 'Line.' }] });
});
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals(); });
const render = (node: ReactNode) => act(async () => root.render(node));
const unmount = () => { act(() => root.unmount()); root = createRoot(el); };
const button = (name: string) => [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!;
const click = (name: string) => act(() => button(name).dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('MotionScene', () => {
  it('attaches its own player for the scene, forwards locale and mode, fits to its width, and destroys on unmount', async () => {
    await render(h(MotionScene, { film: 'f', scene: 'a', className: 'fig', style: { maxWidth: 600 } }));
    const box = el.firstElementChild as HTMLElement, host = box.firstElementChild as HTMLElement;
    expect(box.className).toBe('fig');
    expect(box.style.maxWidth).toBe('600px');
    const [hostArg, player, opts] = vi.mocked(attachScene).mock.calls[0];
    expect(hostArg).toBe(host);
    expect(player.ref).toEqual({ film: 'f', scene: 'a', layout: 'figure' });
    expect(opts).toEqual({ locale: 'en', mode: 'auto', autoplay: true });

    await render(h(MotionScene, { film: 'f', scene: 'b', locale: 'de', mode: 'dark' }));
    expect(player.ref).toEqual({ film: 'f', scene: 'b', layout: 'figure' });
    expect(views[0].setLocale).toHaveBeenLastCalledWith('de');
    expect(views[0].setMode).toHaveBeenLastCalledWith('dark');
    expect(attachScene).toHaveBeenCalledTimes(1);

    act(() => FakeResizeObserver.resize(box, 480));
    expect(views[0].fit).toHaveBeenCalledWith(480);
    unmount();
    expect(views[0].destroy).toHaveBeenCalledOnce();
  });
});

describe('ScenePlayer', () => {
  it('shows loading, then the error, from the player it is given', async () => {
    const player = new ScenePlayerState();
    await render(h(ScenePlayer, { player }));
    expect(vi.mocked(attachScene).mock.calls[0][1]).toBe(player);
    expect(vi.mocked(attachScene).mock.calls[0][2]).toEqual({ locale: 'en', mode: 'auto', autoplay: false });
    expect(el.textContent).toBe('Loading the scene…');
    act(() => player.fail('no film "f"'));
    expect(el.querySelector('[role=alert]')!.textContent).toBe('no film "f"');
  });

  it('with controls, plays, pauses and seeks the player', async () => {
    const player = new ScenePlayerState();
    player.load({ film: 'f', scene: 'a', layout: 'landscape' });
    await render(h(ScenePlayer, { player, controls: true }));
    expect(el.querySelector('button')).toBeNull();
    act(() => player.markReady(4));
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(el.textContent).toContain('0.0 / 4.0');
    click('Play');
    expect(player.playing).toBe(true);
    expect(button('Pause').textContent).toBe('❚❚');
    click('Pause');
    expect(player.playing).toBe(false);
    const range = el.querySelector('input[type=range]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '2.5');
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(player.t).toBe(2.5);
    expect(el.textContent).toContain('2.5 / 4.0');
  });
});

describe('MotionShow', () => {
  it('creates the show in its stage, reports it ready, drives it from its buttons and keys, and destroys it', async () => {
    const onReady = vi.fn();
    await render(h(MotionShow, { film: 'f', onReady }));
    const [stage, film, opts] = vi.mocked(createShow).mock.calls[0];
    expect(film).toBe('f');
    expect(opts).toEqual({ locale: 'en', layout: 'landscape', mode: 'auto', slide: 1, loop: false, poster: false });
    expect(stage.parentElement!.parentElement).toBe(el.querySelector('[role=application]'));
    const show = shows[0];
    expect(onReady).toHaveBeenCalledWith(show);
    expect(el.textContent).toContain('1 / 3');

    click('Next scene');
    expect(el.textContent).toContain('2 / 3');
    click('Previous scene');
    expect(show.prev).toHaveBeenCalled();
    click('Pause');
    expect(show.state.playing).toBe(false);
    click('Sound on');
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');

    const app = el.querySelector('[role=application]')!;
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => { app.dispatchEvent(right); });
    expect(right.defaultPrevented).toBe(true);
    expect(show.next).toHaveBeenCalledTimes(2);
    const other = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
    act(() => { app.dispatchEvent(other); });
    expect(other.defaultPrevented).toBe(false);

    act(() => FakeResizeObserver.resize(stage.parentElement!, 800, 450));
    expect(show.fit).toHaveBeenLastCalledWith(800, 450);
    await render(h(MotionShow, { film: 'f', onReady, layout: 'portrait' }));
    expect(show.setLayout).toHaveBeenCalledWith('portrait');

    unmount();
    expect(show.destroy).toHaveBeenCalled();
  });

  it('starts over when the film changes, and drops a show that arrives after unmount', async () => {
    await render(h(MotionShow, { film: 'f', controls: false }));
    expect(el.querySelector('button')).toBeNull();
    await render(h(MotionShow, { film: 'g', controls: false }));
    expect(shows[0].destroy).toHaveBeenCalled();
    expect(vi.mocked(createShow).mock.calls.map((c) => c[1])).toEqual(['f', 'g']);

    let resolve!: (s: Show) => void;
    vi.mocked(createShow).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    await render(h(MotionShow, { film: 'late' }));
    unmount();
    const late = fakeShow();
    await act(async () => resolve(late as unknown as Show));
    expect(late.destroy).toHaveBeenCalled();
  });

  it('with description, opens the voiceover script under a Description button; without lines, no button', async () => {
    await render(h(MotionShow, { film: 'f', description: true }));
    expect(vi.mocked(voiceLines)).toHaveBeenCalledWith('f', 'en');
    expect(el.querySelector('p:not(.emk-cap)')).toBeNull();
    click('Description ▸');
    expect([...el.querySelectorAll('p:not(.emk-cap)')].map((p) => p.textContent)).toEqual(['Line A.', 'Line B.']);
    expect(button('Description ▾').getAttribute('aria-expanded')).toBe('true');
    click('Description ▾');
    expect(el.querySelector('p:not(.emk-cap)')).toBeNull();

    vi.mocked(voiceLines).mockResolvedValueOnce(null);
    await render(h(MotionShow, { film: 'g', description: true }));
    expect(el.textContent).not.toContain('Description');
  });

  it('drops lines that arrive after unmount', async () => {
    let release!: (v: VoiceLine[] | null) => void;
    vi.mocked(voiceLines).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    await render(h(MotionShow, { film: 'f', description: true }));
    unmount();
    await act(async () => release([{ scene: 'a', text: 'Late.' }]));
    expect(el.querySelector('p:not(.emk-cap)')).toBeNull();
  });

  it('ignores keys until the show is ready', async () => {
    vi.mocked(createShow).mockImplementationOnce(() => new Promise(() => {}));
    await render(h(MotionShow, { film: 'f' }));
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => { el.querySelector('[role=application]')!.dispatchEvent(key); });
    expect(key.defaultPrevented).toBe(false);
  });
});

describe('ShowPage', () => {
  it('without capture, is a full-window story player', async () => {
    await render(h(ShowPage, { film: 'f', layout: 'portrait', locale: 'de' }));
    expect((el.firstElementChild as HTMLElement).style.position).toBe('fixed');
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ layout: 'portrait', locale: 'de', mode: 'auto' });
    expect(installCapture).not.toHaveBeenCalled();
  });

  it('with capture, installs the capture contract (light unless asked) and destroys it on unmount', async () => {
    await render(h(ShowPage, { film: 'f', capture: true }));
    expect(vi.mocked(installCapture).mock.calls[0]).toEqual([el.firstElementChild, 'f', 'landscape', 'en', { mode: 'light', src: undefined }]);
    unmount();
    expect(shows[0].destroy).toHaveBeenCalled();
    await render(h(ShowPage, { film: 'f', capture: true, mode: 'dark', src: 'js' }));
    expect(vi.mocked(installCapture).mock.calls[1][4]).toEqual({ mode: 'dark', src: 'js' });
    expect(createShow).not.toHaveBeenCalled();
  });
});

describe('MotionShow poster, cover and progress (as the Svelte player)', () => {
  let frames: Map<number, FrameRequestCallback>, next: number;
  const frame = () => act(() => { const due = [...frames.values()]; frames.clear(); due.forEach((f) => f(performance.now())); });
  beforeEach(() => {
    frames = new Map(); next = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  });

  it('with poster, opens on the cover frame with a play button; the click starts it, and a restart after that skips the poster', async () => {
    await render(h(MotionShow, { film: 'f', poster: true, title: 'F', length: '1 min' }));
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ poster: true });
    expect(button('Play the film: F').textContent).toContain('Play the film · 1 min');
    // The chrome mounts with the show, under the poster overlay; the poster's button still starts it.
    expect(el.querySelector('[role=toolbar]')).not.toBeNull();
    await act(async () => button('Play the film: F').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(el.textContent).toContain('1 / 3');
    await render(h(MotionShow, { film: 'f', poster: true, title: 'F', locale: 'es' }));
    expect(vi.mocked(createShow).mock.calls[1][2]).toMatchObject({ locale: 'es', poster: false });
  });

  it('with a cover, paints the image and creates nothing until the first click, which plays it with sound on', async () => {
    await render(h(MotionShow, { film: 'f', cover: '/covers/f.jpg', title: 'F', length: '1 min' }));
    expect(createShow).not.toHaveBeenCalled();
    expect(el.querySelector('img')!.getAttribute('src')).toBe('/covers/f.jpg');
    expect(button('Play the film: F').textContent).toContain('Play the film · 1 min');
    await act(async () => button('Play the film: F').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(createShow).toHaveBeenCalledOnce();
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ poster: true });
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('1 / 3');
  });

  it('names no film on the play button without a title or length', async () => {
    await render(h(MotionShow, { film: 'f', poster: true }));
    expect(button('Play the film').textContent).toBe('Play the film');
  });

  it('draws a tick per scene that fills as it plays and jumps there on click, and pops out to fullscreenHref', async () => {
    await render(h(MotionShow, { film: 'f', fullscreenHref: '/show/f' }));
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/show/f');
    click('Scene 3: Scene 3');
    expect(shows[0].go).toHaveBeenCalledWith(2);
    shows[0].advance(1);
    frame();
    const fills = ['Scene 1: Scene 1', 'Scene 2: Scene 2', 'Scene 3: Scene 3'].map((n) => (button(n).firstElementChild as HTMLElement).style.width);
    expect(fills).toEqual(['100%', '100%', '50%']);
  });
});

describe('MotionShow chrome (the standard player chrome)', () => {
  it('renders the icon bar with svg buttons, ticks, count, CC, mute and fullscreen, and captions over the stage', async () => {
    await render(h(MotionShow, { film: 'f' }));
    const bar = el.querySelector('[role=toolbar]')!;
    expect(bar.getAttribute('aria-label')).toBe('Player controls');
    expect([...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous scene', 'Pause', 'Next scene',
      'Scene 1: Scene 1', 'Scene 2: Scene 2', 'Scene 3: Scene 3',
      'Captions', 'Sound on', 'Full screen',
    ]);
    expect(bar.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(bar.querySelector('.emk-count')!.textContent).toBe('1 / 3');
    const stage = vi.mocked(createShow).mock.calls[0][0] as HTMLElement;
    expect(stage.querySelector('.emk-cap')).toBeNull();
    expect(el.querySelector('.emk-cap')).not.toBeNull();
  });

  it('keeps CC on across scenes (no chrome remount on advance)', async () => {
    await render(h(MotionShow, { film: 'f' }));
    await click('Captions');
    const bar = el.querySelector('[role=toolbar]')!;
    await click('Next scene');
    expect(el.querySelector('[role=toolbar]')).toBe(bar);
    expect(button('Captions').getAttribute('aria-pressed')).toBe('true');
  });

  it('pops out to playerHref, falls back to fullscreenHref, and hides the link without either', async () => {
    await render(h(MotionShow, { film: 'f', playerHref: '/show/f' }));
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/show/f');
    await render(h(MotionShow, { film: 'f', playerHref: '/show/f', fullscreenHref: '/alias' }));
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/show/f');
    await render(h(MotionShow, { film: 'f', fullscreenHref: '/alias' }));
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/alias');
    await render(h(MotionShow, { film: 'f' }));
    expect(el.querySelector('.emk-popout')).toBeNull();
  });

  it('overrides icons and tick HTML', async () => {
    await render(h(MotionShow, { film: 'f', icons: { pause: '<svg data-custom="pause"></svg>' }, renderTick: () => '<i>tick</i>' }));
    expect(el.querySelector('.emk-toggle')!.innerHTML).toContain('data-custom="pause"');
    for (const t of el.querySelectorAll('.emk-tick')) expect(t.innerHTML).toBe('<i>tick</i>');
  });

  it('with controls=false renders no chrome; toggling controls off destroys it without leaking its subscription', async () => {
    await render(h(MotionShow, { film: 'f', controls: false }));
    expect(el.querySelector('[role=toolbar]')).toBeNull();
    await render(h(MotionShow, { film: 'f' }));
    expect(el.querySelector('[role=toolbar]')).not.toBeNull();
    expect(shows[0].listeners.size).toBe(2);
    await render(h(MotionShow, { film: 'f', controls: false }));
    expect(el.querySelector('[role=toolbar]')).toBeNull();
    expect(shows[0].listeners.size).toBe(1);
  });

  it('destroys the chrome with the show: on film change the old bar is gone, on unmount its keys are dead', async () => {
    await render(h(MotionShow, { film: 'f' }));
    const show = shows[0];
    await render(h(MotionShow, { film: 'g' }));
    expect(show.destroy).toHaveBeenCalled();
    expect(el.querySelectorAll('[role=toolbar]').length).toBe(1);
    const host = el.querySelector('[role=toolbar]')!.parentElement!;
    unmount();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(shows[1].next).not.toHaveBeenCalled();
  });

  it('chrome keys stop at the chrome: Space toggles once, not twice through the wrapper handler', async () => {
    await render(h(MotionShow, { film: 'f' }));
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => { el.querySelector('.emk-toggle')!.dispatchEvent(space); });
    expect(shows[0].toggle).toHaveBeenCalledTimes(1);
  });
});

describe('MotionShow aspect-locked stage', () => {
  const fitBox = () => el.querySelector('[role=application]')!.firstElementChild as HTMLElement;

  it('locks the fit box to the landscape ratio, width-driven, with no flex fill', async () => {
    await render(h(MotionShow, { film: 'f', layout: 'landscape' }));
    const fit = fitBox();
    expect(fit.style.aspectRatio).toBe('1920 / 1080');
    expect(fit.style.width).toBe('100%');
    expect(fit.style.maxHeight).toBe('100%');
    expect(fit.style.margin).toBe('auto');
    expect(fit.style.flex).toBe('');
    expect(fit.style.position).toBe('relative');
    expect(fit.style.display).toBe('grid');
    expect(fit.style.overflow).toBe('hidden');
  });

  it('locks the fit box to the portrait ratio, height-driven', async () => {
    await render(h(MotionShow, { film: 'f', layout: 'portrait' }));
    const fit = fitBox();
    expect(fit.style.aspectRatio).toBe('1080 / 1920');
    expect(fit.style.height).toBe('100%');
    expect(fit.style.maxWidth).toBe('100%');
    expect(fit.style.margin).toBe('auto');
    expect(fit.style.flex).toBe('');
  });

  it('drives any other non-portrait layout by width (figure)', async () => {
    await render(h(MotionShow, { film: 'f', layout: 'figure' }));
    const fit = fitBox();
    expect(fit.style.aspectRatio).toBe('1600 / 1000');
    expect(fit.style.width).toBe('100%');
    expect(fit.style.maxHeight).toBe('100%');
  });

  it('re-aspects when the layout prop changes', async () => {
    await render(h(MotionShow, { film: 'f', layout: 'landscape' }));
    expect(fitBox().style.aspectRatio).toBe('1920 / 1080');
    await render(h(MotionShow, { film: 'f', layout: 'portrait' }));
    expect(fitBox().style.aspectRatio).toBe('1080 / 1920');
    expect(fitBox().style.height).toBe('100%');
    await render(h(MotionShow, { film: 'f', layout: 'landscape' }));
    expect(fitBox().style.aspectRatio).toBe('1920 / 1080');
    expect(fitBox().style.width).toBe('100%');
  });

  it('re-aspects when the show itself changes layout (the O key)', async () => {
    await render(h(MotionShow, { film: 'f', layout: 'landscape' }));
    expect(fitBox().style.aspectRatio).toBe('1920 / 1080');
    const app = el.querySelector('[role=application]')!;
    act(() => { app.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true })); });
    expect(shows[0].setLayout).toHaveBeenCalledWith('portrait');
    expect(fitBox().style.aspectRatio).toBe('1080 / 1920');
    expect(fitBox().style.height).toBe('100%');
  });
});
