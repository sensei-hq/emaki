// The story player's voice cut: voiceOn (default true) with setVoice(on) splits the narration from the score —
// narration is audible only with sound AND voice on, the score ducks only while narration is actually audible —
// and the state and listener carry voiceOn so chrome and apps observe it. The V key flips the cut.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log: string[] = [];
vi.mock('../src/sound.js', async (orig) => {
  const real = await orig<typeof import('../src/sound.js')>();
  return {
    ...real,
    scorePlayer: () => ({
      start: async (from: number) => { log.push(`score.start ${from.toFixed(2)}`); return true; },
      duck: (on: boolean) => log.push(`score.duck ${on}`),
      stop: () => log.push('score.stop'),
      close: () => log.push('score.close'),
    }),
    narration: () => ({
      has: (id: string) => id === 'b',
      start: async (id: string, local: number) => { log.push(`words.start ${id} ${local.toFixed(2)}`); return true; },
      stop: () => log.push('words.stop'),
    }),
  };
});
const { createShow, showKey, useSource } = await import('../src/index.js');
type FilmJson = import('../src/index.js').FilmJson;
type VoiceShow = { setVoice(on: boolean): void };

const film: FilmJson = {
  title: 'T', background: '#fff',
  scenes: [{ id: 'a', name: 'A', dur: 2 }, { id: 'b', name: 'B', dur: 3 }, { id: 'c', name: 'C', dur: 1 }],
};

beforeEach(() => {
  document.body.replaceChildren();
  log.length = 0;
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async (_s, id) => ({ components: [{ type: 'text', id: `t-${id}`, text: id }], tracks: [] }),
    score: async () => null,
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const box = () => document.body.appendChild(document.createElement('div'));
const settle = () => new Promise((r) => setTimeout(r, 0));
const voiceOnOf = (show: { state: object }) => (show.state as { voiceOn?: boolean }).voiceOn;

describe('story player voice cut', () => {
  it('defaults voiceOn to true and carries it on the state and the listener', async () => {
    const show = await createShow(box(), 'f');
    expect(voiceOnOf(show)).toBe(true);
    const seen: unknown[] = [];
    show.on((s) => seen.push((s as unknown as { voiceOn?: boolean }).voiceOn));
    show.pause();
    expect(seen).toEqual([true]);
    show.destroy();
  });

  it('setVoice cuts the narration but not the score, which plays unducked', async () => {
    const show = await createShow(box(), 'f');
    const voice = show as unknown as VoiceShow;
    expect(typeof voice.setVoice).toBe('function');
    show.setSound(true);
    show.go(1); // scene b speaks
    await settle();
    log.length = 0;
    voice.setVoice(false);
    await settle();
    expect(voiceOnOf(show)).toBe(false);
    expect(log).toEqual(['score.duck false', 'score.start 2.00', 'words.stop']);
    show.destroy();
  });

  it('ducks the score only while narration is actually audible', async () => {
    const show = await createShow(box(), 'f');
    const voice = show as unknown as VoiceShow;
    show.setSound(true);
    show.go(1); // scene b speaks
    await settle();
    expect(log.filter((l) => l.startsWith('score.duck'))).toEqual(['score.duck false', 'score.duck true']);
    log.length = 0;
    voice.setVoice(false);
    await settle();
    expect(log).toEqual(['score.duck false', 'score.start 2.00', 'words.stop']);
    log.length = 0;
    voice.setVoice(true);
    await settle();
    expect(log).toEqual(['score.duck true', 'score.start 2.00', 'words.start b 0.00']);
    show.destroy();
  });

  it('with sound off stays silent however voice toggles, and sound alone never restores the take', async () => {
    const show = await createShow(box(), 'f');
    const voice = show as unknown as VoiceShow;
    voice.setVoice(false);
    await settle();
    show.setSound(true);
    await settle();
    expect(log).toEqual(['score.duck false', 'score.start 0.00', 'words.stop']);
    log.length = 0;
    show.setSound(false);
    await settle();
    expect(log).toEqual(['score.stop', 'words.stop']);
    log.length = 0;
    voice.setVoice(true);
    voice.setVoice(false);
    await settle();
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((l) => l === 'score.stop' || l === 'words.stop')).toBe(true);
    log.length = 0;
    show.setSound(true);
    await settle();
    expect(log).toEqual(['score.duck false', 'score.start 0.00', 'words.stop']);
    show.destroy();
  });

  it('reports the cut to the listener with everything else unchanged', async () => {
    const show = await createShow(box(), 'f');
    show.setSound(true);
    await settle();
    const before = { ...show.state };
    const seen: Record<string, unknown>[] = [];
    show.on((s) => seen.push({ ...(s as unknown as Record<string, unknown>) }));
    (show as unknown as VoiceShow).setVoice(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ ...before, voiceOn: false });
    show.destroy();
  });

  it('answers the V key, flipping the cut', async () => {
    const show = await createShow(box(), 'f');
    expect(showKey(show, new KeyboardEvent('keydown', { key: 'v' }))).toBe(true);
    expect(voiceOnOf(show)).toBe(false);
    expect(showKey(show, new KeyboardEvent('keydown', { key: 'V' }))).toBe(true);
    expect(voiceOnOf(show)).toBe(true);
    show.destroy();
  });
});
