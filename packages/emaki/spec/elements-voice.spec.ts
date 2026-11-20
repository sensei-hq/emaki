// <motion-scene> speaks the film's language: a CC toggle with a caption overlay of the scene's voice line
// (aria-live polite), shown only when the scene has a line, and a speaker that follows the voice cut —
// voice="off" plays the score alone (silence for a voice-only figure). Elements stay uncontrolled: the cut
// arrives as a markup attribute, with no JS props or events.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSource, type FilmJson } from '../src/index.js';
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
const speaker = (el: Element) => el.querySelector('.emk-scene-sound') as HTMLButtonElement;
const ccToggle = (el: Element) => el.querySelector('.emk-scene-cc') as HTMLButtonElement | null;
const caption = (el: Element) => el.querySelector('.emk-scene-cap') as HTMLElement | null;

describe('<motion-scene> captions', () => {
  it('shows a CC toggle only when the scene has a voice line', async () => {
    const el = scene({ film: 'f', scene: 'a' });
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    await vi.waitFor(() => expect(ccToggle(el)).not.toBeNull());
    expect(ccToggle(el)!.getAttribute('aria-pressed')).toBe('false');
    el.remove();
  });

  it('renders no caption toggle or overlay without a line for the film', async () => {
    const el = scene({ film: 'g', scene: 'a' });
    await vi.waitFor(() => expect(stage(el)).not.toBeNull());
    await new Promise((r) => setTimeout(r, 10));
    expect(ccToggle(el)).toBeNull();
    expect(caption(el)).toBeNull();
    el.remove();
  });

  it('overlays the scene line while CC is on', async () => {
    const el = scene({ film: 'f', scene: 'a' });
    await vi.waitFor(() => expect(ccToggle(el)).not.toBeNull());
    const cap = caption(el)!;
    expect(cap.getAttribute('aria-live')).toBe('polite');
    expect(cap.hidden).toBe(true);
    ccToggle(el)!.click();
    expect(ccToggle(el)!.getAttribute('aria-pressed')).toBe('true');
    expect(cap.hidden).toBe(false);
    expect(cap.textContent).toBe('Line A.');
    ccToggle(el)!.click();
    expect(cap.hidden).toBe(true);
    el.remove();
  });
});

describe('<motion-scene> voice cut', () => {
  it('with voice="off" the speaker stays silent on a voice-only figure', async () => {
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape', voice: 'off' });
    await vi.waitFor(() => expect(speaker(el).hidden).toBe(false));
    intersect(true);
    speaker(el).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(playing()).toHaveLength(0);
    el.remove();
  });

  it('sounds the take by default', async () => {
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape' });
    await vi.waitFor(() => expect(speaker(el).hidden).toBe(false));
    intersect(true);
    speaker(el).click();
    await vi.waitFor(() => expect(playing()).toHaveLength(1));
    el.remove();
  });

  it('flipping voice off mid-take silences it, flipping on resumes it', async () => {
    const el = scene({ film: 'f', scene: 'a', layout: 'landscape' });
    await vi.waitFor(() => expect(speaker(el).hidden).toBe(false));
    intersect(true);
    speaker(el).click();
    await vi.waitFor(() => expect(playing()).toHaveLength(1));
    el.setAttribute('voice', 'off');
    await vi.waitFor(() => expect(playing()).toHaveLength(0));
    el.setAttribute('voice', 'on');
    await vi.waitFor(() => expect(playing()).toHaveLength(1));
    el.remove();
  });
});
