---
name: story-localize
description: >
  This skill should be used when the user asks to "translate the stories", "add Spanish", "localise this story",
  "add a language", or "check the French version". It produces a locale's story bodies, scene strings, voice scripts
  and UI strings, validates every key, and verifies the layout in that language.
metadata:
  version: "0.1.0"
---

# Add or update a locale

1. Confirm the locale code (BCP 47) is in `content/site.json` `locales` (add it, plus `rtl` if needed) and that the
   fonts cover its script.
2. For each story approved in the default locale, dispatch the `localizer` agent with: the default-locale story body,
   `strings/<default>.json`, `voice/<default>.json`, the style guide's wording rules, and any glossary
   (`project/glossary.md`). It writes `stories/<locale>/<slug>.json`, `strings/<locale>.json`, `voice/<locale>.json`
   with identical keys and scene order, adapting idioms and examples, keeping punchlines short.
3. UI strings: `content/ui/<locale>.json` with the same keys as the default.
4. `emaki validate` (no missing or unused keys), then `emaki sheet <slug> --locale <locale>`; Read it. Fix
   overflow with wrapping or a `locales.<code>.css` block in the scene, not by shortening the meaning.
5. RTL locales: check the page direction, the head placement, and any directional art (arrows, timelines).
6. List what needs a native reviewer (legal or regulated wording always does) and record the review status per story
   in `project/tracker.md`. Media for the locale follows with `story-media`.
