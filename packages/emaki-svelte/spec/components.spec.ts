// The Svelte components over the core, through the package's entry: each mounts the core's DOM side (attachScene,
// createShow) into its element, renders chrome from reactivePlayer/reactiveShow, and tears it down on unmount.
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, installCapture, ScenePlayerState, voiceLines, type VoiceLine } from '@senseihq/emaki';
import * as pkg from '../src/lib/index.js';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => ({
  ...(await actual<typeof import('@senseihq/emaki')>()),
  attachScene: vi.fn(), createShow: vi.fn(), installCapture: vi.fn(), voiceLines: vi.fn(),
}));

let el: HTMLElement, views: ReturnType<typeof fakeView>[], shows: FakeShow[], app: Record<string, unknown> | null;
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  views = []; shows = []; app = null;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async () => { const s = fakeShow(); shows.push(s); return s as never; });
  vi.mocked(voiceLines).mockReset().mockResolvedValue([{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }]);
});
afterEach(() => { if (app) unmount(app); el.remove(); vi.unstubAllGlobals(); });
const settle = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); flushSync(); } };
const button = (name: string) => [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!;
const click = async (name: string) => { button(name).click(); await settle(); };

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
  it('creates the show, mirrors it in its controls, and destroys it on unmount', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    expect(vi.mocked(createShow).mock.calls[0].slice(1)).toEqual(['f', { locale: 'en', layout: 'landscape', mode: 'auto', slide: 1, loop: false, poster: false }]);
    const show = shows[0];
    expect(el.textContent).toContain('1 / 3');
    await click('Next scene');
    expect(el.textContent).toContain('2 / 3');
    await click('Sound off');
    expect(button('Sound on').getAttribute('aria-pressed')).toBe('true');
    unmount(app); app = null;
    expect(show.destroy).toHaveBeenCalled();
    expect(show.listeners.size).toBe(0);
  });

  it('with description, opens the voiceover script under a Description button; without lines, no button', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f', description: true } });
    await settle();
    expect(vi.mocked(voiceLines)).toHaveBeenCalledWith('f', 'en');
    expect(el.querySelector('p')).toBeNull();
    await click('Description ▸');
    expect([...el.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Line A.', 'Line B.']);
    expect(button('Description ▾').getAttribute('aria-expanded')).toBe('true');
    await click('Description ▾');
    expect(el.querySelector('p')).toBeNull();
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
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/covers/f.jpg');
    expect(button('Play the film: F').textContent).toContain('Play the film · 1 min');

    await click('Play the film: F');
    expect(createShow).toHaveBeenCalledOnce();
    expect(vi.mocked(createShow).mock.calls[0][2]).toMatchObject({ poster: true });
    expect(shows[0].start).toHaveBeenCalledOnce();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('1 / 3');
  });
});
