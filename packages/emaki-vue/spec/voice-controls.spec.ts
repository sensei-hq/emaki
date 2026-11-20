// Film voice controls in Vue: MotionScene captions its figure behind a CC toggle, and both MotionShow
// and MotionScene take controlled sound/cc/voice with update:sound/update:cc/update:voice — a defined prop
// drives the player (the app's state wins over the toggles) while every user toggle emits. Undefined props
// keep today's per-instance behavior. (Figures have no voice toggle of their own: voice is an input there,
// cut app-wide from the show's chrome; Vue figures sound only when the app drives them.)
import { createApp, h, nextTick, shallowReactive, type App, type Component } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, sceneSound, useSource, voiceLines } from '@senseihq/emaki';
import { MotionScene, MotionShow } from '../src/index.js';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => {
  const core = await actual<typeof import('@senseihq/emaki')>();
  return { ...core, attachScene: vi.fn(), createShow: vi.fn(), sceneSound: vi.fn(), voiceLines: vi.fn() };
});

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

let el: HTMLElement, app: App | null, views: ReturnType<typeof fakeView>[], shows: FakeShow[], sounds: FakeSound[];
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  views = []; shows = []; sounds = [];
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async (_stage, _film, o) => { const s = fakeShow(3, !o?.poster); shows.push(s); return s as never; });
  vi.mocked(sceneSound).mockReset().mockImplementation(() => { const s = fakeSceneSound(); sounds.push(s); return s as never; });
  vi.mocked(voiceLines).mockReset().mockResolvedValue([{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }]);
  // The real chrome asks the real registry for voice lines (the mock above only covers the wrapper's own import).
  useSource({
    films: async () => [], css: async () => '', scene: async () => null,
    voiceText: async () => [
      { scene: 's0', text: 'Opening line.' }, { scene: 's1', text: 'Second line.' }, { scene: 's2', text: 'Closing line.' },
    ],
  });
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
// Controlled props do not exist on the components yet: props crossing that surface go as `any` (type-clean red).
const controlled = (props: Record<string, unknown>) => props as never;

describe('MotionScene captions', () => {
  it('captions the figure behind a CC toggle', async () => {
    await mount(MotionScene, { film: 'f', scene: 'a' });
    const cc = el.querySelector('.emk-scene-cc') as HTMLButtonElement;
    expect(cc).not.toBeNull();
    const cap = el.querySelector('.emk-scene-cap') as HTMLElement;
    expect(cap.getAttribute('aria-live')).toBe('polite');
    expect(cap.hidden).toBe(true);
    cc.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(cc.getAttribute('aria-pressed')).toBe('true');
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
  });

  it('renders no caption toggle or overlay without a line for the scene', async () => {
    vi.mocked(sceneSound).mockImplementation(() => { const s = fakeSceneSound(null); sounds.push(s); return s as never; });
    await mount(MotionScene, { film: 'f', scene: 'a' });
    expect(el.querySelector('.emk-scene-cc')).toBeNull();
    expect(el.querySelector('.emk-scene-cap')).toBeNull();
  });

  it('a controlled cc shows the overlay without a click', async () => {
    await mount(MotionScene, controlled({ film: 'f', scene: 'a', cc: true }));
    const cap = el.querySelector('.emk-scene-cap') as HTMLElement;
    expect(cap).not.toBeNull();
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
  });

  it('the CC toggle emits update:cc', async () => {
    const onUpdateCc = vi.fn();
    await mount(MotionScene, controlled({ film: 'f', scene: 'a' }), { 'onUpdate:cc': onUpdateCc });
    (el.querySelector('.emk-scene-cc') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(onUpdateCc).toHaveBeenCalledWith(true);
  });
});

describe('MotionScene controlled sound and voice', () => {
  it('a controlled sound drives the figure sound', async () => {
    await mount(MotionScene, controlled({ film: 'f', scene: 'a', sound: true }));
    expect(sceneSound).toHaveBeenCalled();
    expect(sounds[0].toggle).toHaveBeenCalled();
    expect(sounds[0].on).toBe(true);
  });

  it('a controlled voice reaches the figure sound', async () => {
    await mount(MotionScene, controlled({ film: 'f', scene: 'a', sound: true, voice: false }));
    expect(sounds[0].setVoice).toHaveBeenCalledWith(false);
  });

  it('undefined stays uncontrolled: per-instance captions, voice on, silent', async () => {
    await mount(MotionScene, { film: 'f', scene: 'a' });
    (el.querySelector('.emk-scene-cc') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect((el.querySelector('.emk-scene-cap') as HTMLElement).hidden).toBe(false);
    expect(sounds[0].voiceOn).toBe(true);
    expect(sounds[0].setVoice).not.toHaveBeenCalled();
    expect(sounds[0].on).toBe(false);
  });
});

describe('MotionShow controlled sound, captions and voice', () => {
  it('a defined sound drives mute while the toggle emits update:sound', async () => {
    const onUpdateSound = vi.fn();
    await mount(MotionShow, controlled({ film: 'f', sound: false }), { 'onUpdate:sound': onUpdateSound });
    expect(shows[0].setSound).toHaveBeenCalledWith(false);
    await click('Sound on');
    expect(onUpdateSound).toHaveBeenCalledWith(true);
    expect(shows[0].setSound).not.toHaveBeenCalledWith(true);
    expect(button('Sound on').getAttribute('aria-pressed')).toBe('false');
  });

  it('a controlled cc shows captions without a click', async () => {
    await mount(MotionShow, controlled({ film: 'f', cc: true }));
    const cap = el.querySelector('.emk-cap') as HTMLElement;
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Opening line.');
  });

  it('the CC toggle emits update:cc', async () => {
    const onUpdateCc = vi.fn();
    await mount(MotionShow, controlled({ film: 'f' }), { 'onUpdate:cc': onUpdateCc });
    await click('Captions');
    expect(onUpdateCc).toHaveBeenCalledWith(true);
  });

  it('a controlled voice reaches the show', async () => {
    await mount(MotionShow, controlled({ film: 'f', voice: false }));
    expect((shows[0] as unknown as { setVoice: unknown }).setVoice).toBeTypeOf('function');
    expect((shows[0] as unknown as { setVoice: (on: boolean) => void }).setVoice).toHaveBeenCalledWith(false);
  });

  it('the VO toggle emits update:voice while the prop wins', async () => {
    const onUpdateVoice = vi.fn();
    await mount(MotionShow, controlled({ film: 'f', voice: true }), { 'onUpdate:voice': onUpdateVoice });
    const vo = el.querySelector('.emk-voice') as HTMLButtonElement;
    expect(vo).not.toBeNull();
    vo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(onUpdateVoice).toHaveBeenCalledWith(false);
    expect(vo.getAttribute('aria-pressed')).toBe('true');
  });

  it('one app state drives the show and its figures', async () => {
    const cc = shallowReactive({ value: false });
    app = createApp({ render: () => h('div', null, [
      h(MotionShow, { film: 'f', cc: cc.value } as never),
      h(MotionScene, { film: 'f', scene: 'a', cc: cc.value } as never),
    ]) });
    app.mount(el);
    await settle();
    expect((el.querySelector('.emk-cap') as HTMLElement).hidden).toBe(true);
    cc.value = true;
    await settle();
    expect((el.querySelector('.emk-cap') as HTMLElement).hidden).toBe(false);
    expect((el.querySelector('.emk-cap') as HTMLElement).textContent).toBe('Opening line.');
    expect((el.querySelector('.emk-scene-cap') as HTMLElement).hidden).toBe(false);
    expect((el.querySelector('.emk-scene-cap') as HTMLElement).textContent).toBe('Line A.');
    unmount();
  });

  it('undefined stays uncontrolled: per-instance toggles, voice on', async () => {
    await mount(MotionShow, { film: 'f' });
    await click('Sound on');
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');
    await click('Captions');
    expect(button('Captions').getAttribute('aria-pressed')).toBe('true');
    expect((shows[0].state as unknown as { voiceOn?: boolean }).voiceOn).toBe(true);
  });
});
