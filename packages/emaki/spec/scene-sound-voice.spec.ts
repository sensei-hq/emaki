// A figure's voice cut: sceneSound splits the score from the take on sound/voice like the show does —
// voiceOn (default true) with setVoice(on); voice off plays the score alone, unducked — and resolves the
// scene's caption line for the caption overlay.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const played: unknown[][] = [];
const handles: { stop: ReturnType<typeof vi.fn> }[] = [];
vi.mock('../src/score.js', async (orig) => {
  const real = await orig<typeof import('../src/score.js')>();
  return { ...real, play: (...a: unknown[]) => { played.push(a); const h = { stop: vi.fn() }; handles.push(h); return h; } };
});
const { sceneSound, useSource } = await import('../src/index.js');
type FilmJson = import('../src/index.js').FilmJson;
type VoiceFigure = { setVoice(on: boolean): void; voiceOn: boolean; caption: Promise<string | null> };

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

class FakeCtx {
  static all: FakeCtx[] = [];
  currentTime = 2; destination = { id: 'dest' }; closed = false; resumed = 0;
  gains: { gain: { value: number }; connect: (d: unknown) => void; to?: unknown }[] = [];
  constructor() { FakeCtx.all.push(this); }
  async resume() { this.resumed++; }
  async close() { this.closed = true; }
  createGain() { const g = { gain: { value: 1 }, to: undefined as unknown, connect(d: unknown) { g.to = d; } }; this.gains.push(g); return g; }
}

const film: FilmJson = {
  title: 'T', background: '#fff',
  scenes: [{ id: 'a', name: 'A', dur: 2 }, { id: 'b', name: 'B', dur: 3 }, { id: 'c', name: 'C', dur: 1 }],
};
let score: string | null;

beforeEach(() => {
  played.length = 0;
  handles.length = 0;
  FakeAudio.all = [];
  FakeCtx.all = [];
  score = 'kit.score(function (S, T) { S.fx("tick", T.b + 0.5); });';
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('AudioContext', FakeCtx);
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async () => null,
    score: async () => score,
    timing: async () => ({ scenes: { b: { voice: 0.5 } } }),
    voice: async (slug, locale, scene) => `/v/${slug}/${locale}/${scene}.m4a`,
    voiceText: async (slug, locale) =>
      slug === 'f' ? locale === 'es' ? [{ scene: 'b', text: 'Línea B.' }] : [{ scene: 'b', text: 'Line B.' }] : null,
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('figure voice cut', () => {
  it('defaults voiceOn to true with a setVoice cut', () => {
    const s = sceneSound('f', 'b') as unknown as VoiceFigure;
    expect(s.voiceOn).toBe(true);
    expect(typeof s.setVoice).toBe('function');
  });

  it('with voice off plays the score alone, unducked, with no narration', async () => {
    const s = sceneSound('f', 'b');
    const cut = s as unknown as VoiceFigure;
    expect(typeof cut.setVoice).toBe('function');
    cut.setVoice(false);
    expect(cut.voiceOn).toBe(false);
    await s.toggle(1);
    expect(played).toHaveLength(1);
    expect(FakeCtx.all[0].gains[0].gain.value).toBe(1);
    expect(playing()).toHaveLength(0);
    s.destroy();
  });

  it('cutting voice while sounding stops the take and leaves the score playing, unducked', async () => {
    const s = sceneSound('f', 'b');
    await s.toggle(1);
    expect(playing()).toHaveLength(1);
    const scorePlays = played.length, scoreHandle = handles.at(-1)!;
    (s as unknown as VoiceFigure).setVoice(false);
    expect(playing()).toHaveLength(0);
    expect(scoreHandle.stop).not.toHaveBeenCalled();
    expect(played).toHaveLength(scorePlays);
    expect(FakeCtx.all[0].gains[0].gain.value).toBe(1);
    s.destroy();
  });

  it('with sound off stays silent however voice toggles, and sound alone never restores the take', async () => {
    const s = sceneSound('f', 'b');
    const cut = s as unknown as VoiceFigure;
    cut.setVoice(false);
    await s.toggle();
    expect(playing()).toHaveLength(0);
    await s.toggle();
    cut.setVoice(true);
    cut.setVoice(false);
    await s.cue(0);
    expect(played).toHaveLength(1);
    await s.toggle();
    expect(played).toHaveLength(2);
    expect(FakeCtx.all[0].gains[0].gain.value).toBe(1);
    expect(playing()).toHaveLength(0);
    s.destroy();
  });

  it('a voice-only figure with voice off stays fully silent', async () => {
    score = null;
    const s = sceneSound('f', 'b');
    (s as unknown as VoiceFigure).setVoice(false);
    await s.toggle();
    expect(played).toHaveLength(0);
    expect(FakeAudio.all).toHaveLength(0);
    s.destroy();
  });
});

describe('figure caption line', () => {
  const captionOf = (film: string, scene: string, locale?: string) =>
    (sceneSound(film, scene, locale) as unknown as VoiceFigure).caption;

  it('resolves the scene line in the figure locale', async () => {
    await expect(captionOf('f', 'b')).resolves.toBe('Line B.');
    await expect(captionOf('f', 'b', 'es')).resolves.toBe('Línea B.');
  });

  it('resolves null without a line for the scene or the film', async () => {
    await expect(captionOf('f', 'a')).resolves.toBeNull();
    await expect(captionOf('f', 'zz')).resolves.toBeNull();
    await expect(captionOf('nope', 'a')).resolves.toBeNull();
  });

  it('follows the figure into another language', async () => {
    const s = sceneSound('f', 'b') as unknown as VoiceFigure & { setLocale(l: string): void };
    await expect(s.caption).resolves.toBe('Line B.');
    s.setLocale('es');
    await expect(s.caption).resolves.toBe('Línea B.');
  });
});
