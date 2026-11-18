# Checkpoint

**Slice:** none open — v0.2.0 shipped, Workers Builds previews fixed

**Done**
- v0.2.0 on npm (all six packages, author sensei-hq) and as a GitHub release; breaking: `playScore` takes
  `{ from, to, at, end }`, `signMedia` takes `{ origin, path?, ttl?, now? }` (the last qlty smells).
- Copyright holder and author are sensei-hq everywhere (PR #16).
- Coverage 100% on packages/*/src, enforced in CI; the poster's python tests run in CI; the GitHub release runs only
  for a tag.
- Workers Builds: pull requests build previews with `bunx wrangler preview -c site/wrangler.jsonc` (root `/`);
  site/wrangler.jsonc carries the `previews` block it needs, guarded by site/src/lib/deploy.test.ts (PR #17).
  main's production deploy is green with it.

**Remaining:** nothing.

**Next command:** none pending; start the next slice from an issue.

**Open questions:** none.

**Known broken:** nothing known.
