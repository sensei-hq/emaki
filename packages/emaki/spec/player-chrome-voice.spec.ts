// The chrome's voiceover toggle: a VO button beside mute (the `voice` icon, overridable like every glyph),
// aria-pressed with Voice on / Voice off labels and the V key, flipping the controller's voice cut. With no
// voice lines for the film no VO button renders and mute keeps working alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShow, useSource, type FilmJson } from '../src/index.js';
import { DEFAULT_CHROME_ICONS, mountPlayerChrome } from '../src/player-chrome.js';

const film: FilmJson = {
  title: 'T',
  background: '#fff',
  scenes: [
    { id: 'a', name: 'A', dur: 4 },
    { id: 'b', name: 'B', dur: 6 },
    { id: 'c', name: 'C', dur: 2 },
  ],
};
const lines = [
  { scene: 'a', text: 'Line A.' },
  { scene: 'c', text: 'Line C.' },
];
let frames: FrameRequestCallback[];
let origFullscreen: unknown;

beforeEach(() => {
  document.body.replaceChildren();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async (_s, id) => ({
      components: [{ type: 'text', id: `t-${id}`, text: id }],
      tracks: [{ kind: 'tween', target: `.t-${id}`, prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
      portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
    }),
    voiceText: async (slug) => (slug === 'f' ? lines : null),
  });
  origFullscreen = HTMLElement.prototype.requestFullscreen;
  HTMLElement.prototype.requestFullscreen = vi.fn(async () => {}) as unknown as typeof HTMLElement.prototype.requestFullscreen;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (origFullscreen) HTMLElement.prototype.requestFullscreen = origFullscreen as typeof HTMLElement.prototype.requestFullscreen;
});

const setup = async (over: Partial<Parameters<typeof mountPlayerChrome>[2]> = {}) => {
  const host = document.createElement('div');
  const stage = document.createElement('div');
  host.append(stage);
  document.body.append(host);
  const show = await createShow(stage, 'f');
  show.pause();
  const chrome = mountPlayerChrome(host, show, Object.assign({ film: 'f', stage }, over));
  await new Promise((r) => setTimeout(r, 0));
  const step = () => frames.splice(0).forEach((cb) => cb(performance.now()));
  step();
  return { host, stage, show, chrome, step };
};
const voiceOnOf = (show: { state: object }) => (show.state as { voiceOn?: boolean }).voiceOn;

describe('chrome VO toggle', () => {
  it('renders beside mute with the voice icon, pressed and labelled Voice on', async () => {
    const { host, show, chrome } = await setup();
    expect([...host.querySelectorAll('.emk-bar button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous scene', 'Play', 'Next scene',
      'Scene 1: A', 'Scene 2: B', 'Scene 3: C',
      'Captions', 'Sound on', 'Voice on', 'Full screen',
    ]);
    const vo = host.querySelector('.emk-voice') as HTMLButtonElement;
    expect(vo.getAttribute('aria-pressed')).toBe('true');
    expect(vo.innerHTML).toContain('<svg');
    expect((DEFAULT_CHROME_ICONS as Record<string, string>).voice).toContain('<svg');
    chrome.destroy();
    show.destroy();
  });

  it('cuts the voice on toggle: Voice off, unpressed, narration cut on the controller', async () => {
    const { host, show, chrome } = await setup();
    show.setSound(true);
    const vo = host.querySelector('.emk-voice') as HTMLButtonElement;
    expect(vo).not.toBeNull();
    vo.click();
    expect(voiceOnOf(show)).toBe(false);
    expect(vo.getAttribute('aria-label')).toBe('Voice off');
    expect(vo.getAttribute('aria-pressed')).toBe('false');
    vo.click();
    expect(voiceOnOf(show)).toBe(true);
    expect(vo.getAttribute('aria-label')).toBe('Voice on');
    expect(vo.getAttribute('aria-pressed')).toBe('true');
    chrome.destroy();
    show.destroy();
  });

  it('swaps the voice glyph with the cut: speaker on, speaker-off off', async () => {
    const { host, show, chrome } = await setup();
    show.setSound(true);
    const dOf = (svg: string) => svg.match(/d="([^"]+)"/)![1];
    const vo = host.querySelector('.emk-voice') as HTMLButtonElement;
    const glyph = () => vo.querySelector('path')!.getAttribute('d');
    expect(glyph()).toBe(dOf(DEFAULT_CHROME_ICONS.voice));
    vo.click();
    expect(glyph()).toBe(dOf(DEFAULT_CHROME_ICONS.voiceOff));
    vo.click();
    expect(glyph()).toBe(dOf(DEFAULT_CHROME_ICONS.voice));
    chrome.destroy();
    show.destroy();
  });

  it('dims the VO toggle while sound is off: no cut on click or V, still showing the cut', async () => {
    const { host, show, chrome } = await setup();
    const vo = host.querySelector('.emk-voice') as HTMLButtonElement;
    expect(vo.disabled).toBe(true);
    expect(vo.getAttribute('aria-label')).toBe('Voice on');
    expect(vo.getAttribute('aria-pressed')).toBe('true');
    vo.click();
    expect(voiceOnOf(show)).toBe(true);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true }));
    expect(voiceOnOf(show)).toBe(true);
    show.setSound(true);
    expect(vo.disabled).toBe(false);
    vo.click();
    expect(voiceOnOf(show)).toBe(false);
    chrome.destroy();
    show.destroy();
  });

  it('answers the V key', async () => {
    const { host, show, chrome } = await setup();
    show.setSound(true);
    const press = (key: string) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      host.dispatchEvent(e);
      return e;
    };
    expect(press('v').defaultPrevented).toBe(true);
    expect(voiceOnOf(show)).toBe(false);
    press('V');
    expect(voiceOnOf(show)).toBe(true);
    chrome.destroy();
    show.destroy();
  });

  it('merges a voice icon override over the default', async () => {
    const { host, show, chrome } = await setup({ icons: { voice: '<svg class="mine"></svg>' } as never });
    expect(host.querySelector('.emk-voice .mine')).not.toBeNull();
    chrome.destroy();
    show.destroy();
  });

  it('omits the VO toggle with voiceToggle false: one master control, V silent', async () => {
    const { host, show, chrome } = await setup({ voiceToggle: false });
    expect(host.querySelector('.emk-voice')).toBeNull();
    const mute = host.querySelector('.emk-mute') as HTMLButtonElement;
    mute.click();
    expect(show.state.sound).toBe(true);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true }));
    expect(voiceOnOf(show)).toBe(true);
    chrome.destroy();
    show.destroy();
    const bare = await setup({ voiceToggle: false, film: 'g' });
    expect(bare.host.querySelector('.emk-voice')).toBeNull();
    expect(bare.host.querySelector('.emk-cc')).toBeNull();
    bare.chrome.destroy();
    bare.show.destroy();
  });

  it('hides the VO button without voice lines while mute keeps working', async () => {
    const { host, show, chrome } = await setup({ film: 'g' });
    expect(host.querySelector('.emk-voice')).toBeNull();
    const mute = host.querySelector('.emk-mute') as HTMLButtonElement;
    mute.click();
    expect(show.state.sound).toBe(true);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    chrome.destroy();
    show.destroy();
  });
});
