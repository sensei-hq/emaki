# Checkpoint

**Slice:** feat/web-narration (on feat/issue-1-adoption): narration plays on the site, in step with the scenes

## Done
- Core: timing.<locale>.json `voice` (narration start per scene) → SceneMeta.voice; FilmSource.voice(slug, locale,
  scene) → URL; `narration(f, locale)` (start at the playhead or wait for the voice start, stop, stale starts lose);
  scorePlayer.duck (score at 0.35 under the voice); createShow narrates the scene on screen while sound is on;
  sceneSound = score slice + narration, cue(at)/toggle(at) at the playhead, setLocale (attachScene passes it on)
- Loaders: vite `voice` glob (?url), fetch `voice/<locale>/<scene>.m4a`; init writes the glob; example + site glob it
- `<motion-scene>` uses sceneSound; its button stays hidden until the scene is known to have sound
- CLI `emaki voice-web <slug> --locale`: takes → voice/<locale>/<scene>.m4a (mono AAC 64k, -16 LUFS, faststart),
  `voice` start = lead; drops the file and start of a scene whose take is gone
- Example: macOS-say narration for the sample film (en); browser.mjs proves the player and a figure speak in Chromium
- Docs: core/cli/svelte READMEs, docs/llms + site copies, plugin references 03/05, story-media skill, timing schema
- Verified: bun run check (235 tests), test:browser (narration ✓, no page errors), site check/test (27)/build

## Remaining
- Not pushed; no PR yet (feat/issue-1-adoption PR still pending the user's answer)
- Site landing film is silent: the CLI template has no takes (needs a real voice; macOS say is drafts only)
- React/Vue figures have no sound button (story players narrate via createShow)

## Next command
`git push -u origin feat/web-narration`

## Open questions
- Ship narration for the template film (site demo + every `emaki init`)? Which voice provider?

## Known broken
- show.seek() does not re-sync sound while playing (score and narration; capture does not need it)
