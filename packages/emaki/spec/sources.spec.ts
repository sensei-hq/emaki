// Where a scene comes from: its JSON file, or the escape hatch's code modules. Matches the sensei-hq.com website
// (issue #1): every code module of a film runs, in film order, so one scene can use helpers another defines; a forced
// source that does not exist throws instead of quietly drawing the other one; the player and capture take `src`.
import { beforeEach, describe, expect, it } from 'vitest';
import { createShow, loadFilm, mountScene, useSource, type FilmJson, type SceneSpec } from '../src/index.js';

const film: FilmJson = {
  title: 'T',
  background: '#fff',
  scenes: [{ id: 'define', name: 'Define', dur: 2 }, { id: 'use', name: 'Use', dur: 2 }, { id: 'json', name: 'Json', dur: 2 }],
};
const SHARED = 'window.W = { tag: (s) => "<b>" + s + "</b>" };';
const SCENES: Record<string, string> = {
  // `define` adds a helper to W that `use` (a later scene) depends on, as the website's relay and hub films do.
  define: 'W.relay = (k) => k.stage.insertAdjacentHTML("beforeend", W.tag("relay"));\nkit.scene("define", { render() {} });',
  use: 'kit.scene("use", { init(k) { W.relay(k); }, render() {} });',
  json: 'kit.scene("json", { init(k) { k.stage.insertAdjacentHTML("beforeend", "<i>drawn by code</i>"); }, render() {} });',
};
const JSON_SCENE: SceneSpec = { components: [{ type: 'text', id: 'from-json', text: 'drawn from json' }], tracks: [] };

beforeEach(() => {
  document.body.replaceChildren();
  useSource({
    films: async () => [{ slug: 'f', json: film }],
    css: async () => '',
    scene: async (_slug, id) => (id === 'json' ? JSON_SCENE : null),
    code: async () => ({ shared: SHARED, scenes: SCENES }),
  });
});

async function mount(scene: string, src?: 'json' | 'js') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return mountScene(host, (await loadFilm('f'))!, scene, 'landscape', { src });
}

describe('scene sources', () => {
  it('runs every code module in film order, so a scene can use a helper an earlier one defines', async () => {
    const m = await mount('use');
    expect(m.stage.innerHTML).toContain('<b>relay</b>');
  });

  it('prefers the JSON scene, and src: "js" forces the code module', async () => {
    expect((await mount('json')).stage.textContent).toContain('drawn from json');
    expect((await mount('json', 'js')).stage.textContent).toContain('drawn by code');
  });

  it('throws when src: "json" is forced and the scene has no JSON', async () => {
    await expect(mount('use', 'json')).rejects.toThrow(/no JSON scene "use"/);
  });

  it('the story player passes src through', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const show = await createShow(host, 'f', { capture: true, src: 'js', slide: 3 });
    expect(host.shadowRoot!.getElementById('stage')!.textContent).toContain('drawn by code');
    show.destroy();
  });
});
