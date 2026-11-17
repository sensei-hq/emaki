# Checkpoint

**Slice:** chore/coverage-and-ci (coverage to 100% + gate)

**Done**
- v0.1.2 on npm (issue #10: MotionShow cover, React/Vue parity, glob logo keys).
- PR #12 merged: CI runs the poster's python tests; the GitHub release runs only for a tag.
- packages/*/src at 100% lines/branches/functions/statements; vitest thresholds at 100; CI runs `bun run coverage`.
- Bug fixed on the way: `emaki render` hung (unhandled EPIPE) when ffmpeg quit mid-capture; now fails with 'ffmpeg failed'.
- Dead branches removed (no behaviour change): vite code() raw fallback, applyPortrait ground lookup, rng seed guard,
  kit words(), controller sync, elements sound toggle, desk putMedia ext, youtube languageName, stage --channels list,
  tts-io stderr, media retrying's unreachable end.
- `bun run check` 700 passed; coverage 100; browser check, site 34, python OK.

**Remaining**
- Merge the coverage PR.

**Next command:** `gh pr merge <coverage PR> --merge --delete-branch`

**Open questions**
- Workers Builds on PR branches: set the non-production deploy command to
  `bunx wrangler versions upload -c site/wrangler.jsonc` in the Cloudflare dashboard (user).
- qlty: 2 public-signature smells left (playScore 7 params, signMedia 6); changing them is a breaking API change.

**Known broken:** nothing.
