// The Svelte components over the core, through the package's entry: each mounts the core's DOM side (attachScene,
// createShow) into its element, renders chrome from reactivePlayer/reactiveShow, and tears it down on unmount.
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, installCapture, ScenePlayerState, useSource, voiceLines, type VoiceLine } from '@senseihq/emaki';
import * as pkg from '../src/lib/index.js';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => ({
  ...(await actual<typeof import('@senseihq/emaki')>()),
  attachScene: vi.fn(), createShow: vi.fn(), installCapture: vi.fn(), voiceLines: vi.fn(),
}));

let el: HTMLElement, views: ReturnType<typeof fakeView>[], shows: FakeShow[], app: Record<string, unknown> | null;
// What the chrome's own voice-line lookup sees (it reads the film source directly, past the voiceLines mock above).
let chromeLines: VoiceLine[] | null;
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  views = []; shows = []; app = null;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async (_host, _slug, opts) => { const s = fakeShow(3, !opts?.poster); shows.push(s); return s as never; });
  vi.mocked(voiceLines).mockReset().mockResolvedValue([{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }]);
  chromeLines = [{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }];
  useSource({ films: async () => [], css: async () => '', scene: async () => null, voiceText: async () => chromeLines });
});
afterEach(() => { if (app) unmount(app); el.remove(); vi.unstubAllGlobals(); });
const settle = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); flushSync(); } };
const button = (name: string) => [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!;
const click = async (name: string) => { button(name).click(); await settle(); };
const fitStyle = () => el.querySelector('.ms-fit')!.getAttribute('style')?.replace(/\s+/g, ' ') ?? '';

describe('@senseihq/emaki-svelte', () => {
  it('exports the components, the reactive bindings and the core setup', () => {
    for (const k of ['MotionScene', 'MotionShow', 'ScenePlayer', 'ShowPage', 'reactivePlayer', 'reactiveShow', 'setupMotion', 'ScenePlayerState'] as const)
      expect(pkg[k], k).toBeTypeOf('function');
    expect(pkg.ScenePlayerState).toBe(ScenePlayerState);
    expect(installCapture).not.toHaveBeenCalled();
  });
});

describe('ScenePlayer', () => {
  it('renders the player it is given as it changes, drives it from its controls, and detaches on unmount', async () => {
    const player = new ScenePlayerState();
    app = mount(pkg.ScenePlayer, { target: el, props: { player, controls: true } });
    flushSync();
    expect(vi.mocked(attachScene).mock.calls[0].slice(1)).toEqual([player, { locale: 'en', mode: 'auto' }]);
    expect(el.textContent).toContain('Loading the scene…');

    player.load({ film: 'f', scene: 'a', layout: 'landscape' });
    player.markReady(4);
    flushSync();
    expect(el.textContent).toContain('0.0 / 4.0');
    await click('Play');
    expect(player.playing).toBe(true);
    expect(button('Pause').textContent).toBe('❚❚');

    player.fail('no film "f"');
    flushSync();
    expect(el.querySelector('[role=alert]')!.textContent).toBe('no film "f"');
    unmount(app); app = null;
    expect(views[0].destroy).toHaveBeenCalledOnce();
  });
});

describe('MotionShow', () => {
  it('creates the show, drives it from the standard chrome, and destroys both on unmount', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    expect(vi.mocked(createShow).mock.calls[0].slice(1)).toEqual(['f', { locale: 'en', layout: 'landscape', mode: 'auto', slide: 1, loop: false, poster: false }]);
    const show = shows[0];
    // The standard icon bar: prev/play/next, per-scene ticks, count, CC, mute, voice, fullscreen — and no
    // pop-out without an href.
    const bar = el.querySelector('.emk-bar')!;
    expect(bar.getAttribute('role')).toBe('toolbar');
    expect([...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous scene', 'Pause', 'Next scene',
      'Scene 1: Scene 1', 'Scene 2: Scene 2', 'Scene 3: Scene 3',
      'Captions', 'Sound on', 'Voice on', 'Full screen',
    ]);
    expect(bar.querySelector('.emk-count')!.textContent).toBe('1 / 3');
    expect(bar.querySelector('a')).toBeNull();
    expect(bar.querySelector('svg')).not.toBeNull();

    await click('Next scene');
    expect(el.textContent).toContain('2 / 3');
    await click('Scene 1: Scene 1');
    expect(show.go).toHaveBeenCalledWith(0);
    expect(el.textContent).toContain('1 / 3');
    await click('Sound on');
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');
    await click('Pause');
    expect(show.toggle).toHaveBeenCalledOnce();
    expect(button('Play')).toBeTruthy();

    unmount(app); app = null;
    expect(show.destroy).toHaveBeenCalled();
    expect(show.listeners.size).toBe(0);
  });

  it('captions the current scene when CC is on, and hides CC without voice lines', async () => {
    chromeLines = [
      { scene: 's0', text: 'Opening line.' }, { scene: 's1', text: 'Second line.' }, { scene: 's2', text: 'Closing line.' },
    ];
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    const cap = () => el.querySelector<HTMLElement>('.emk-cap')!;
    expect(cap().hidden).toBe(true);
    await click('Captions');
    expect(button('Captions').getAttribute('aria-pressed')).toBe('true');
    expect(cap().hidden).toBe(false);
    expect(cap().textContent).toBe('Opening line.');
    await click('Next scene');
    expect(cap().textContent).toBe('Second line.');
    unmount(app);

    chromeLines = null;
    app = mount(pkg.MotionShow, { target: el, props: { film: 'g' } });
    await settle();
    expect(el.querySelector('.emk-cc')).toBeNull();
  });

  it('keeps CC on across scenes (no chrome remount on advance)', async () => {
    chromeLines = [
      { scene: 's0', text: 'Opening line.' }, { scene: 's1', text: 'Second line.' }, { scene: 's2', text: 'Closing line.' },
    ];
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    await click('Captions');
    const bar = el.querySelector('.emk-bar')!;
    await click('Next scene');
    expect(el.querySelector('.emk-bar')).toBe(bar);
    expect(button('Captions').getAttribute('aria-pressed')).toBe('true');
    const cap = el.querySelector<HTMLElement>('.emk-cap')!;
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Second line.');
    unmount(app);
  });

  it('shows the standard chrome before the first play in poster mode, the poster over the stage only', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', poster: true, title: 'T', length: '0:30' } });
    await settle();
    // The bar is there before anything plays: transport, ticks, count, CC, mute, voice, fullscreen.
    const bar = el.querySelector('.emk-bar')!;
    expect(bar.getAttribute('role')).toBe('toolbar');
    expect([...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous scene', 'Play', 'Next scene',
      'Scene 1: Scene 1', 'Scene 2: Scene 2', 'Scene 3: Scene 3',
      'Captions', 'Sound on', 'Voice on', 'Full screen',
    ]);
    // The poster covers the stage, not the bar: the bar stays the same node (and clickable) across a notification.
    const poster = el.querySelector('.ms-poster') as HTMLButtonElement;
    expect(el.querySelector('.ms-fit')!.contains(poster)).toBe(true);
    shows[0].play();
    await settle();
    expect(el.querySelector('.emk-bar')).toBe(bar);
    // Playing from the bar starts the poster show, with sound.
    await click('Pause');
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(shows[0].state.sound).toBe(true);
  });

  it('leaves mute as the single master control with voiceToggle false', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', voiceToggle: false } });
    await settle();
    expect(el.querySelector('.emk-voice')).toBeNull();
    await click('Sound on');
    expect(shows[0].setSound).toHaveBeenCalledWith(true);
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');
  });

  it('links the pop-out to playerHref, or to fullscreenHref when playerHref is absent', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', playerHref: '/show/f' } });
    await settle();
    expect(el.querySelector('a.emk-popout')!.getAttribute('href')).toBe('/show/f');
    unmount(app);

    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', fullscreenHref: '/show/f' } });
    await settle();
    expect(el.querySelector('a.emk-popout')!.getAttribute('href')).toBe('/show/f');
    unmount(app);

    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', playerHref: '/p', fullscreenHref: '/fs' } });
    await settle();
    expect(el.querySelector('a.emk-popout')!.getAttribute('href')).toBe('/p');
  });

  it('swaps the chrome glyphs in icons', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', icons: { pause: '<svg data-x="1"></svg>' } } });
    await settle();
    expect(el.querySelector('.emk-toggle')!.innerHTML).toContain('data-x="1"');
    expect(el.querySelector('.emk-next')!.innerHTML).not.toContain('data-x="1"');
  });

  it('renders custom ticks from renderTick, void keeping the default', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', renderTick: (_t, i) => (i === 0 ? '<em>first</em>' : undefined) } });
    await settle();
    const ticks = [...el.querySelectorAll('.emk-tick')];
    expect(ticks).toHaveLength(3);
    expect(ticks[0].innerHTML).toBe('<em>first</em>');
    expect(ticks[1].querySelector('span')).not.toBeNull();
  });

  it('with controls=false, plays the show with no chrome', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', controls: false } });
    await settle();
    expect(createShow).toHaveBeenCalledOnce();
    expect(el.querySelector('.emk-bar')).toBeNull();
  });

  it('keeps O/R/Home keys on the box while the chrome takes the rest', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    const show = shows[0], box = el.querySelector('.motion-show')!;
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    expect(show.replay).toHaveBeenCalledOnce();
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(show.restart).toHaveBeenCalledOnce();
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
    expect(show.setLayout).toHaveBeenCalledWith('portrait');
    // Space reaches the chrome exactly once: the box must not handle it too.
    box.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(show.toggle).toHaveBeenCalledOnce();
  });

  it('with poster, opens on the cover until played, the chrome already mounted', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', poster: true, title: 'F' } });
    await settle();
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ poster: true });
    expect(el.querySelector('.emk-bar')).not.toBeNull();
    expect(button('Play the film: F')).toBeTruthy();

    await click('Play the film: F');
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(el.textContent).toContain('1 / 3');
  });

  it('with description, opens the voiceover script under a Description button; without lines, no button', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', description: true } });
    await settle();
    expect(vi.mocked(voiceLines)).toHaveBeenCalledWith('f', 'en');
    expect(el.querySelector('.ms-desc p')).toBeNull();
    await click('Description ▸');
    expect([...el.querySelectorAll('.ms-desc p')].map((p) => p.textContent)).toEqual(['Line A.', 'Line B.']);
    expect(button('Description ▾').getAttribute('aria-expanded')).toBe('true');
    await click('Description ▾');
    expect(el.querySelector('.ms-desc p')).toBeNull();
    unmount(app);

    vi.mocked(voiceLines).mockResolvedValueOnce(null);
    app = mount(pkg.MotionShow, { target: el, props: { film: 'g', description: true } });
    await settle();
    expect(el.textContent).not.toContain('Description');
  });

  it('drops lines that arrive after unmount', async () => {
    let release!: (v: VoiceLine[] | null) => void;
    vi.mocked(voiceLines).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', description: true } });
    await settle();
    unmount(app); app = null;
    release([{ scene: 'a', text: 'Late.' }]);
    await settle();
    expect(el.querySelector('p')).toBeNull();
  });

  it('with a cover, paints the image and creates nothing until the first click, which plays it with sound on', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', cover: '/covers/f.jpg', title: 'F', length: '1 min' } });
    await settle();
    expect(createShow).not.toHaveBeenCalled();
    expect(el.querySelector('.emk-bar')).toBeNull();
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/covers/f.jpg');
    expect(button('Play the film: F').textContent).toContain('Play the film · 1 min');

    await click('Play the film: F');
    expect(createShow).toHaveBeenCalledOnce();
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ poster: true });
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('1 / 3');
    // start() plays with sound on: the chrome's mute toggle shows it pressed.
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');
  });

  it('locks the fit box to the layout aspect ratio from core SIZES', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    expect(fitStyle()).toContain('aspect-ratio: 1920 / 1080');
    expect(fitStyle()).toContain('width: 100%');
    expect(fitStyle()).toContain('max-height: 100%');
    expect(fitStyle()).toContain('margin: auto');
    unmount(app);

    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', layout: 'figure' } });
    await settle();
    expect(fitStyle()).toContain('aspect-ratio: 1600 / 1000');
    expect(fitStyle()).toContain('width: 100%');
    expect(fitStyle()).toContain('max-height: 100%');
    unmount(app);

    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', layout: 'portrait' } });
    await settle();
    expect(fitStyle()).toContain('aspect-ratio: 1080 / 1920');
    expect(fitStyle()).toContain('height: 100%');
    expect(fitStyle()).toContain('max-width: 100%');
    expect(fitStyle()).toContain('margin: auto');
  });

  it('re-aspects the fit box when the show layout changes, keeping fit() wired', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', layout: 'portrait' } });
    flushSync();
    // The show has not attached yet: the box rests at the default landscape ratio.
    expect(fitStyle()).toContain('aspect-ratio: 1920 / 1080');
    await settle();
    // Attached and synced to portrait: height-driven now.
    expect(fitStyle()).toContain('aspect-ratio: 1080 / 1920');
    expect(fitStyle()).toContain('height: 100%');
    expect(shows[0].fit).toHaveBeenCalled();
  });

  it('keeps the cover filling over the aspect-locked box until the first click', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', cover: '/covers/f.jpg', title: 'F' } });
    await settle();
    expect(createShow).not.toHaveBeenCalled();
    expect(fitStyle()).toContain('aspect-ratio: 1920 / 1080');
    const img = el.querySelector('img.ms-cover')!;
    expect(img.getAttribute('src')).toBe('/covers/f.jpg');
    expect(img.closest('button.ms-poster')).not.toBeNull();

    await click('Play the film: F');
    expect(el.querySelector('img.ms-cover')).toBeNull();
    expect(fitStyle()).toContain('aspect-ratio: 1920 / 1080');
  });
});
