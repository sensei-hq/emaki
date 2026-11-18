// Mounting one scene into a host: the film's strings merged along the locale's fallback chain, the figure layout
// (the artwork framed on the scene's crop, or only its words when the frame is a thin band), the code-scene escape
// hatch (its W.portrait helper per layout, kit.t, missing modules and scenes), a mount overtaken while loading coming
// back inert, the font stack, and waiting for the film's fonts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLocales, fontsReady, loadFilm, mountScene, setFontStack, useSource, type FilmJson, type FilmSource, type SceneSpec } from '../src/index.js';
import { filmStrings } from '../src/mount.js';

const film: FilmJson = {
  title: 'T',
  background: '#fff',
  scenes: [{ id: 'art', name: 'Art', dur: 2 }, { id: 'code', name: 'Code', dur: 2 }, { id: 'silent', name: 'Silent', dur: 2 }],
};
const ART: SceneSpec = {
  components: [{ type: 'text', id: 'title', text: '{{title}}' }, { type: 'text', id: 'caption', text: 'caption' }],
  tracks: [],
  portrait: { hoist: ['.caption'], frame: [100, 600], crop: [100, 50, 800, 400] },
};
// shared.js builds a ground with a word line and a picture; W.portrait is the film's own portrait recomposition.
const SHARED = `window.W = {
  ground: (k) => k.stage.insertAdjacentHTML('beforeend', '<div class="ground"><p class="words">' + k.t('title') + '</p><i class="pic"></i></div>'),
  portrait: (k) => k.stage.setAttribute('data-portrait', 'film'),
};`;
let code: Record<string, string>;
let source: FilmSource;

beforeEach(() => {
  document.body.replaceChildren();
  configureLocales({ locales: ['en', 'fr', 'fr-CA'], defaultLocale: 'en' });
  code = {
    code: `kit.scene('code', { init(k) { W.ground(k); W.portrait(k, { hoist: ['.words'], frame: [0, 40], crop: [0, 0, 100, 100] }); k.stage.dataset.locale = k.locale; }, render(t) { this.t = t; } });`,
  };
  source = {
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async (_slug, id) => (id === 'art' ? ART : null),
    code: async () => ({ shared: SHARED, scenes: code }),
    strings: async (_slug, locale) => ({ en: { title: 'Hello', sub: 'en' }, fr: { title: 'Bonjour' } } as Record<string, Record<string, string>>)[locale] ?? null,
  };
  useSource(source);
});
afterEach(() => vi.unstubAllGlobals());

async function mount(scene: string, layout: 'landscape' | 'portrait' | 'figure', locale?: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { host, m: await mountScene(host, (await loadFilm('f'))!, scene, layout, { locale }) };
}

describe('scene strings', () => {
  it('merges the film strings along the fallback chain, the most specific language winning', async () => {
    expect(await filmStrings('f', 'fr-CA')).toEqual({ title: 'Bonjour', sub: 'en' });
  });
  it('has no strings when the source keeps none', async () => {
    delete source.strings;
    expect(await filmStrings('f', 'fr')).toEqual({});
  });
});

describe('figure layout', () => {
  it('frames a JSON scene on its crop, hiding the hoisted words', async () => {
    const { m } = await mount('art', 'figure', 'fr');
    expect([m.W, m.H]).toEqual([1600, 1000]);
    const ground = m.stage.querySelector('.ground')!;
    const inner = ground.lastElementChild as HTMLElement;
    expect(inner.style.transform).toMatch(/^translate\(.+\) scale\(1\.8800\)$/);
    expect(inner.textContent).toContain('Bonjour');
    const caption = m.stage.querySelector<HTMLElement>('.caption')!;
    expect(caption.style.display).toBe('none');
  });

  it('refuses a JSON scene without a portrait block', async () => {
    source.scene = async () => ({ components: ART.components, tracks: [] });
    await expect(mount('art', 'figure')).rejects.toThrow(/needs a portrait block for figures/);
  });

  it('keeps only the words of a code scene when the frame is a thin band, at the landscape scale', async () => {
    const { m } = await mount('code', 'figure');
    const inner = m.stage.querySelector('.ground')!.lastElementChild as HTMLElement;
    expect(inner.querySelector('.words')!.textContent).toBe('Hello');
    expect(inner.querySelector('.pic')).not.toBeNull();
    expect(inner.style.transform).toBe('translate(0.0px,50.0px) scale(0.8333)');
    expect(m.stage.hasAttribute('data-portrait')).toBe(false);
  });

  it('frames a code scene with no hoist list on its crop', async () => {
    code.code = code.code.replace("{ hoist: ['.words'], frame: [0, 40], crop: [0, 0, 100, 100] }", '{ frame: [0, 600], crop: [0, 0, 100, 100] }');
    const { m } = await mount('code', 'figure');
    const inner = m.stage.querySelector('.ground')!.lastElementChild as HTMLElement;
    expect(inner.style.transform).toBe('translate(350.0px,50.0px) scale(9.0000)');
  });

  it('does nothing for a code scene that asks for the figure before it has a ground', async () => {
    code.code = "kit.scene('code', { init(k) { W.portrait(k, { frame: [0, 600], crop: [0, 0, 1, 1] }); }, render() {} });";
    const { m } = await mount('code', 'figure');
    expect(m.stage.querySelector('.ground')).toBeNull();
  });
});

describe('code scenes', () => {
  it('runs the film\'s own portrait only in the portrait layout, and leaves landscape alone', async () => {
    expect((await mount('code', 'portrait')).m.stage.getAttribute('data-portrait')).toBe('film');
    const { m } = await mount('code', 'landscape', 'fr');
    expect(m.stage.hasAttribute('data-portrait')).toBe(false);
    expect(m.stage.dataset.locale).toBe('fr');
    expect(m.stage.querySelector('.words')!.textContent).toBe('Bonjour');
    m.render(1);
    m.destroy();
  });

  it('marks a string the film does not have, and works without W helpers from shared.js', async () => {
    source.code = async () => ({ shared: '', scenes: { code: "kit.scene('code', { init(k) { k.stage.textContent = k.t('nope'); }, render() {} });" } });
    expect((await mount('code', 'portrait')).m.stage.textContent).toBe('[nope]');
  });

  it('a code scene\'s score call is ignored by the mount', async () => {
    source.code = async () => ({ shared: '', scenes: { code: "kit.score(() => {}); kit.scene('code', { render() {} });" } });
    await expect(mount('code', 'landscape')).resolves.toBeTruthy();
  });

  it('throws when the scene has neither JSON nor a code module', async () => {
    await expect(mount('silent', 'landscape')).rejects.toThrow(/no scene-silent\.json or \.js/);
    delete source.code;
    await expect(mount('silent', 'landscape')).rejects.toThrow(/no scene-silent\.json or \.js/);
  });

  it('throws when the module does not register its scene', async () => {
    code.silent = '// registers nothing';
    await expect(mount('silent', 'landscape')).rejects.toThrow(/scene-silent\.js did not call kit\.scene\('silent'/);
  });
});

describe('mounting', () => {
  it('throws for a scene the film does not list', async () => {
    await expect(mount('missing', 'landscape')).rejects.toThrow(/f has no scene "missing"/);
  });

  it('a mount overtaken while loading comes back inert and leaves the newer one showing', async () => {
    const host = document.createElement('div');
    const f = (await loadFilm('f'))!;
    const first = mountScene(host, f, 'art', 'landscape');
    const second = await mountScene(host, f, 'code', 'landscape');
    const stale = await first;
    expect(stale.dur).toBe(2);
    stale.render(1);
    stale.destroy();
    expect(host.shadowRoot!.contains(second.stage)).toBe(true);
    const unknown = mountScene(host, f, 'missing', 'landscape');
    await mountScene(host, f, 'art', 'landscape');
    expect((await unknown).dur).toBe(0);
  });

  it('sets the scenes in the font stack the app chooses', async () => {
    setFontStack('--display:Brand;');
    const { host } = await mount('art', 'landscape');
    expect(host.shadowRoot!.querySelector('style')!.textContent).toContain('--display:Brand;');
  });
});

describe('fontsReady', () => {
  it('loads every weight of every film font, shrugging off one that fails, then waits for the document', async () => {
    const load = vi.fn(async (spec: string) => { if (spec.includes('Broken')) throw new Error('404'); return []; });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load, ready: Promise.resolve() } });
    await fontsReady({ ...(await loadFilm('f'))!, fonts: { display: { family: 'Brand', weights: [400, 700] }, mono: { family: 'Broken' } } });
    expect(load.mock.calls.map((c) => c[0])).toEqual(['400 40px "Brand"', '700 40px "Brand"', '400 40px "Broken"']);
    await fontsReady();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('returns at once where the document has no font loading', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
    await expect(fontsReady()).resolves.toBeUndefined();
  });
});
