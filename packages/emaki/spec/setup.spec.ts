// setupMotion: one call wires the source, the languages and the logos. Logos can come straight from an app's own
// import.meta.glob, so a key that is a path to an .svg registers under the file's basename, the name scenes use.
import { describe, expect, it } from 'vitest';
import { defaultLocale, locales, renderComponent, setupMotion } from '../src/index.js';
import { viteSource } from '../src/loaders/vite.js';

const source = { films: async () => [], css: async () => '', scene: async () => null, score: async () => null };
const mark = (fill: string) => `<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="${fill}"/></svg>`;
const draw = (name: string) => renderComponent({ type: 'logo', id: 'l', name, x: 0, y: 0, size: 10 }).svg;

describe('setupMotion logos', () => {
  it('registers a glob path under its basename, so scenes find it by name', () => {
    setupMotion({ source, logos: { './logos/acme.svg': mark('red'), '/content/logos/initech.svg': mark('blue') } });
    expect(draw('acme')).toContain('red');
    expect(draw('initech')).toContain('blue');
  });

  it('keeps a plain name as it is', () => {
    setupMotion({ source, logos: { globex: mark('green') } });
    expect(draw('globex')).toContain('green');
  });

  it('agrees with viteSource, which already hands over basenames', () => {
    const { logos } = viteSource({ films: {}, scenes: {}, logos: { '/src/content/logos/hooli.svg': mark('gold') } });
    expect(Object.keys(logos)).toEqual(['hooli']);
    setupMotion({ source, logos });
    expect(draw('hooli')).toContain('gold');
  });
});

describe('setupMotion languages', () => {
  it('takes the languages from site.json, and needs no logos', () => {
    setupMotion({ source, site: { locales: ['en', 'ja'], defaultLocale: 'ja' } });
    expect(locales()).toEqual(['en', 'ja']);
    expect(defaultLocale()).toBe('ja');
  });
});
