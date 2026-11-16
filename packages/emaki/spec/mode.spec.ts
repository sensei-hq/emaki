// Light and dark scenes. A film opts into dark with a `dark` block in film.json and styles it in look.css under
// #stage[data-mode="dark"]; the page picks the mode the way rokkit does, with data-mode on an ancestor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShow, loadFilm, mountScene, useSource, type FilmJson, type Mode } from '../src/index.js';

const film = (dark: boolean): FilmJson => ({
  title: 'T',
  background: '#F3F0E9',
  ...(dark ? { dark: { background: '#1E1B18' } } : {}),
  scenes: [{ id: 'a', name: 'A', dur: 2 }, { id: 'b', name: 'B', dur: 2 }],
});

beforeEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset.mode;
  useSource({
    films: async () => [{ slug: 'duo', json: film(true) }, { slug: 'lit', json: film(false) }],
    css: async () => '#stage[data-mode="dark"]{--board:#1E1B18}',
    scene: async () => ({ components: [{ type: 'board', id: 'bg' }], tracks: [] }),
  });
});
afterEach(() => vi.unstubAllGlobals());

const tick = () => new Promise((r) => setTimeout(r, 0));
async function mount(slug: string, mode?: Mode, parent: Node = document.body) {
  const host = document.createElement('div');
  parent.appendChild(host);
  const f = (await loadFilm(slug))!;
  return { host, m: await mountScene(host, f, 'a', 'landscape', { mode }) };
}
const styleOf = (host: HTMLElement) => host.shadowRoot!.querySelector('style')!.textContent!;

describe('scene mode', () => {
  it('draws a dark-capable film dark or light on request', async () => {
    expect((await mount('duo', 'dark')).m.stage.dataset.mode).toBe('dark');
    expect((await mount('duo', 'light')).m.stage.dataset.mode).toBe('light');
  });

  it('paints the stage from the film background for each mode', async () => {
    const css = styleOf((await mount('duo', 'dark')).host);
    expect(css).toContain('--background:#F3F0E9');
    expect(css).toContain('background:var(--background)');
    expect(css).toContain('#stage[data-mode="dark"]{--background:#1E1B18}');
  });

  it('keeps a film without a dark block light', async () => {
    const { host, m } = await mount('lit', 'dark');
    expect(m.stage.dataset.mode).toBe('light');
    expect(styleOf(host)).not.toContain('[data-mode="dark"]{--background');
  });

  it('auto follows the nearest data-mode on the page, as it changes', async () => {
    const page = document.createElement('main');
    page.dataset.mode = 'dark';
    document.body.appendChild(page);
    const { m } = await mount('duo', 'auto', page);
    expect(m.stage.dataset.mode).toBe('dark');
    page.dataset.mode = 'light';
    await tick();
    expect(m.stage.dataset.mode).toBe('light');
  });

  it('auto is the default and looks through shadow roots', async () => {
    document.documentElement.dataset.mode = 'dark';
    const outer = document.createElement('motion-scene');
    document.body.appendChild(outer);
    const { m } = await mount('duo', undefined, outer.attachShadow({ mode: 'open' }));
    expect(m.stage.dataset.mode).toBe('dark');
  });

  it('auto without a data-mode on the page follows prefers-color-scheme', async () => {
    let listener: (() => void) | undefined;
    const mq = { matches: true, addEventListener: (_: string, l: () => void) => (listener = l), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => mq));
    const { m } = await mount('duo', 'auto');
    expect(m.stage.dataset.mode).toBe('dark');
    mq.matches = false;
    listener?.();
    expect(m.stage.dataset.mode).toBe('light');
    m.destroy();
    expect(mq.removeEventListener).toHaveBeenCalled();
  });

  it('stops following once destroyed', async () => {
    document.documentElement.dataset.mode = 'dark';
    const { m } = await mount('duo', 'auto');
    m.destroy();
    document.documentElement.dataset.mode = 'light';
    await tick();
    expect(m.stage.dataset.mode).toBe('dark');
  });

  it('the story player takes a mode, and capture defaults to light', async () => {
    document.documentElement.dataset.mode = 'dark';
    const a = document.createElement('div'), b = document.createElement('div');
    document.body.append(a, b);
    await createShow(a, 'duo', { capture: true, mode: 'dark' });
    expect(a.shadowRoot!.getElementById('stage')!.dataset.mode).toBe('dark');
    await createShow(b, 'duo', { capture: true });
    expect(b.shadowRoot!.getElementById('stage')!.dataset.mode).toBe('light');
  });
});
