# Checkpoint

**Slice:** release 0.2 prep: narration, scenes that fit their narration, logo and icons, onto main and npm.

## Done
- Narration on the site; `fit` both ways (`motionEnd`, `settle`); Piper-narrated sample film (en, es); speaker
  contrast fix; logo, favicons, manifest. Live on emaki.sensei-hq.com (manual `wrangler deploy`).
- PR #3 merged into `feat/issue-1-adoption` after #2 had merged it, so #3 missed main. PR #4 brings it over.
- Root `bun run build` builds every package, then the site (Workers Builds failed: the site imports the packages'
  `dist`, absent in a fresh checkout). Spec: `config/spec/order.spec.js`.
- `main` is protected: PRs only, `check`, `browser` and `site` must pass, no force-push or deletion; admins may bypass
  (so `bun run bump` can push its release commit and tag).

## Remaining
1. Workers Builds settings (dashboard, Worker `emaki` → Settings → Build): root directory `/`, build command
   `bun run build`, deploy command `bunx wrangler deploy -c site/wrangler.jsonc`.
2. Merge PR #4.
3. Release: `git checkout main && git pull && bun run bump` (minor → 0.2.0); the tag runs publish.yml.

## Next command
`gh pr merge 4 --merge` (after the Workers Builds settings, so its check goes green)

## Open questions
- Add `Workers Builds: emaki` to the required checks once it passes?
- `workers_dev: false` / `preview_urls: false` in `site/wrangler.jsonc`?

## Known broken
- Workers Builds fails until its settings change (step 1).
- React/Vue figures have no sound button; `show.seek()` doesn't re-sync sound.
