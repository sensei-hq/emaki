# Checkpoint

**Slice:** refactor/options-objects (the last two qlty smells) — PR open

**Done**
- v0.1.3 on npm (all six packages) and as a GitHub release.
- `playScore(ctx, dest, score, { from, to, at, end })` (was 7 positional parameters; new `ScoreSpan` type).
- `signMedia(key, secret, { origin, path?, ttl?, now? })` (was 6; new `SignOptions` type; defaults /m, 3600 s, now).
- Callers moved: sound.ts, score.ts renderWav, desk machine.ts, CLI publish.js. Docs (README, docs/llms, site) show the
  new call shapes.
- `bun run coverage` 701 passed at 100%; types clean; browser check and site 34 green.

**Remaining**
- Merge the PR; release when wanted. Breaking for direct callers of either function, so the next bump is the place
  to say so in the release notes.

**Next command:** `gh pr merge <this PR> --merge --delete-branch`

**Open questions**
- Workers Builds previews: Previews base preview command `bunx wrangler preview -c site/wrangler.jsonc` not yet
  confirmed green (last failure: the name check, under `versions upload`).

**Known broken:** nothing known.
