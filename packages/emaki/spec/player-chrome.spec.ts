// The standard player chrome: icon toolbar (prev/play/next/ticks/count/CC/mute/VO/full screen/
// pop-out) plus the caption overlay, driven by the show controller. Icons and ticks overridable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShow, useSource, type FilmJson } from '../src/index.js';
import { CHROME_CSS, DEFAULT_CHROME_ICONS, mountPlayerChrome } from '../src/player-chrome.js';

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
  (document as { exitFullscreen?: () => void }).exitFullscreen = vi.fn();
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
const labels = (host: HTMLElement) =>
  [...host.querySelectorAll('.emk-bar button, .emk-bar a')].map((b) => b.getAttribute('aria-label'));

describe('player chrome', () => {
  it('renders the full bar with a player href', async () => {
    const { host, show, chrome } = await setup({ playerHref: '/show/f' });
    expect(labels(host)).toEqual([
      'Previous scene',
      'Play',
      'Next scene',
      'Scene 1: A',
      'Scene 2: B',
      'Scene 3: C',
      'Captions',
      'Sound on',
      'Voice on',
      'Full screen',
      'Open the player on its own page',
    ]);
    expect(host.querySelector('.emk-count')?.textContent).toBe('1 / 3');
    expect(host.querySelector('.emk-popout')?.getAttribute('href')).toBe('/show/f');
    chrome.destroy();
    show.destroy();
  });

  it('hides the pop-out without a href', async () => {
    const { host, show, chrome } = await setup();
    expect(host.querySelector('.emk-popout')).toBeNull();
    expect(labels(host)).toContain('Captions');
    chrome.destroy();
    show.destroy();
  });

  it('mirrors play state, ticks and count', async () => {
    const { host, show, chrome, step } = await setup();
    await show.seek(7);
    step();
    show.play();
    const ticks = [...host.querySelectorAll('.emk-tick')];
    expect(ticks[0].className).toContain('done');
    expect(ticks[1].querySelector('span')?.style.width).toBe('50%');
    expect(host.querySelector('.emk-count')?.textContent).toBe('2 / 3');
    expect(host.querySelector('.emk-toggle')?.getAttribute('aria-label')).toBe('Pause');
    ticks[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(show.state.index).toBe(2);
    chrome.destroy();
    show.destroy();
  });

  it('captions the voiced scene, silently otherwise', async () => {
    const { host, show, chrome, step } = await setup();
    const cap = host.querySelector('.emk-cap') as HTMLElement;
    const cc = host.querySelector('.emk-cc') as HTMLButtonElement;
    expect(cap.hidden).toBe(true);
    cc.click();
    expect(cc.getAttribute('aria-pressed')).toBe('true');
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
    await show.seek(5);
    step();
    expect(cap.hidden).toBe(true);
    await show.seek(11);
    step();
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line C.');
    chrome.destroy();
    show.destroy();
  });

  it('hides CC without voice lines', async () => {
    const { host, show, chrome } = await setup({ film: 'g' });
    expect(host.querySelector('.emk-cc')).toBeNull();
    chrome.destroy();
    show.destroy();
  });

  it('round-trips mute through the controller', async () => {
    const { host, show, chrome } = await setup();
    const mute = host.querySelector('.emk-mute') as HTMLButtonElement;
    expect(mute.getAttribute('aria-pressed')).toBe('false');
    mute.click();
    expect(show.state.sound).toBe(true);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(mute.getAttribute('aria-label')).toBe('Sound off');
    mute.click();
    expect(show.state.sound).toBe(false);
    chrome.destroy();
    show.destroy();
  });

  it('answers C and F, and lets other keys bubble', async () => {
    const { host, show, chrome } = await setup();
    const cc = host.querySelector('.emk-cc') as HTMLButtonElement;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(cc.getAttribute('aria-pressed')).toBe('true');
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled();
    const bubbled: string[] = [];
    host.addEventListener('keydown', (e) => bubbled.push(e.key));
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(bubbled).toEqual(['o', 'x']);
    chrome.destroy();
    show.destroy();
  });

  it('merges icon overrides over the defaults', async () => {
    const { host, show, chrome } = await setup({ icons: { pause: '<svg class="mine"></svg>' } });
    show.play();
    expect(host.querySelector('.emk-toggle .mine')).not.toBeNull();
    expect(host.querySelector('.emk-prev svg')).not.toBeNull();
    expect(Object.keys(DEFAULT_CHROME_ICONS).sort()).toEqual(
      ['cc', 'fullscreenEnter', 'fullscreenExit', 'next', 'pause', 'play', 'popout', 'prev', 'soundOff', 'soundOn', 'voice'].sort(),
    );
    chrome.destroy();
    show.destroy();
  });

  it('renders custom ticks that still seek', async () => {
    const { host, show, chrome } = await setup({ renderTick: (t) => `<i>${t.id}</i>` });
    expect(host.querySelector('.emk-tick i')?.textContent).toBe('a');
    (host.querySelectorAll('.emk-tick')[1] as HTMLButtonElement).click();
    expect(show.state.index).toBe(1);
    chrome.destroy();
    show.destroy();
  });

  it('transport buttons drive the show', async () => {
    const { host, show, chrome } = await setup();
    (host.querySelector('.emk-next') as HTMLButtonElement).click();
    expect(show.state.index).toBe(1);
    (host.querySelector('.emk-prev') as HTMLButtonElement).click();
    expect(show.state.index).toBe(0);
    (host.querySelector('.emk-toggle') as HTMLButtonElement).click();
    expect(show.state.playing).toBe(true);
    chrome.destroy();
    show.destroy();
  });

  it('starts a poster show from the toggle or Space', async () => {
    for (const via of ['toggle', 'space'] as const) {
      const host = document.createElement('div');
      const stage = document.createElement('div');
      host.append(stage);
      document.body.append(host);
      const show = await createShow(stage, 'f', { poster: true });
      const chrome = mountPlayerChrome(host, show, { film: 'f', stage });
      if (via === 'toggle') (host.querySelector('.emk-toggle') as HTMLButtonElement).click();
      else host.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(show.state.playing).toBe(true);
      expect(show.state.sound).toBe(true);
      chrome.destroy();
      show.destroy();
      host.remove();
    }
  });

  it('answers Space, arrows and M', async () => {
    const { host, show, chrome } = await setup();
    const mute = host.querySelector('.emk-mute') as HTMLButtonElement;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    expect(show.state.sound).toBe(true);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'arrowright', bubbles: true }));
    expect(show.state.index).toBe(1);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'arrowleft', bubbles: true }));
    expect(show.state.index).toBe(0);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(show.state.playing).toBe(true);
    chrome.destroy();
    show.destroy();
  });

  it('swaps the fullscreen icon and exits when full', async () => {
    const { host, show, chrome } = await setup();
    const fs = host.querySelector('.emk-fs') as HTMLButtonElement;
    Object.defineProperty(document, 'fullscreenElement', { value: host, configurable: true });
    try {
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(fs.innerHTML).toContain('M5 16h3v3h2v-5H5z');
      fs.click();
      expect(document.exitFullscreen).toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'fullscreenElement', { value: undefined, configurable: true });
    }
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(fs.innerHTML).toContain('M7 14H5v5h5v-2H7z');
    chrome.destroy();
    show.destroy();
  });

  it('drops late voice lines after destroy', async () => {
    const host = document.createElement('div');
    const stage = document.createElement('div');
    host.append(stage);
    document.body.append(host);
    const show = await createShow(stage, 'f');
    const chrome = mountPlayerChrome(host, show, { film: 'f', stage });
    chrome.destroy();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelector('.emk-bar')).toBeNull();
    show.destroy();
  });

  it('pins the caption over the stage, re-reading geometry on resize', async () => {
    const { host, stage, show, chrome } = await setup();
    Object.defineProperty(host, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true });
    const hostRect = { left: 0, bottom: 600 };
    const stageRect = { left: 100, bottom: 500, width: 800, height: 400 };
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(hostRect as DOMRect);
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(stageRect as DOMRect);
    const cap = host.querySelector('.emk-cap') as HTMLElement;
    expect(cap.parentElement).toBe(host);
    (host.querySelector('.emk-cc') as HTMLButtonElement).click();
    expect(cap.style.left).toBe('500px');
    expect(cap.style.bottom).toBe('116px');
    expect(cap.style.maxWidth).toBe('656px');
    stageRect.left = 0;
    show.next();
    expect(cap.style.left).toBe('500px');
    Object.defineProperty(host, 'clientWidth', { value: 1200 });
    show.prev();
    expect(cap.style.left).toBe('400px');
    chrome.destroy();
    show.destroy();
  });

  it('positions the host unless already positioned', async () => {
    const prestyled = document.createElement('div');
    prestyled.style.position = 'absolute';
    const stage = document.createElement('div');
    prestyled.append(stage);
    document.body.append(prestyled);
    const show = await createShow(stage, 'f');
    const chrome = mountPlayerChrome(prestyled, show, { film: 'f', stage });
    expect(prestyled.style.position).toBe('absolute');
    const { host } = await setup();
    expect(host.style.position).toBe('relative');
    chrome.destroy();
    show.destroy();
  });

  it('positions a stylesheet-static host', async () => {
    const css = document.createElement('style');
    css.textContent = '.emk-static-host{position:static}';
    document.head.append(css);
    const host = document.createElement('div');
    host.className = 'emk-static-host';
    const stage = document.createElement('div');
    host.append(stage);
    document.body.append(host);
    const show = await createShow(stage, 'f');
    const chrome = mountPlayerChrome(host, show, { film: 'f', stage });
    expect(host.style.position).toBe('relative');
    chrome.destroy();
    show.destroy();
    css.remove();
    host.remove();
  });

  it('themes progress from --emk-accent with a currentColor fallback', () => {
    expect(CHROME_CSS).toContain('var(--emk-accent,currentColor)');
  });

  it('ignores stale control clicks after destroy', async () => {
    const { host, show, chrome } = await setup();
    const cc = host.querySelector('.emk-cc') as HTMLButtonElement;
    chrome.destroy();
    cc.click();
    expect(host.querySelector('.emk-bar')).toBeNull();
    show.destroy();
  });

  it('destroys cleanly and stops listening', async () => {
    const { host, show, chrome, step } = await setup({ playerHref: '/show/f' });
    chrome.destroy();
    expect(host.querySelector('.emk-bar')).toBeNull();
    show.next();
    step();
    expect(host.querySelector('.emk-bar')).toBeNull();
    show.destroy();
  });
});
