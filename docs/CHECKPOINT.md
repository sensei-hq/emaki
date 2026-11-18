# Checkpoint

**Slice:** fix/wrangler-previews (Workers Builds on pull requests) — PR open

**Done**
- v0.2.0 on npm (all six packages, author sensei-hq) and as a GitHub release (breaking: playScore/signMedia options).
- Copyright holder and author renamed to sensei-hq everywhere (PR #16).
- Workers Builds previews diagnosed from the build log (Cloudflare API): dashboard settings were right (root `/`,
  `bunx wrangler preview -c site/wrangler.jsonc`); wrangler refused a config without a `previews` block.
- site/wrangler.jsonc gains `"previews": {}`; site/src/lib/deploy.test.ts guards it (red first). Site 36 specs green,
  production `wrangler deploy --dry-run` still clean.

**Remaining**
- Confirm "Workers Builds: emaki" goes green on this PR, then merge.

**Next command:** `gh pr checks <this PR>` then `gh pr merge <this PR> --merge --delete-branch`

**Open questions:** none.

**Known broken:** nothing known.
