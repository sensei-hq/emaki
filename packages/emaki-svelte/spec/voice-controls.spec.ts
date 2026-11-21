// Film voice controls in Svelte: MotionScene captions its figure behind a CC toggle, and both MotionShow
// and MotionScene take controlled sound/cc/voice with onsoundchange/onccchange/onvoicechange — a defined prop
// drives the player (the app's state wins over the toggles) while every user toggle emits. Undefined props
// keep today's per-instance behavior. (Figures have no voice toggle of their own: voice is an input there,
// cut app-wide from the show's chrome.)
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, DEFAULT_CHROME_ICONS, sceneSound, useSource, voiceLines, type VoiceLine } from '@senseihq/emaki';
import * as pkg from '../src/lib/index.js';
import Harness from './controlled-harness.svelte';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => ({
  ...(await actual<typeof import('@senseihq/emaki')>()),
  attachScene: vi.fn(), createShow: vi.fn(), sceneSound: vi.fn(), voiceLines: vi.fn(),
}));

/** A figure sound with the post-cut surface: available, the caption line, on/off, and the voice cut. */
function fakeSceneSound(line: string | null = 'Line A.') {
  const s = {
    available: Promise.resolve(true),
    caption: Promise.resolve(line),
    on: false,
    voiceOn: true,
    toggle: vi.fn(async () => { s.on = !s.on; }),
    cue: vi.fn(async () => {}),
    setVoice: vi.fn((on: boolean) => { s.voiceOn = on; }),
    setLocale: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
  return s;
}
type FakeSound = ReturnType<typeof fakeSceneSound>;

let el: HTMLElement, views: ReturnType<typeof fakeView>[], shows: FakeShow[], sounds: FakeSound[];
let app: Record<string, unknown> | null;
// What the chrome's own voice-line lookup sees (it reads the film source directly, past the voiceLines mock above).
let chromeLines: VoiceLine[] | null;
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  views = []; shows = []; sounds = []; app = null;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async (_host, _slug, opts) => { const s = fakeShow(3, !opts?.poster); shows.push(s); return s as never; });
  vi.mocked(sceneSound).mockReset().mockImplementation(() => { const s = fakeSceneSound(); sounds.push(s); return s as never; });
  vi.mocked(voiceLines).mockReset().mockResolvedValue([{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }]);
  chromeLines = [
    { scene: 's0', text: 'Opening line.' }, { scene: 's1', text: 'Second line.' }, { scene: 's2', text: 'Closing line.' },
  ];
  useSource({ films: async () => [], css: async () => '', scene: async () => null, voiceText: async () => chromeLines });
});
afterEach(() => { if (app) unmount(app); el.remove(); vi.unstubAllGlobals(); });
const settle = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); flushSync(); } };
const button = (name: string) => [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!;
const click = async (name: string) => { button(name).click(); await settle(); };
const key = async (k: string) => { el.querySelector('.emk-bar')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await settle(); };
// Controlled props do not exist on the components yet: props crossing that surface go as `any` (type-clean red).
const controlled = (props: Record<string, unknown>) => props as never;

describe('MotionScene captions', () => {
  it('captions the figure behind a CC toggle', async () => {
    app = mount(pkg.MotionScene, { target: el, props: { film: 'f', scene: 'a' } });
    await settle();
    const cc = el.querySelector('.emk-scene-cc') as HTMLButtonElement;
    expect(cc).not.toBeNull();
    const cap = el.querySelector('.emk-scene-cap') as HTMLElement;
    expect(cap.getAttribute('aria-live')).toBe('polite');
    expect(cap.hidden).toBe(true);
    cc.click();
    await settle();
    expect(cc.getAttribute('aria-pressed')).toBe('true');
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
  });

  it('renders no caption toggle or overlay without a line for the scene', async () => {
    vi.mocked(sceneSound).mockImplementation(() => { const s = fakeSceneSound(null); sounds.push(s); return s as never; });
    app = mount(pkg.MotionScene, { target: el, props: { film: 'f', scene: 'a' } });
    await settle();
    expect(el.querySelector('.emk-scene-cc')).toBeNull();
    expect(el.querySelector('.emk-scene-cap')).toBeNull();
  });

  it('a controlled cc shows the overlay without a click', async () => {
    app = mount(pkg.MotionScene, { target: el, props: controlled({ film: 'f', scene: 'a', cc: true }) });
    await settle();
    const cap = el.querySelector('.emk-scene-cap') as HTMLElement;
    expect(cap).not.toBeNull();
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
  });

  it('the CC toggle emits onccchange', async () => {
    const onccchange = vi.fn();
    app = mount(pkg.MotionScene, { target: el, props: controlled({ film: 'f', scene: 'a', onccchange }) });
    await settle();
    (el.querySelector('.emk-scene-cc') as HTMLButtonElement).click();
    await settle();
    expect(onccchange).toHaveBeenCalledWith(true);
  });
});

describe('MotionScene controlled sound and voice', () => {
  it('a controlled sound drives the speaker', async () => {
    app = mount(pkg.MotionScene, { target: el, props: controlled({ film: 'f', scene: 'a', sound: true }) });
    await settle();
    expect(sounds[0].toggle).toHaveBeenCalled();
    expect(sounds[0].on).toBe(true);
  });

  it('the speaker toggle emits onsoundchange while the prop wins', async () => {
    const onsoundchange = vi.fn();
    app = mount(pkg.MotionScene, { target: el, props: controlled({ film: 'f', scene: 'a', sound: false, onsoundchange }) });
    await settle();
    await click('Turn sound on');
    expect(onsoundchange).toHaveBeenCalledWith(true);
    expect(sounds[0].toggle).not.toHaveBeenCalled();
    expect(button('Turn sound on').getAttribute('aria-pressed')).toBe('false');
  });

  it('a controlled voice reaches the figure sound', async () => {
    app = mount(pkg.MotionScene, { target: el, props: controlled({ film: 'f', scene: 'a', voice: false }) });
    await settle();
    expect(sounds[0].setVoice).toHaveBeenCalledWith(false);
  });

  it('undefined stays uncontrolled: per-instance speaker and captions, voice on', async () => {
    app = mount(pkg.MotionScene, { target: el, props: { film: 'f', scene: 'a' } });
    await settle();
    await click('Turn sound on');
    expect(sounds[0].on).toBe(true);
    expect(button('Turn sound off').getAttribute('aria-pressed')).toBe('true');
    (el.querySelector('.emk-scene-cc') as HTMLButtonElement).click();
    await settle();
    expect((el.querySelector('.emk-scene-cap') as HTMLElement).hidden).toBe(false);
    expect(sounds[0].voiceOn).toBe(true);
    expect(sounds[0].setVoice).not.toHaveBeenCalled();
  });
});

describe('MotionShow controlled sound, captions and voice', () => {
  it('a defined sound drives mute while the toggle emits onsoundchange', async () => {
    const onsoundchange = vi.fn();
    app = mount(pkg.MotionShow, { target: el, props: controlled({ film: 'f', sound: false, onsoundchange }) });
    await settle();
    expect(shows[0].setSound).toHaveBeenCalledWith(false);
    await click('Sound on');
    expect(onsoundchange).toHaveBeenCalledWith(true);
    expect(shows[0].setSound).not.toHaveBeenCalledWith(true);
    expect(button('Sound on').getAttribute('aria-pressed')).toBe('false');
  });

  it('the M key emits onsoundchange while a defined sound wins', async () => {
    const onsoundchange = vi.fn();
    app = mount(pkg.MotionShow, { target: el, props: controlled({ film: 'f', sound: false, onsoundchange }) });
    await settle();
    await key('m');
    expect(onsoundchange).toHaveBeenCalledWith(true);
    expect(shows[0].setSound).not.toHaveBeenCalledWith(true);
  });

  it('the M key flips an uncontrolled show', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    await key('m');
    expect(shows[0].setSound).toHaveBeenCalledWith(true);
  });

  it('other keys pass through untouched', async () => {
    const onsoundchange = vi.fn();
    app = mount(pkg.MotionShow, { target: el, props: controlled({ film: 'f', sound: false, onsoundchange }) });
    await settle();
    await key('x');
    expect(onsoundchange).not.toHaveBeenCalled();
    expect(shows[0].setSound).not.toHaveBeenCalledWith(true);
  });

  it('a controlled cc shows captions without a click', async () => {
    app = mount(pkg.MotionShow, { target: el, props: controlled({ film: 'f', cc: true }) });
    await settle();
    const cap = el.querySelector('.emk-cap') as HTMLElement;
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Opening line.');
  });

  it('the CC toggle emits onccchange', async () => {
    const onccchange = vi.fn();
    app = mount(pkg.MotionShow, { target: el, props: controlled({ film: 'f', onccchange }) });
    await settle();
    await click('Captions');
    expect(onccchange).toHaveBeenCalledWith(true);
  });

  it('a controlled voice reaches the show', async () => {
    app = mount(pkg.MotionShow, { target: el, props: controlled({ film: 'f', voice: false }) });
    await settle();
    expect((shows[0] as unknown as { setVoice: unknown }).setVoice).toBeTypeOf('function');
    expect((shows[0] as unknown as { setVoice: (on: boolean) => void }).setVoice).toHaveBeenCalledWith(false);
  });

  it('the VO toggle emits onvoicechange while the prop wins', async () => {
    const onvoicechange = vi.fn();
    app = mount(pkg.MotionShow, { target: el, props: controlled({ film: 'f', voice: true, onvoicechange }) });
    await settle();
    const vo = el.querySelector('.emk-voice') as HTMLButtonElement;
    expect(vo).not.toBeNull();
    vo.click();
    await settle();
    expect(onvoicechange).toHaveBeenCalledWith(false);
    expect(vo.getAttribute('aria-pressed')).toBe('true');
  });

  it('flipping the app state drives the player', async () => {
    app = mount(Harness, { target: el, props: { film: 'f' } });
    await settle();
    expect(shows[0].setSound).toHaveBeenCalledWith(false);
    await click('flip sound on');
    expect(shows[0].setSound).toHaveBeenCalledWith(true);
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');
  });

  it('undefined stays uncontrolled: per-instance toggles, voice on', async () => {
    app = mount(pkg.MotionShow, { target: el, props: { film: 'f' } });
    await settle();
    await click('Sound on');
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');
    await click('Captions');
    expect(button('Captions').getAttribute('aria-pressed')).toBe('true');
    expect((shows[0].state as unknown as { voiceOn?: boolean }).voiceOn).toBe(true);
  });
});

describe('MotionScene speaker icon', () => {
  const flat = (s: string) => s.replace(/\s+/g, '').replace(/><\/path>/g, '/>');
  it('uses the chrome speaker glyphs', async () => {
    app = mount(pkg.MotionScene, { target: el, props: { film: 'f', scene: 'a' } });
    await settle();
    const btn = el.querySelector('.ms-snd') as HTMLButtonElement;
    expect(flat(btn.innerHTML)).toBe(flat(DEFAULT_CHROME_ICONS.soundOff));
    btn.click();
    await settle();
    expect(flat(btn.innerHTML)).toBe(flat(DEFAULT_CHROME_ICONS.soundOn));
  });
});
