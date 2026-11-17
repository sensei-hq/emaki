# Checkpoint

**Slice:** feat/web-narration (on feat/issue-1-adoption): narration plays on the site, in step with the scenes

## Done
- Core: timing `voice` start → SceneMeta.voice; FilmSource.voice → URL; `narration()`; scorePlayer.duck (0.35);
  createShow narrates the scene on screen; sceneSound = score slice + narration, cue/toggle at the playhead, setLocale
- Loaders: vite `voice` glob (?url), fetch `voice/<locale>/<scene>.m4a`; init writes the glob; example + site glob it
- `<motion-scene>` uses sceneSound; button hidden until the scene is known to have sound
- CLI `emaki voice-web <slug> --locale`: takes → voice/<locale>/<scene>.m4a (mono AAC 64k, -16 LUFS), voice start
- Sample film narrated with Piper (en_US-lessac-medium, es_MX-claude-high), en + es, in the CLI template (so every
  `emaki init` and the site landing get it) and the example app (~490 KB for 10 takes)
- Verified: bun run check (236), test:browser (narration ✓), site check/test (27)/build with CF_PAGES=1
- Pushed feat/web-narration

## Remaining
- Live site shows Cloudflare's "Hello world": the `emaki` Worker was never deployed (site not on main; no PRs).
  Build is ready in site/.svelte-kit/cloudflare; deploy needs the user (`cd site && bunx wrangler deploy`)
- PRs: feat/issue-1-adoption → main (Closes #1), then feat/web-narration; connect Workers Builds to main (CF_PAGES=1)
- React/Vue figures have no sound button (story players narrate via createShow)

## Next command
`cd site && bunx wrangler deploy` (user), then `gh pr create` for feat/issue-1-adoption

## Open questions
- None blocking

## Known broken
- show.seek() does not re-sync sound while playing (score and narration)
