// Where films and stories come from (written by `emaki init`). Vite expands these globs at build time, so every
// film under /content is bundled; scene files and sounds load on demand. Call startMotion() once on the client.
import { setupMotion } from '@senseihq/emaki';
import { viteSource } from '@senseihq/emaki/loaders/vite';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = {
  films: import.meta.glob('/content/films/*/film.json', { eager: true, import: 'default' }),
  scenes: import.meta.glob('/content/films/*/scene-*.json', { import: 'default' }),
  strings: import.meta.glob('/content/films/*/strings/*.json', { import: 'default' }),
  timings: import.meta.glob('/content/films/*/timing*.json', { eager: true, import: 'default' }),
  raw: import.meta.glob(['/content/films/*/*.js', '/content/films/*/look.css'], { query: '?raw', import: 'default' }),
  index: import.meta.glob('/content/stories/index.json', { eager: true, import: 'default' }),
  bodies: import.meta.glob('/content/stories/*/*.json', { import: 'default' }),
  logos: import.meta.glob('/content/logos/*.svg', { eager: true, query: '?raw', import: 'default' }),
  site: import.meta.glob('/content/site.json', { eager: true, import: 'default' }),
  voice: import.meta.glob('/content/films/*/voice/*/*.m4a', { eager: true, query: '?url', import: 'default' }),
  voiceText: import.meta.glob('/content/films/*/voice/*.json', { eager: true, import: 'default' }),
};

export const { filmSource, contentSource, logos, site } = viteSource(g as any);

let started = false;
export function startMotion() {
  if (started) return;
  started = true;
  setupMotion({ source: filmSource, site, logos });
}
