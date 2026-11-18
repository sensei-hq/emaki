// The player's description: the film's voiceover script as lines (voiceLines), and as a footer
// (descriptionFooter): a Description button that opens the script in a panel below. Nothing renders without a script
// for the locale.
import { beforeEach, describe, expect, it } from 'vitest';
import { descriptionFooter, useSource, voiceLines, type VoiceLine } from '../src/index.js';

const lines: VoiceLine[] = [{ scene: 'a', text: 'First.' }, { scene: 'b', text: 'Second.' }];
let asked: [string, string][];

beforeEach(() => {
  document.body.replaceChildren();
  asked = [];
  useSource({
    films: async () => [], css: async () => '', scene: async () => null,
    voiceText: async (slug, locale) => { asked.push([slug, locale]); return lines; },
  });
});

describe('voiceLines', () => {
  it('reads the voiceover script for the locale', async () => {
    await expect(voiceLines('f', 'en')).resolves.toEqual(lines);
    expect(asked).toEqual([['f', 'en']]);
  });

  it('is null without a voiceText source, without a script, or with an empty one', async () => {
    const base = { films: async () => [], css: async () => '', scene: async () => null };
    useSource(base);
    await expect(voiceLines('f', 'en')).resolves.toBeNull();
    useSource({ ...base, voiceText: async () => null });
    await expect(voiceLines('f', 'en')).resolves.toBeNull();
    useSource({ ...base, voiceText: async () => [] });
    await expect(voiceLines('f', 'en')).resolves.toBeNull();
  });
});

describe('descriptionFooter', () => {
  it('opens the script under a Description button and closes it again, and destroys itself', async () => {
    const f = (await descriptionFooter('f', { locale: 'en' }))!;
    document.body.append(f.el);
    const btn = f.el.querySelector('button')!;
    const panel = () => f.el.querySelector('div')!;
    expect(btn.textContent).toBe('Description ▸');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(panel().hidden).toBe(true);
    expect([...f.el.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['First.', 'Second.']);
    btn.click();
    expect(btn.textContent).toBe('Description ▾');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(panel().hidden).toBe(false);
    btn.click();
    expect(btn.textContent).toBe('Description ▸');
    expect(panel().hidden).toBe(true);
    f.destroy();
    expect(document.body.contains(f.el)).toBe(false);
  });

  it('asks for English when no locale is given, and is null without a script', async () => {
    await descriptionFooter('f');
    expect(asked).toEqual([['f', 'en']]);
    useSource({ films: async () => [], css: async () => '', scene: async () => null, voiceText: async () => null });
    await expect(descriptionFooter('f', { locale: 'en' })).resolves.toBeNull();
  });
});
