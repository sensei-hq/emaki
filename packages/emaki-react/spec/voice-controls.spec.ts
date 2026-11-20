// Film voice controls in React: MotionScene captions its figure behind a CC toggle, and both MotionShow
// and MotionScene take controlled sound/cc/voice with onSoundChange/onCcChange/onVoiceChange — a defined
// prop drives the player (the app's state wins over the toggles) while every user toggle emits. Undefined
// props keep today's per-instance behavior. (Figures have no voice toggle of their own: voice is an input
// there, cut app-wide from the show's chrome; React figures sound only when the app drives them.)
import { act, createElement as h, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachScene, createShow, sceneSound, useSource, voiceLines } from '@senseihq/emaki';
import { MotionScene, MotionShow } from '../src/index.js';
import { FakeResizeObserver, fakeShow, fakeView, type FakeShow } from './fakes.js';

vi.mock('@senseihq/emaki', async (actual) => ({
  ...(await actual<typeof import('@senseihq/emaki')>()),
  attachScene: vi.fn(), createShow: vi.fn(), sceneSound: vi.fn(), voiceLines: vi.fn(),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

let root: Root, el: HTMLElement, views: ReturnType<typeof fakeView>[], shows: FakeShow[], sounds: FakeSound[];
beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  root = createRoot(el);
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  views = []; shows = []; sounds = [];
  vi.mocked(attachScene).mockReset().mockImplementation(() => { const v = fakeView(); views.push(v); return v; });
  vi.mocked(createShow).mockReset().mockImplementation(async (_stage, _film, o) => { const s = fakeShow(3, !o?.poster); shows.push(s); return s as never; });
  vi.mocked(sceneSound).mockReset().mockImplementation(() => { const s = fakeSceneSound(); sounds.push(s); return s as never; });
  vi.mocked(voiceLines).mockReset().mockResolvedValue([{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }]);
  // The chrome reads voice lines through the core's own import (past this file's voiceLines mock).
  useSource({
    films: async () => [], css: async () => '', scene: async () => null,
    voiceText: async () => [
      { scene: 's0', text: 'Opening line.' }, { scene: 's1', text: 'Second line.' }, { scene: 's2', text: 'Closing line.' },
    ],
  });
});
afterEach(() => { act(() => root.unmount()); el.remove(); vi.unstubAllGlobals(); });
const render = (node: ReactNode) => act(async () => root.render(node));
const unmount = () => { act(() => root.unmount()); root = createRoot(el); };
const button = (name: string) => [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!;
const click = (name: string) => act(() => button(name).dispatchEvent(new MouseEvent('click', { bubbles: true })));
// Controlled props do not exist on the components yet: props crossing that surface go as `any` (type-clean red).
const controlled = (props: Record<string, unknown>) => props as never;

describe('MotionScene captions', () => {
  it('captions the figure behind a CC toggle', async () => {
    await render(h(MotionScene, { film: 'f', scene: 'a' }));
    const cc = el.querySelector('.emk-scene-cc') as HTMLButtonElement;
    expect(cc).not.toBeNull();
    const cap = el.querySelector('.emk-scene-cap') as HTMLElement;
    expect(cap.getAttribute('aria-live')).toBe('polite');
    expect(cap.hidden).toBe(true);
    act(() => { cc.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(cc.getAttribute('aria-pressed')).toBe('true');
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
  });

  it('renders no caption toggle or overlay without a line for the scene', async () => {
    vi.mocked(sceneSound).mockImplementation(() => { const s = fakeSceneSound(null); sounds.push(s); return s as never; });
    await render(h(MotionScene, { film: 'f', scene: 'a' }));
    expect(el.querySelector('.emk-scene-cc')).toBeNull();
    expect(el.querySelector('.emk-scene-cap')).toBeNull();
  });

  it('a controlled cc shows the overlay without a click', async () => {
    await render(h(MotionScene, controlled({ film: 'f', scene: 'a', cc: true })));
    const cap = el.querySelector('.emk-scene-cap') as HTMLElement;
    expect(cap).not.toBeNull();
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
  });

  it('the CC toggle emits onCcChange', async () => {
    const onCcChange = vi.fn();
    await render(h(MotionScene, controlled({ film: 'f', scene: 'a', onCcChange })));
    act(() => { (el.querySelector('.emk-scene-cc') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCcChange).toHaveBeenCalledWith(true);
  });
});

describe('MotionScene controlled sound and voice', () => {
  it('a controlled sound drives the figure sound', async () => {
    await render(h(MotionScene, controlled({ film: 'f', scene: 'a', sound: true })));
    expect(sceneSound).toHaveBeenCalled();
    expect(sounds[0].toggle).toHaveBeenCalled();
    expect(sounds[0].on).toBe(true);
  });

  it('a controlled voice reaches the figure sound', async () => {
    await render(h(MotionScene, controlled({ film: 'f', scene: 'a', sound: true, voice: false })));
    expect(sounds[0].setVoice).toHaveBeenCalledWith(false);
  });

  it('undefined stays uncontrolled: per-instance captions, voice on, silent', async () => {
    await render(h(MotionScene, { film: 'f', scene: 'a' }));
    act(() => { (el.querySelector('.emk-scene-cc') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect((el.querySelector('.emk-scene-cap') as HTMLElement).hidden).toBe(false);
    expect(sounds[0].voiceOn).toBe(true);
    expect(sounds[0].setVoice).not.toHaveBeenCalled();
    expect(sounds[0].on).toBe(false);
  });
});

describe('MotionShow controlled sound, captions and voice', () => {
  it('a defined sound drives mute while the toggle emits onSoundChange', async () => {
    const onSoundChange = vi.fn();
    await render(h(MotionShow, controlled({ film: 'f', sound: false, onSoundChange })));
    expect(shows[0].setSound).toHaveBeenCalledWith(false);
    click('Sound on');
    expect(onSoundChange).toHaveBeenCalledWith(true);
    expect(shows[0].setSound).not.toHaveBeenCalledWith(true);
    expect(button('Sound on').getAttribute('aria-pressed')).toBe('false');
  });

  it('a controlled cc shows captions without a click', async () => {
    await render(h(MotionShow, controlled({ film: 'f', cc: true })));
    const cap = el.querySelector('.emk-cap') as HTMLElement;
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Opening line.');
  });

  it('the CC toggle emits onCcChange', async () => {
    const onCcChange = vi.fn();
    await render(h(MotionShow, controlled({ film: 'f', onCcChange })));
    click('Captions');
    expect(onCcChange).toHaveBeenCalledWith(true);
  });

  it('a controlled voice reaches the show', async () => {
    await render(h(MotionShow, controlled({ film: 'f', voice: false })));
    expect((shows[0] as unknown as { setVoice: unknown }).setVoice).toBeTypeOf('function');
    expect((shows[0] as unknown as { setVoice: (on: boolean) => void }).setVoice).toHaveBeenCalledWith(false);
  });

  it('the VO toggle emits onVoiceChange while the prop wins', async () => {
    const onVoiceChange = vi.fn();
    await render(h(MotionShow, controlled({ film: 'f', voice: true, onVoiceChange })));
    const vo = el.querySelector('.emk-voice') as HTMLButtonElement;
    expect(vo).not.toBeNull();
    act(() => { vo.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onVoiceChange).toHaveBeenCalledWith(false);
    expect(vo.getAttribute('aria-pressed')).toBe('true');
  });

  it('one app state drives the show and its figures', async () => {
    const film = (cc: boolean) => [
      h(MotionShow, controlled({ film: 'f', cc, key: 'show' })),
      h(MotionScene, controlled({ film: 'f', scene: 'a', cc, key: 'fig' })),
    ];
    await render(h('div', null, ...film(false)));
    expect((el.querySelector('.emk-cap') as HTMLElement).hidden).toBe(true);
    await render(h('div', null, ...film(true)));
    expect((el.querySelector('.emk-cap') as HTMLElement).hidden).toBe(false);
    expect((el.querySelector('.emk-cap') as HTMLElement).textContent).toBe('Opening line.');
    expect((el.querySelector('.emk-scene-cap') as HTMLElement).hidden).toBe(false);
    expect((el.querySelector('.emk-scene-cap') as HTMLElement).textContent).toBe('Line A.');
  });

  it('undefined stays uncontrolled: per-instance toggles, voice on', async () => {
    await render(h(MotionShow, { film: 'f' }));
    click('Sound on');
    expect(button('Sound off').getAttribute('aria-pressed')).toBe('true');
    click('Captions');
    expect(button('Captions').getAttribute('aria-pressed')).toBe('true');
    expect((shows[0].state as unknown as { voiceOn?: boolean }).voiceOn).toBe(true);
    unmount();
  });
});
