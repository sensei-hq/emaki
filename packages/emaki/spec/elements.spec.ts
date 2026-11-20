// The web components: <motion-scene> mounts one scene (a figure unless told otherwise), waits for its film and scene
// attributes, plays only while on screen, loops with a short rest (cueing its sound again), and goes quiet when it
// scrolls away; <motion-show> starts its player when it has a film, restarts on a new one, fits on resize, and lets
// keys through until the player is there.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHROME_ICONS, useSource, type ChromeTick, type FilmJson, type SceneSpec } from '../src/index.js';
import { defineMotionElements } from '../src/elements/index.js';

class FakeAudio {
  static all: FakeAudio[] = [];
  src: string; currentTime = 0; paused = true; preload = '';
  constructor(src = '') { this.src = src; FakeAudio.all.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute(k: string) { if (k === 'src') this.src = ''; }
  load() {}
}
const playing = () => FakeAudio.all.filter((a) => !a.paused);

/** Observers whose callbacks the spec fires by hand (jsdom has neither). */
class Watch {
  static all: Watch[] = [];
  constructor(public cb: (entries: { isIntersecting: boolean }[]) => void) { Watch.all.push(this); }
  observe() {} disconnect() {}
}
const intersect = (isIntersecting: boolean) => Watch.all.forEach((w) => w.cb([{ isIntersecting }]));

const film: FilmJson = { title: 'T', background: '#fff', scenes: [{ id: 'a', name: 'A', dur: 1 }, { id: 'b', name: 'B', dur: 1 }] };
let frames: FrameRequestCallback[];
let clock: number;

beforeEach(() => {
  document.body.replaceChildren();
  FakeAudio.all = []; Watch.all = []; frames = []; clock = performance.now() + 60_000;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('ResizeObserver', Watch);
  vi.stubGlobal('IntersectionObserver', Watch);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  useSource({
    films: async () => [{ slug: 'f', json: film }, { slug: 'g', json: { ...film, title: 'G' } }],
    css: async () => '',
    scene: async (_s, id) => ({
      components: [{ type: 'text', id: `t-${id}`, text: id }],
      tracks: [{ kind: 'tween', target: `.t-${id}`, prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
      portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
    }),
    timing: async () => ({ scenes: { a: { voice: 0 } } }),
    voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
    voiceText: async (slug) => (slug === 'f' ? [{ scene: 'a', text: 'Line A.' }, { scene: 'b', text: 'Line B.' }] : null),
  });
  defineMotionElements();
});
afterEach(() => vi.unstubAllGlobals());

function scene(attrs: Record<string, string>) {
  const el = document.createElement('motion-scene');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}
const stage = (el: Element) => el.querySelector('div')!.shadowRoot?.getElementById('stage') ?? null;
/** Runs the next `n` animation frames, 100 ms apart. */
function run(n: number) {
  for (let i = 0; i < n; i++) { clock += 100; frames.splice(0).forEach((f) => f(clock)); }
}

describe('<motion-scene>', () => {
  it('waits for both a film and a scene, and draws nothing for a film that does not exist', async () => {
    const el = scene({ film: 'f' });
    await new Promise((r) => setTimeout(r, 10));
    expect(stage(el)).toBeNull();
    el.setAttribute('film', 'nope');
    el.setAttribute('scene', 'a');
    await new Promise((r) => setTimeout(r, 10));
    expect(stage(el)).toBeNull();
    el.remove();
  });

  it('is a figure unless a layout is given', async () => {
    const el = scene({ film: 'f', scene: 'a' }) as HTMLElement & { layout: string };
    expect(el.layout).toBe('figure');
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    expect(el.querySelector<HTMLElement>('div')!.style.height).toBe('1000px');
    el.remove();
  });

  it('plays only while on screen, and loops after a short rest, cueing its sound from the top', async () => {
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape' });
    const btn = el.querySelector('button')!;
    await vi.waitFor(() => expect(btn.hidden).toBe(false));
    const word = () => stage(el)!.querySelector<HTMLElement>('.t-a')!;
    run(3);
    expect(word().style.opacity).toBe('');
    intersect(true);
    run(5);
    expect(Number(word().style.opacity)).toBeGreaterThan(0.3);
    btn.click();
    await vi.waitFor(() => expect(playing()).toHaveLength(1));
    const takes = FakeAudio.all.length;
    run(10);
    expect(Number(word().style.opacity)).toBeGreaterThan(0.99);
    run(10);
    expect(Number(word().style.opacity)).toBeLessThan(0.5);
    await vi.waitFor(() => expect(FakeAudio.all.length).toBeGreaterThan(takes));
    intersect(false);
    expect(playing()).toHaveLength(0);
    expect(btn.getAttribute('aria-label')).toBe('Sound on');
    el.remove();
  });

  it('loops without sound when the reader has not turned it on', async () => {
    const el = scene({ film: 'f', scene: 'b', layout: 'landscape' });
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    intersect(true);
    run(25);
    expect(FakeAudio.all).toHaveLength(0);
    el.remove();
  });

  it('a mount superseded after assigning starts no render loop', async () => {
    let release!: (v: string | null) => void;
    const gate = new Promise<string | null>((r) => (release = r));
    useSource({
      films: async () => [{ slug: 'f', json: film }, { slug: 'g', json: { ...film, title: 'G' } }],
      css: async () => '',
      scene: async (_s, id) => ({
        components: [{ type: 'text', id: `t-${id}`, text: id }],
        tracks: [{ kind: 'tween', target: `.t-${id}`, prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
        portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
      }),
      timing: async () => ({ scenes: { a: { voice: 0 } } }),
      voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
      score: () => gate,
    });
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape' });
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    el.setAttribute('locale', 'es');
    const first = stage(el);
    await vi.waitFor(() => expect(stage(el)).not.toBe(first));
    release(null);
    await new Promise((r) => setTimeout(r, 10));
    expect(stage(el)!.style.transform).toBe('scale(1)');
    expect(frames).toHaveLength(1);
    el.remove();
  });

  it('a mount overtaken while loading is dropped without touching the live one', async () => {
    let release!: (v: SceneSpec) => void;
    const gate = new Promise<SceneSpec>((r) => (release = r));
    let calls = 0;
    const script: SceneSpec = {
      components: [{ type: 'text', id: 't-a', text: 'a' }],
      tracks: [{ kind: 'tween', target: '.t-a', prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
      portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
    };
    useSource({
      films: async () => [{ slug: 'f', json: film }, { slug: 'g', json: { ...film, title: 'G' } }],
      css: async () => '',
      scene: async () => (++calls === 1 ? gate : script),
      timing: async () => ({ scenes: { a: { voice: 0 } } }),
      voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
    });
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape' });
    await vi.waitFor(() => expect(calls).toBe(1));
    el.setAttribute('locale', 'es');
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    release(script);
    await new Promise((r) => setTimeout(r, 10));
    expect(stage(el)!.style.transform).toBe('scale(1)');
    expect(frames).toHaveLength(1);
    el.remove();
  });

  it('ignores the sound button before the scene is mounted and after it is gone', async () => {
    const el = scene({});
    el.querySelector('button')!.click();
    el.remove();
    el.querySelector('button')!.click();
    expect(FakeAudio.all).toHaveLength(0);
  });

  it('shows the standard speaker SVG, not emoji, keeping the Sound on/off labels', async () => {
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape' });
    const btn = el.querySelector('button')!;
    await vi.waitFor(() => expect(btn.hidden).toBe(false));
    const glyph = () => btn.querySelector('svg path')!.getAttribute('d');
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.textContent).toBe('');
    expect(DEFAULT_CHROME_ICONS.soundOff).toContain(`d="${glyph()}"`);
    expect(btn.getAttribute('aria-label')).toBe('Sound on');
    intersect(true);
    btn.click();
    expect(btn.getAttribute('aria-label')).toBe('Sound off');
    expect(DEFAULT_CHROME_ICONS.soundOn).toContain(`d="${glyph()}"`);
    btn.click();
    expect(btn.getAttribute('aria-label')).toBe('Sound on');
    expect(DEFAULT_CHROME_ICONS.soundOff).toContain(`d="${glyph()}"`);
    el.remove();
  });
});

describe('<motion-show>', () => {
  type ShowEl = HTMLElement & { controller: { state: { slug?: string; index: number }; timeline: { scenes: unknown[] } } | null };
  it('starts once it has a film, restarts on a new one, and fits on resize', async () => {
    const el = document.createElement('motion-show') as ShowEl;
    document.body.appendChild(el);
    Watch.all[0].cb([]);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(el.controller).toBeNull();
    el.setAttribute('film', 'f');
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    const first = el.controller;
    Watch.all[0].cb([]);
    el.setAttribute('film', 'g');
    await vi.waitFor(() => expect(el.controller).not.toBe(first));
    el.remove();
  });

  it('shows the voiceover script under a Description button when asked, the player in its own box', async () => {
    const el = document.createElement('motion-show') as ShowEl;
    el.setAttribute('film', 'f');
    el.setAttribute('layout', 'portrait');
    el.setAttribute('description', '');
    document.body.appendChild(el);
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    const box = el.querySelector('div')!;
    expect(box.style.position).toBe('relative');
    expect(box.style.aspectRatio).toBe('1080/1920');
    const btn = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Description'))!;
    await vi.waitFor(() => expect(btn()).toBeTruthy());
    expect(btn().textContent).toBe('Description ▸');
    expect([...btn().parentElement!.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Line A.', 'Line B.']);
    btn().click();
    expect(btn().parentElement!.querySelector<HTMLElement>('div')!.hidden).toBe(false);
    Watch.all[0].cb([]);
    expect(stage(el)!.style.transform).toBe('scale(0)');
    const foot = btn().parentElement!;
    el.setAttribute('mode', 'light');
    expect(btn().parentElement).toBe(foot);
    el.removeAttribute('description');
    expect([...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Description'))).toBeUndefined();
    expect(box.style.position).toBe('relative');
    el.setAttribute('description', '');
    await vi.waitFor(() => expect([...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Description'))).toBeTruthy());
    el.remove();
  });

  it('renders no footer without a film, or when the film has no script for the locale', async () => {
    const el = document.createElement('motion-show') as ShowEl;
    el.setAttribute('description', '');
    el.setAttribute('locale', 'es');
    document.body.appendChild(el);
    const script = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Description'));
    await new Promise((r) => setTimeout(r, 10));
    expect(script()).toBeUndefined();
    el.setAttribute('film', 'g');
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    await new Promise((r) => setTimeout(r, 10));
    expect(script()).toBeUndefined();
    el.remove();
  });

  it('drops a footer that a newer film overtook while loading', async () => {
    let release!: (v: { scene: string; text: string }[] | null) => void;
    const gate = new Promise<{ scene: string; text: string }[] | null>((r) => (release = r));
    useSource({
      films: async () => [{ slug: 'f', json: film }, { slug: 'g', json: { ...film, title: 'G' } }],
      css: async () => '',
      scene: async (_s, id) => ({
        components: [{ type: 'text', id: `t-${id}`, text: id }],
        tracks: [{ kind: 'tween', target: `.t-${id}`, prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
        portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
      }),
      timing: async () => ({ scenes: { a: { voice: 0 } } }),
      voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
      voiceText: async (slug) => (slug === 'g' ? gate : [{ scene: 'x', text: 'F.' }]),
    });
    const el = document.createElement('motion-show') as ShowEl;
    el.setAttribute('film', 'f');
    el.setAttribute('description', '');
    document.body.appendChild(el);
    const scripts = () => [...el.querySelectorAll('button')].filter((b) => b.textContent?.startsWith('Description'));
    await vi.waitFor(() => expect(scripts()).toHaveLength(1));
    el.setAttribute('film', 'g');
    el.setAttribute('film', 'f');
    await vi.waitFor(() => expect(scripts()).toHaveLength(1));
    release([{ scene: 'g', text: 'G.' }]);
    await new Promise((r) => setTimeout(r, 10));
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].parentElement!.querySelector('p')!.textContent).toBe('F.');
    el.remove();
  });

  it('a show overtaken by a newer film is dropped, and an emptied host restarts', async () => {
    type Films = { slug: string; json: FilmJson }[];
    let release!: (v: Films) => void;
    const gate = new Promise<Films>((r) => (release = r));
    let calls = 0;
    const listed: Films = [{ slug: 'f', json: film }, { slug: 'g', json: { ...film, title: 'G' } }];
    useSource({
      films: async () => (++calls === 1 ? gate : listed),
      css: async () => '',
      scene: async (slug, id) => ({
        components: [{ type: 'text', id: `t-${id}`, text: `${slug}-${id}` }],
        tracks: [{ kind: 'tween', target: `.t-${id}`, prop: 'opacity', from: 0, to: 1, t0: 0, t1: 1, easing: 'linear' }],
        portrait: { hoist: [], frame: [0, 600], crop: [0, 0, 1920, 1080] },
      }),
      timing: async () => ({ scenes: { a: { voice: 0 } } }),
      voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
    });
    const el = document.createElement('motion-show') as ShowEl;
    el.setAttribute('film', 'f');
    document.body.appendChild(el);
    el.setAttribute('film', 'g');
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    release(listed);
    await new Promise((r) => setTimeout(r, 10));
    expect((el.controller as unknown as { film: { slug: string } }).film.slug).toBe('g');
    expect(stage(el)!.querySelector('.t-a')!.textContent).toBe('g-a');
    el.remove();
  });

  type ChromeEl = HTMLElement & {
    controller: { state: { index: number; playing: boolean; sound: boolean; layout: string }; go: (i: number) => void } | null;
    icons: Partial<Record<string, string>>;
    renderTick: (tick: ChromeTick, index: number) => string | void;
  };
  const show = (attrs: Record<string, string>) => {
    const el = document.createElement('motion-show') as ChromeEl;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
  };
  const barLabels = (el: Element) =>
    [...el.querySelectorAll('.emk-bar button, .emk-bar a')].map((b) => b.getAttribute('aria-label'));

  it('renders the standard chrome by default, driving the controller', async () => {
    const el = show({ film: 'f' });
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    await vi.waitFor(() => expect(el.querySelector('.emk-bar')).not.toBeNull());
    expect(barLabels(el)).toEqual([
      'Previous scene', 'Pause', 'Next scene', 'Scene 1: A', 'Scene 2: B', 'Captions', 'Sound on', 'Voice on', 'Full screen',
    ]);
    expect(el.querySelector('.emk-count')?.textContent).toBe('1 / 2');
    const cap = el.querySelector('.emk-cap')!;
    expect(cap.parentElement).toBe(el);
    const box = el.querySelector('div')!;
    (el.querySelector('.emk-next') as HTMLButtonElement).click();
    expect(el.controller!.state.index).toBe(1);
    Object.defineProperties(box, {
      clientWidth: { value: 960, configurable: true },
      clientHeight: { value: 540, configurable: true },
    });
    Watch.all[0].cb([]);
    expect(stage(el)!.style.transform).toBe('scale(0.5)');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(el.controller!.state.playing).toBe(false);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
    expect(el.controller!.state.layout).toBe('portrait');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(el.controller!.state.index).toBe(1);
    el.remove();
  });

  it('keeps CC on across scenes (no chrome remount on advance)', async () => {
    const el = show({ film: 'f' });
    await vi.waitFor(() => expect(el.querySelector('.emk-bar')).not.toBeNull());
    (el.querySelector('.emk-cc') as HTMLButtonElement).click();
    const bar = el.querySelector('.emk-bar')!;
    (el.querySelector('.emk-next') as HTMLButtonElement).click();
    expect(el.querySelector('.emk-bar')).toBe(bar);
    expect((el.querySelector('.emk-cc') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
    el.remove();
  });

  it('chrome="off" renders the bare stage for custom chrome', async () => {
    const el = show({ film: 'f', chrome: 'off' });
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    await new Promise((r) => setTimeout(r, 10));
    expect(el.querySelector('.emk-bar')).toBeNull();
    expect(el.querySelector('.emk-cap')).toBeNull();
    const bare = el.querySelector('div')!;
    expect(bare.style.position).toBe('relative');
    expect(bare.style.aspectRatio).toBe('1920/1080');
    expect(bare.style.maxHeight).toBe('100%');
    el.controller!.go(1);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(el.controller!.state.index).toBe(0);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(el.controller!.state.index).toBe(0);
    Object.defineProperties(el, {
      clientWidth: { value: 960, configurable: true },
      clientHeight: { value: 540, configurable: true },
    });
    Watch.all[0].cb([]);
    expect(stage(el)!.style.transform).toBe('scale(0.5)');
    el.remove();
  });

  it('renders the pop-out link from playerhref and re-syncs it on change', async () => {
    const el = show({ film: 'f', playerhref: '/p/f' });
    await vi.waitFor(() => expect(el.querySelector('.emk-popout')).not.toBeNull());
    expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/p/f');
    const first = el.controller;
    el.setAttribute('playerhref', '/p/g');
    await vi.waitFor(() => expect(el.querySelector('.emk-popout')!.getAttribute('href')).toBe('/p/g'));
    expect(el.controller).toBe(first);
    el.removeAttribute('playerhref');
    await vi.waitFor(() => expect(el.querySelector('.emk-popout')).toBeNull());
    expect(el.controller).toBe(first);
    el.remove();
  });

  it('icons and renderTick properties rebuild the chrome', async () => {
    const el = show({ film: 'f' });
    el.icons = { pause: '<svg class="mine"></svg>' };
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    await vi.waitFor(() => expect(el.querySelector('.emk-toggle .mine')).not.toBeNull());
    expect(el.querySelector('.emk-prev svg')).not.toBeNull();
    el.renderTick = (t) => `<i>${t.id}</i>`;
    await vi.waitFor(() => expect(el.querySelector('.emk-tick i')).not.toBeNull());
    expect(el.querySelector('.emk-tick i')?.textContent).toBe('a');
    (el.querySelectorAll('.emk-tick')[1] as HTMLButtonElement).click();
    expect(el.controller!.state.index).toBe(1);
    el.remove();
  });

  it('toggles the chrome at runtime via the chrome attribute', async () => {
    const el = show({ film: 'f' });
    await vi.waitFor(() => expect(el.querySelector('.emk-bar')).not.toBeNull());
    el.setAttribute('chrome', 'off');
    expect(el.querySelector('.emk-bar')).toBeNull();
    expect(el.controller).toBeTruthy();
    el.removeAttribute('chrome');
    await vi.waitFor(() => expect(el.querySelector('.emk-bar')).not.toBeNull());
    el.remove();
  });

  it('locks the stage box to the content aspect ratio, width-driven unless portrait', () => {
    // No film, so no show starts and no fit() overwrites the driven dimension: the pure pattern shows.
    const land = show({ layout: 'landscape' });
    const lbox = land.querySelector('div')!;
    expect(lbox.style.position).toBe('relative');
    expect(lbox.style.aspectRatio).toBe('1920/1080');
    expect(lbox.style.width).toBe('100%');
    expect(lbox.style.maxHeight).toBe('100%');
    expect(lbox.style.margin).toBe('auto');
    const fig = show({ layout: 'figure' });
    const fbox = fig.querySelector('div')!;
    expect(fbox.style.aspectRatio).toBe('1600/1000');
    expect(fbox.style.width).toBe('100%');
    expect(fbox.style.maxHeight).toBe('100%');
    const port = show({ layout: 'portrait' });
    const pbox = port.querySelector('div')!;
    expect(pbox.style.aspectRatio).toBe('1080/1920');
    expect(pbox.style.width).toBe('');
    expect(pbox.style.height).toBe('100%');
    expect(pbox.style.maxWidth).toBe('100%');
    expect(pbox.style.margin).toBe('auto');
    // A layout change re-aspects the box even before any show exists.
    land.setAttribute('layout', 'portrait');
    expect(lbox.style.aspectRatio).toBe('1080/1920');
    expect(lbox.style.height).toBe('100%');
    expect(land.controller).toBeNull();
    land.remove(); fig.remove(); port.remove();
  });

  it('re-aspects the stage box on a layout change without restarting the show', async () => {
    const el = show({ film: 'f' });
    await vi.waitFor(() => expect(el.controller).toBeTruthy());
    const first = el.controller;
    const box = el.querySelector('div')!;
    expect(box.style.aspectRatio).toBe('1920/1080');
    el.setAttribute('layout', 'portrait');
    await vi.waitFor(() => expect(el.controller!.state.layout).toBe('portrait'));
    expect(el.controller).toBe(first);
    expect(box.style.aspectRatio).toBe('1080/1920');
    expect(box.style.maxWidth).toBe('100%');
    // fit() still fills the re-aspected box: a 540x960 shell scales the 1080x1920 stage by 0.5.
    Object.defineProperties(box, {
      clientWidth: { value: 540, configurable: true },
      clientHeight: { value: 960, configurable: true },
    });
    Watch.all[0].cb([]);
    // setLayout() remounts the scene asynchronously; the redrawn stage keeps the fitted scale.
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    expect(stage(el)!.style.transform).toBe('scale(0.5)');
    // Dropping the attribute falls back to landscape, still without a restart.
    el.removeAttribute('layout');
    await vi.waitFor(() => expect(el.controller!.state.layout).toBe('landscape'));
    expect(el.controller).toBe(first);
    expect(box.style.aspectRatio).toBe('1920/1080');
    expect(box.style.maxHeight).toBe('100%');
    el.remove();
  });

  it('keeps stage, bar and footer in order with a description', async () => {
    const el = show({ film: 'f', description: '' });
    await vi.waitFor(() => expect(el.querySelector('.emk-bar')).not.toBeNull());
    await vi.waitFor(() =>
      expect([...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Description'))).toBeTruthy(),
    );
    const box = el.querySelector('div')!;
    const bar = el.querySelector('.emk-bar')!;
    const foot = [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Description'))!.parentElement!;
    expect(box.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    el.setAttribute('playerhref', '/p/f');
    await vi.waitFor(() => expect(el.querySelector('.emk-popout')).not.toBeNull());
    expect(el.querySelector('.emk-bar')!.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    el.remove();
  });
});
