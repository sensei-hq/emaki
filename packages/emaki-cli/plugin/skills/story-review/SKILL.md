---
name: story-review
description: >
  This skill should be used when the user gives feedback on a story ("scene 2 the cards overlap", "make the title
  shorter", "the arrow is off"), asks to "review the stories", "inspect the batch", "check the scenes", or attaches a
  filled review sheet. It inspects stories against the quality gates, turns feedback into change requests, applies
  them in the data, and shows before/after evidence.
metadata:
  version: "0.1.0"
---

# Inspect, correct, show

1. **Collect**: turn each piece of feedback into a change request (story, scene, locale, orientation, time, problem,
   wanted, severity) in `project/reviews/<slug>.md`. Restate a request in one line only when it could be fixed two
   different ways; otherwise proceed.
2. **Locate**: map the scene name the reviewer used to its id (film.json `name`), and find the component(s). When
   geometry is involved, measure: open the capture page with Playwright and read element boxes (getBoundingClientRect
   relative to the stage) rather than guessing coordinates.
3. **Fix in the data**: scene JSON (positions, sizes, tracks, CSS), strings, story body. Keep shared rules shared: if
   a fix is a rule (centre connectors on edges; equal card sizes; more space under column headers), apply it to
   similar scenes and add it to `project/style-guide.md`.
4. **Verify**: `emaki validate`, then `emaki sheet <slug> --at <scene>:<t>` for the affected scenes, in each
   affected locale and both orientations. Read the image; if it is not right, fix again before replying.
5. **Reply** per request: the after frame (and the before frame when useful), one line on what changed, and any
   knock-on work (a voice take to re-record, a render to redo). Mark requests done in the review file and the tracker.
6. For an inspection without feedback: run the per-scene checklist in
   `skills/emaki/references/07-quality-gates.md` over every scene's sheet, plus the `visual-reviewer` agent,
   and report findings ranked by severity before fixing.
