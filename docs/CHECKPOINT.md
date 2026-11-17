# Checkpoint

**Slice:** feat/issue-10-adoption-gaps (issue #10), PR #11

**Done**
- `MotionShow` `cover` prop: image + play button, show created on the first click and started with sound on.
- `setupMotion` registers glob-path logo keys (`./logos/acme.svg`) by basename.
- React and Vue `MotionShow` at parity with Svelte (poster, cover, title/length, ticks, fullscreenHref); `useShowState` reports `started` and follows the playhead.
- Docs synced (package READMEs, docs/llms, site copies).
- `bun run check` 460 passed; browser check green; site tests 34 passed; react/vue src 100% coverage.

**Remaining**
- Merge PR #11; cut a patch with `bun run bump patch --yes` if the website should consume it.
- Coverage to 100% on packages/*/src (84% lines now), then thresholds + CI.
- CI: run the poster's Python test; gate publish.yml's GitHub release step to tags.

**Next command:** `gh pr merge 11 --merge --delete-branch`

**Open questions**
- Workers Builds on PR branches needs the non-production deploy command set in the dashboard.

**Known broken:** nothing.
