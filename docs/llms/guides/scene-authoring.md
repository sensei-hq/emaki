# Scene authoring

A scene is one idea, on screen for 6–15 s, ending on a held picture. Write it as JSON (`scene-<id>.json`); the
renderer (`renderer.ts` in `@senseihq/emaki`, types in `scene-schema.ts`) turns it into DOM once and into style operations
every frame. Read the starter's `scene-*.json` before writing a new one.

## The board and the grammar

- Author on a **1920×1080 board**. Words on the left (x 110, width ≈ 700); the artwork on the right (x 880–1820,
  y 150–830). Keep 40 px clear of every edge.
- One idea per scene: a head (eyebrow, line, sub) that says it, and one picture that shows it.
- Order of motion: the head arrives first (eyebrow, words of the line, then the sub), then the artwork builds in the
  order the voice mentions things; every beat lands on its word. End with ≥1.5 s of stillness (the hold).
- Motion is calm: fades and short rises (12–24 px), pops with a little overshoot, lines that draw, a slow camera
  push (1.00 → 1.02–1.03). No spinning, bouncing loops or flashing.
- Illustrative numbers say "Illustrative" on screen. Real numbers carry a source in the article.
- **Connectors meet what they connect**: line ends sit on card edges at their centres; measure, don't guess.
  Symmetric layouts are centred on the board's art region. Repeated cards share one size.
- The **close** scene is the punchline card: title (3–9 words) + bar + one-line sub on the paper, the brand mark on
  the right; no card behind it, no URL. Its final frame is the cover (thumbnail, og:image, poster).

## The file

```json
{
  "components": [ … ],          // what is on stage, in paint order
  "tracks": [ … ],              // how it moves over t
  "css": "…",                   // the scene's own classes (prefixed with the scene id)
  "portrait": { "hoist": [".signs-head"], "frame": [640, 1000], "crop": [880, 160, 940, 680], "css": "…" },
  "locales": { "de": { "css": ".signs-head .line{font-size:72px}" }, "ar": { "css": "…" } }
}
```

### Components

| type | Use | Key fields |
|---|---|---|
| `board` | The dot-grid paper (always first) | `id` |
| `head` | Eyebrow + line + sub, word-split for arrival | `eyebrow`, `line`, `sub`, `style`, `at: "ground"` |
| `text` | Any run of text; `split: true` for word-by-word arrival (count is automatic, so any language works); `html: true` keeps `<b>/<em>` | `text`, `tag`, `cls`, `style`, `split`, `html` |
| `box` | An HTML container (card, column) holding `text`/`raw`/`box` children; sizes to its content | `cls`, `style`, `children` |
| `checks` | A ticked list | `items`, `style` |
| `node` | A square tile with a glyph (spark, brace, ring, tri, grid, db, lock, crown, list, check, steps, doc, wave) | `kind`, `tone` (hot/ok), `size`, `x`, `y` |
| `wire` | A quadratic connector | `a`, `c`, `b`, `color` |
| `bars` | Code lines as rounded bars | `x`, `y`, `rows` [[indent, width, tone]] |
| `logo` | A registered brand mark | `name`, `x`, `y`, `size` |
| `group` | SVG children with a shared style/transform | `style`, `children` |
| `svg` | Bespoke SVG (paths, charts) | `body` |
| `raw` | Bespoke HTML | `html` |

SVG components share one `<svg class="art" viewBox="0 0 1920 1080">`; HTML components sit in the camera layer
(`.cam`, which the push scales) unless `at: "ground"` (fixed: heads, captions). Paint order is the array order.

### Tracks

- `tween`: one property over [t0, t1] with an easing (`linear`, `eo`, `ei`, `eio`, `eoq`, `eox`, `eob`, `spring`),
  optionally staggered over `count` matches: `prop` `opacity` | `transform` (with `template: "translateY({v}px)"`)
  | `attr:<name>`.
- `effect`: `push` (camera), `showHead`, `fade` (+ rise), `pop`, `draw` (paths with `pathLength="1"`), `words`
  (word arrival; target a split `text`), `counter` (counting numbers, locale-formatted), `swap` (restyle/reclass
  from a time, seek-safe), `settle` (the closing mark), `growBars` (chart bars).
- Times are scene seconds. The head starts at −0.4 so it's already arriving at 0. Stagger lists 0.25–0.6 s apart.

### Text and languages

Every word on screen is a `{{key}}` from `strings/<locale>.json`; nothing language-specific lives in the scene. Size
text boxes for the longest locale (German and Finnish run ~30% longer, CJK shorter); wrap rather than shrink; use a
`locales.<code>.css` block for a language that needs a smaller line or a different placement. Right-to-left
locales get `dir="rtl"` on the stage; mirror the board for them with a `locales.ar.css` block only if the picture has
a reading direction (timelines, arrows). Pick fonts that cover every locale's glyphs (Noto families for non-Latin
scripts) and check diacritics in the display face (some display fonts misplace combining marks).

### Portrait and figure

`portrait.hoist` lifts the head to the top (`css` places it: left 70, top 150, width 940); `crop` is the art region
on the board; `frame` [top, height] is where it lands in 1080×1920. The figure layout reuses `crop`. Every scene
needs a portrait block; check both orientations on every sheet.

## The escape hatch: code scenes

When the picture needs computed geometry (paths along a curve, physics-free procedural layouts), write
`scene-<id>.js` against the kit (`kit.scene(id, { init(kit) {…}, render(t) {…} })`, helpers in `shared.js`,
`W.portrait(kit, spec)` at the end of `init`, text via `kit.t('key')`). Rules: draw from `t` only; no timers,
`Date.now()`, `Math.random()` (use `kit.rng(seed)`), or CSS transitions; class names prefixed with the scene id.
When the same need recurs, promote it to a renderer component or effect instead.

## Sound (score.js)

Action tones only: a soft pitched note when something lands (a card, a tick, a reveal), a chord on the close. Time
each to its beat (`T.signs + 2.4`). Instruments: vibes, marimba, pluck, ep, bass; effects: click, tick, thud, pop,
whoosh, ding, chime, sparkle, roll. Sound is always off until the viewer turns it on.

## Checking a scene

`emaki sheet <slug> [--locale xx] [--at scene:t,…]` makes a contact sheet of every scene's final picture in both
orientations. Look at it (Read the image) before showing anyone. Check mid-animation frames for beats that matter.
