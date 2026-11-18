# Checkpoint

**Slice:** player description + captions default + mount coalescing + OpenSpec (toward v0.3.0)

**Done**

- `emaki build` burns captions only with `--captions` (BREAKING: `--no-captions` removed); sidecars still ship.
- Optional VO-script description under the player: core `voiceText`/`voiceLines`/`descriptionFooter`,
  `<motion-show description>`, Svelte/React/Vue `description` props; off by default everywhere.
- OpenSpec adopted: `openspec/` (project, web-components spec, `fix-overlapping-element-mounts` change),
  `AGENTS.md`, slash commands, CLAUDE.md wiring.
- #19 fixed (mounts/starts coalesce on newest, restart-if-emptied); #8 verified fully resolved.
- Issues #8 and #19 closed with evidence. Branch `feat/player-description-captions-mount-fix`, 4 commits.

**Remaining:** PR checks green → merge → `bun run bump` (minor → 0.3.0, tag publishes).

**Next command:** `gh pr checks --watch` on the branch PR, then merge.

**Open questions:** none.

**Known broken:** nothing known.
