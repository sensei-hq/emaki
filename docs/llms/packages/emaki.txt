# @senseihq/emaki

The motion stories core. A story is one set of data files that renders three ways: **article figures** (one scene,
looping beside the text), a **story player** (the scenes as slides) and **video** (captured frame by frame by
`@senseihq/emaki-cli`), in every language you configure. Framework-free TypeScript; nothing here imports a UI library.

```sh
npm i @senseihq/emaki
```

Using a framework? Install its wrapper too: `@senseihq/emaki-svelte`, `@senseihq/emaki-react` or
`@senseihq/emaki-vue`. `npx @senseihq/emaki-cli init` sets a project up for you.

## Start-up (once, on the client)

```ts
import { setupMotion } from '@senseihq/emaki';
import { viteSource } from '@senseihq/emaki/loaders/vite';      // bundled with Vite
// import { fetchFilmSource } from '@senseihq/emaki/loaders/fetch'; // or read static files at runtime

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
};
export const { filmSource, contentSource, logos, site } = viteSource(g);
setupMotion({ source: filmSource, site, logos });
```

Vite only expands `import.meta.glob` in your own code, which is why the globs live in the app and the package turns
them into sources. Paths are matched by their tail, so the content folder can be anywhere.

## Exports

| Path | What |
|---|---|
| `@senseihq/emaki` | `setupMotion`, `useSource`, `loadFilm`, `listFilms`, `timeline`, `coverTime`, `warp`/`unwarp`; `mountScene`; `createShow` (the player controller) and `installCapture` (the video contract); `ScenePlayerState` + `attachScene` (a scene you drive); `evaluateScene`, `validateScene`, `localizeScene`, `sceneKeys`, `registerLogo`; i18n (`configureLocales`, `fallbackChain`, `negotiate`, `dirOf`, `t`, `formatDate`); content (`loadStory`, `listStories`, `today`); sound (`filmScore`, `playScore`, `collectScore`); types |
| `@senseihq/emaki/elements` | `defineMotionElements()`: `<motion-scene film scene layout locale>` and `<motion-show film locale layout>` web components, for plain HTML, Astro, Eleventy |
| `@senseihq/emaki/loaders/vite` | `viteSource(globs)` → `{ filmSource, contentSource, logos, site }` |
| `@senseihq/emaki/loaders/fetch` | `fetchFilmSource(base)`, `fetchContentSource(base)`: static files at runtime (`emaki manifest` writes `films/index.json`) |
| `@senseihq/emaki/schemas/*` | JSON Schemas: film, scene, story, stories-index, site, strings, timing, voice |

## The content

```
content/
  site.json                    name, url, timeZone, locales, defaultLocale, rtl, brand, topics
  stories/index.json           slug, publish_date, kind, topic, tags, film, cover, social (locale-neutral)
  stories/<locale>/<slug>.json title, dek, sections[{id, title, body, points, motion}], takeaway, takeawaySub, sources
  films/<slug>/film.json       title, background, fonts, scenes[{id, name, dur}], cover
  films/<slug>/scene-<id>.json components + tracks (pure function of time), portrait block
  films/<slug>/strings/<locale>.json   the scene text, as {{key}} → text
  films/<slug>/look.css · score.js · voice/<locale>.json · timing[.<locale>].json
  logos/<name>.svg
```

A section whose `id` matches a scene id gets that scene as its figure. Text falls back `fr-CA → fr → default`.
Running times come from `timing.<locale>.json` (fitted to that language's narration), so the player, the figures
and the video stay in step in every language.

## Layouts

`landscape` 1920×1080 (the authoring board), `portrait` 1080×1920 (the same scene recomposed by its `portrait`
block), `figure` 1600×1000 (the art only, for articles).

## The capture contract

`installCapture(host, film, layout, locale)` sets `window.__show = { meta, ready, seek(t), audio() }` on a page with
no chrome and the stage at 1:1. `emaki sheet` and `emaki render` drive it; every framework wrapper's `ShowPage`
calls it when `capture` is set.

MIT © SenecaGlobal
