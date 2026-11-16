# Checkpoint

**Slice:** feat/dark-scenes-and-site (stacked on fix/publish-order-and-ci) — dark scenes + emaki.sensei-hq.com

## Done
- fix branch: publish order spec + fix, Playwright pin in CI, browser diagnostics (emaki-ci.patch minus the
  NPM_TOKEN bootstrap), config/publish-all.sh (core first, skips versions on npm, stops on failure)
- Dark scenes: film.json `dark` + look.css `#stage[data-mode="dark"]`; mode light|dark|auto on mountScene,
  createShow, attachScene (+setMode), <motion-scene>/<motion-show>, Svelte/React/Vue props; auto follows the
  nearest data-mode (rokkit's) through shadow roots, else prefers-color-scheme; capture defaults to light;
  sample + template films have a dark look; `emaki validate` checks dark block vs look.css; docs + skill refs
- site/: landing (live film, dot grid, showcase), /docs from docs/llms (copies spec-checked), llms.txt,
  Cloudflare config, 27 browser/server specs, CI `site` job

## Remaining
- emaki-react@0.1.0 and emaki-vue@0.1.0 are still 404 on npm after a publish:all run (auth + dry-run fine);
  rerun `bun run publish:all` and read its output, then add their trusted publishers
- Branches pushed; open PRs, CI green, merge
- Cloudflare: connect the repo in Workers Builds (root dir = repo root) and add the custom domain
- Not built: `emaki render --mode dark` (videos render light; installCapture takes a mode)

## Next command
`bun run publish:all`  (needs `bunx npm login`; skips the four already published)

## Open questions
- None

## Known broken
- React/Vue mode props have no tests (no harness exists for those wrappers); types only
