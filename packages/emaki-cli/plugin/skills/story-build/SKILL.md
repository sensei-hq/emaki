---
name: story-build
description: >
  This skill should be used when the user asks to "build a story", "build the next item", "make the scenes for
  <topic>", "add a new story", "create the motion for this article", or when the emaki program reaches an
  approved item card. It turns one item card into a story body, a film of JSON scenes, strings, sound and a verified
  contact sheet.
metadata:
  version: "0.1.0"
---

# Build one story

Input: an approved item card (`project/items/<slug>.md`), the style guide (`project/style-guide.md`, if the pilot is
done), and the plugin's `skills/emaki/references/04-scene-authoring.md`.

1. **Scaffold**: `emaki new <slug> --scenes <ids> --title "<title>" --date <publish_date>`. Scene
   ids come from the card; `hook` first, `close` last.
2. **Story body** (default locale): title, dek, one section per idea scene (same ids), points where the card lists
   steps, captions for figures, takeaway = punchline, takeawaySub = the close sub, sources. Plain, direct sentences.
3. **film.json**: `look` (copy the site's), scene `name`, `dur` (voice words ÷ 2.5 + 2 s, at least 6 s; close 5.5),
   `desc` (one sentence each: what the scene shows).
4. **Scenes**: for each, write `scene-<id>.json`: board; head (`{{id.eyebrow}}`, `{{id.line}}`, `{{id.sub}}`); the
   artwork from components; tracks timed to the voice line (the head from −0.4 s; each element when the voice names
   it); scene CSS prefixed with the id; the portrait block. Start from the pilot's or the starter's scenes; reuse
   their CSS and patterns. Put every visible word in `strings/<locale>.json`.
5. **Close**: copy the starter's close scene; set `close.title` (the punchline) and `close.sub`.
6. **Sound**: `score.js` with a note on each beat and the closing chord; no bed.
7. **Voice script**: `voice/<locale>.json`, one line per scene, ≤ the scene's speakable time; `say` for hard words.
8. **Check**: `emaki validate <slug>` must pass; `emaki sheet <slug>` and Read the
   sheet image. Fix overlaps, clipping, misaligned connectors, uneven sizes, crowded edges, missing portrait fit,
   then re-sheet. Check a mid-animation frame for each key beat with `--at`.
9. **Page**: open the article page (dev server) and screenshot desktop and mobile.
10. **Report**: the sheet, the page screenshots, one line per scene on what it shows, and anything you assumed. Update
    `project/tracker.md`.

Large batches: dispatch the `scene-builder` agent per story with steps 3–8 and the card; do 1–2 and 9–10 yourself.
