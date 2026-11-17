# Content model

JSON Schemas for every file are in `node_modules/@senseihq/emaki/schemas/`; `emaki validate` checks the cross-file rules below. The
starter (`emaki init`, which copies it into `content/`) is a complete, valid example in English and Spanish.

## site.json

`name`, `url`, `timeZone` (IANA; stories publish by date there), `locales`, `defaultLocale`, `rtl`, `brand`
(`logo` name in `logos/`, `accent`), `topics` (`id`, `label` per locale).

## stories/index.json (locale-neutral)

One entry per story: `slug` (kebab-case, permanent: it is the URL and the film folder), `publish_date`
(YYYY-MM-DD), `kind` (`film` 60–90 s narrated · `short` 30–60 s, 9:16 first · `article` no film), `topic`, `tags`,
`film` (only when it differs from the slug), `cover` (`/covers/<slug>.jpg`, written by `render`), `minutes`,
`social` (links filled after posting), `related`.

## stories/<locale>/<slug>.json (one per locale)

```json
{
  "title": "Spot a phish in ten seconds",
  "dek": "One or two sentences: what the reader gets.",
  "sections": [
    { "id": "hook", "eyebrow": "The question", "title": "…", "body": ["…"], "caption": "A line under the figure." },
    { "id": "signs", "eyebrow": "What to look for", "title": "…", "body": ["…"], "points": ["…", "…"] },
    { "id": "more", "eyebrow": "Read more", "title": "…", "body": ["…"] }
  ],
  "takeaway": "Pause, check, report.",
  "takeawaySub": "The line under the punchline, as on the closing card.",
  "sources": [{ "label": "Policy 4.2", "href": "https://…" }]
}
```

Rules:
- A section whose `id` equals a scene id gets that scene as its figure (artwork only). `motion: {film, scene}`
  points elsewhere explicitly. Sections without a scene are reading text.
- `takeaway` is the closing card's title, as text, without the mark; `takeawaySub` is the line under it. Every film
  story has a takeaway.
- Plain text only in body fields (the page escapes it). Use `points` for lists, `code` for code.
- A missing translation falls back to the default locale and the page says so ("not yet in your language").

## films/<slug>/

| File | Contents |
|---|---|
| `film.json` | `title`, `look` (one paragraph describing the visual language, used by builders), `background`, `palette`, `dark` (`background`, `palette`: the dark look; without it the film is always light), `fonts`, `scenes` [`id`, `name`, `dur` (design seconds incl. a 1.5–2 s end hold), `desc`], optional `cover` {scene, at}. The last scene is `close`. |
| `look.css` | The film's tokens and shared classes (`.card`, `.tag`, `.words`, `.line`, `.sub`, `.eyebrow`, `.ground`, `.cam`, `.art`). Scoped to each scene's shadow root. Dark tokens go under `#stage[data-mode="dark"]` (only with a `dark` block in film.json). One look per site is the norm; copy it per film. |
| `scene-<id>.json` | The scene as data (components, tracks, css, portrait, locales). See 04-scene-authoring.md. |
| `scene-<id>.js` + `shared.js` | The escape hatch for a scene the JSON catalogue cannot express yet (procedural drawing). Same rules: pure `render(t)`. Prefer adding a component or effect to the renderer over writing JS. |
| `score.js` | The sound: action tones timed to scene events (`T.<scene> + seconds`). |
| `strings/<locale>.json` | Every on-screen word, keyed `scene.part` (`hook.line`, `signs.2`). Inline `<b>`/`<em>` allowed in strings used by `raw`/`html` text. |
| `voice/<locale>.json` | One line per scene, in order: `{ scene, text, say }`; `say` is the TTS spelling when it differs (acronyms, names). The text is also the caption. |
| `timing.json` / `timing.<locale>.json` | Written by `emaki fit`: per scene `dur` (stretched to fit that locale's take) and hand-set `holds` [[at, seconds]] (pause the clock at a beat); `emaki voice-web` adds `voice`, where the scene's narration starts. The site reads the locale's file. |
| `voice/<locale>/<scene>.m4a` | The site's narration, encoded from the takes by `emaki voice-web`. A scene with a `voice` start plays it when sound is on. |

## Production (not deployed)

`production/<slug>/<locale>/takes/take-NN.wav` · `render/<slug>-<locale>-16x9.mp4`, `-9x16.mp4`, `score.wav`,
covers · `out/` final videos (chapters embedded), `-web.mp4`, `.vtt`/`.srt`, `chapters.txt`, `description.txt`,
`poster.jpg`, `poster-vertical.jpg`, `-thumb.jpg` · `sheets/` contact sheets · `<slug>.mp4` an exported film whose
audio `render --music export` lays under the picture.

## Naming

- Slugs and scene ids: lowercase kebab-case, stable forever (URLs, files, analytics). Rename by redirect only.
- Component ids are unique per scene and prefixed with the scene id (`signs-card`), so CSS never collides.
- String keys: `<scene>.<part>` (`hook.line`, `hook.eyebrow`, `signs.3`, `close.title`, `close.sub`).
