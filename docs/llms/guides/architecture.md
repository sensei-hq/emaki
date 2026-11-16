# Architecture: one source, three outputs, every language

## The idea

Each story is written once as **data** and renders three ways from the same files:

| Output | Who it's for | How |
|---|---|---|
| **Article** (reader-friendly) | People reading on any device; search engines | The story body (title, dek, sections, takeaway) as HTML; each section whose id matches a scene shows that scene as a looping **figure** (artwork only; the words are in the article). |
| **Story player** (presentation/capture-friendly) | Presenters, kiosks, the top of the article, and the video pipeline | The film's scenes as slides, 16:9 or 9:16, with words on screen and opt-in sound; `/show/<slug>`. |
| **Video** (social, YouTube, LMS) | Feeds and playlists | The player captured frame by frame (Playwright) + the score + the voiceover per locale + captions → MP4 16:9 and 9:16, with the closing card as cover. |

Scenes are **pure functions of time**: `render(t)` draws the frame at time `t`, with no timers or randomness, so the
same scene can be looped as a figure, scrubbed in the player, and captured at 30 fps for video.

## Layers

```
content/                     ← the source of truth (deployed with the site)
  site.json                  name, url, timeZone, locales, defaultLocale, brand, topics
  ui/<locale>.json           interface strings
  stories/index.json         locale-neutral: slug, publish_date, kind, topic, tags, film, cover, social
  stories/<locale>/<slug>.json   title, dek, sections, takeaway, takeawaySub, sources (one per locale)
  films/<slug>/              film.json · look.css · scene-<id>.json · score.js · strings/<locale>.json
                             · voice/<locale>.json · timing[.<locale>].json
  logos/<name>.svg
production/                  ← never deployed: takes, renders, contact sheets, finished videos, per locale
emaki.config.json           content/production folders, dev server, capture path, voice provider per locale
node_modules/@senseihq/
  motion           the core (framework-free TypeScript): kit (easing), renderer (JSON scenes), registry (film
                   source), mount (layouts, shadow DOM), show (player + capture contract), sound (score synth),
                   i18n, content (stories), controller (attachScene), setupMotion
                   · /elements  <motion-scene> and <motion-show> web components
                   · /loaders/vite (bundled via your import.meta.glob) · /loaders/fetch (static files at runtime)
                   · /schemas   JSON Schemas for every content file
  motion-svelte    MotionScene, MotionShow, ScenePlayer, ShowPage (Svelte 5)
  motion-react     the same components + useScenePlayer / useShowState hooks
  motion-vue       the same components + composables
  motion-posting   the posting desk (stage → approve → post), with Cloudflare and SvelteKit adapters
  motion-cli       `emaki`: init, plugin install, manifest, validate, new, sheet, tts-check, set-voice,
                   voices, voice, fit, render, build
app/ (your framework)        routes: /[locale]/, /[locale]/stories, /[locale]/stories/[slug], /show/[film]
```

## Data flow

1. **Write**: item card → story body (per locale) + film folder (scenes as JSON, text as `{{keys}}` in strings).
2. **Load**: the app installs a film source (`useSource`) and a content source; `loadStory(slug, locale)` merges
   the index entry with the locale's body (falling back along `fr-CA → fr → default`), maps sections to scenes.
3. **Render**: the article page renders text on the server; `<motion-scene>`/`<motion-show>` hydrate on the client,
   mount each scene in a shadow root, localise its text, and draw `render(t)` every frame.
4. **Produce**: `emaki` drives `/show/<slug>?capture=1&o=…&locale=…` through `window.__show` (meta, ready,
   seek, audio) to make sheets, renders and covers; voice takes per locale set `timing.<locale>.json`, which the
   site also reads, so the player, the figures, the sound and the video stay in step in every language.
5. **Publish**: prerender every published story per locale (publishing is by date in the site's time zone); covers
   become `og:image`; videos go to the platforms (optionally through the posting desk).

## Layouts

- `landscape` 1920×1080: words left, artwork right (the authoring board).
- `portrait` 1080×1920: the same scene recomposed by its `portrait` block: hoisted words at the top, the art region
  (`crop`) scaled into a band (`frame`). No second scene file.
- `figure` 1600×1000: the art region only, for the article (the scene's words are hidden; the article says them).

## Framework neutrality

The core imports no UI library. The only framework-specific code is a page that renders the story body and the
`/show/<slug>` capture route; both are a few lines (`emaki init` writes the capture route; the wrappers' `ShowPage` does the work). Server rendering is for the article text;
the elements are client-only.
