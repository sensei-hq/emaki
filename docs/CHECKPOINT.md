# Checkpoint

**Slice:** release v0.1.3 (coverage gate + render fix) — done

**Done**
- v0.1.3 on npm (all six packages) and as a GitHub release; publish workflow green.
- PR #13 merged: packages/*/src at 100% lines/branches/functions/statements; CI runs `bun run coverage`.
- `emaki render` no longer hangs when ffmpeg quits mid-capture; it fails with 'ffmpeg failed'.
- PR #12 merged: CI runs the poster's python tests; the GitHub release runs only for a tag.
- Workers Builds "Previews base": root directory corrected from /site to the repo root, preview command
  `bunx wrangler versions upload -c site/wrangler.jsonc` (set by the user in the dashboard).

**Remaining**
- Confirm the Workers Builds preview check goes green on this PR, then merge it.

**Next command:** `gh pr checks <this PR>` then `gh pr merge <this PR> --merge --delete-branch`

**Open questions**
- qlty: 2 public-signature smells left (playScore 7 params, signMedia 6); changing them is a breaking API change.

**Known broken:** nothing known.
