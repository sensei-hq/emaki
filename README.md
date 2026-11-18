# emaki 絵巻

An *emaki* is a Japanese illustrated handscroll: pictures and text unrolling together as one story. This is that,
for the web: reader-friendly articles, a presentation-ready story player and narrated videos, all rendered from **one set of JSON
scenes per story**, in every language you configure, in light and dark. Framework-agnostic: the core is plain TypeScript, with thin
wrappers for Svelte, React and Vue, a CLI for production, and a Claude plugin that runs the whole build as a guided
program.

| Package | What |
|---|---|
| [`@senseihq/emaki`](packages/emaki) | Core: JSON scene renderer, film registry, layouts, story player, capture contract, sound, i18n, stories; web components; Vite and fetch loaders; JSON Schemas |
| [`@senseihq/emaki-svelte`](packages/emaki-svelte) | Svelte 5 components: `MotionScene`, `MotionShow`, `ScenePlayer`, `ShowPage` |
| [`@senseihq/emaki-react`](packages/emaki-react) | React components + `useScenePlayer`, `useShowState` |
| [`@senseihq/emaki-vue`](packages/emaki-vue) | Vue 3 components + composables |
| [`@senseihq/emaki-posting`](packages/emaki-posting) | The posting desk: stage → approve exactly what was staged → post on schedule; Cloudflare (D1/R2/Access) and SvelteKit adapters |
| [`@senseihq/emaki-cli`](packages/emaki-cli) | `emaki`: init, plugin install, validate, new, sheet, voice (10 TTS providers, offline and cloud), fit, render, build |

## Quick start

```sh
npx @senseihq/emaki-cli init                    # in your app
npm i @senseihq/emaki @senseihq/emaki-svelte   # or -react / -vue
npx emaki validate
```

[`examples/svelte`](examples/svelte) is a working app: the sample story as an article with figures, the player in
English and Spanish, and the `/show` capture page (`bun run test:browser` checks all three in Chromium, and that the
scenes follow the page into dark mode).

[`site`](site) is [emaki.sensei-hq.com](https://emaki.sensei-hq.com): the landing page (the sample film playing live),
`/docs` rendered from `docs/llms`, and `/llms.txt`. SvelteKit + rokkit, prerendered, deployed to Cloudflare with
`wrangler.jsonc`. Its committed docs copies must match `docs/llms` (`cd site && bun run sync:docs`).

## The Claude plugin

`emaki plugin install` copies the skills (`emaki`, `story-build`, `story-review`, `story-localize`,
`story-media`, `story-publish`), the agents and the playbook into `.claude/`. Say *"build our learning portal with the
emaki playbook"* and Claude interviews you, outlines the site, agrees each story's details, builds a pilot
for approval, then builds the rest in reviewed batches. The plugin source is
[`packages/emaki-cli/plugin`](packages/emaki-cli/plugin); `sensei.library.json` describes it for discovery.

## Development

```sh
bun install
bun run check          # types, build every package, unit specs
bun run test:browser   # the example in Chromium
cd site && bun run dev # the site; bun run check / test / build
bun run bump           # check, then one version for everything (bumpp), commit + tag; the tag publishes
```

Releases follow rokkit's: one version across every package and `sensei.library.json`; pushing a `v*` tag runs
`publish.yml`, which checks the lockfile, publishes in dependency order with npm provenance (trusted publishing,
no token), refuses any tarball whose siblings are pinned to another release (`config/check-pins.mjs`), and writes the
GitHub release. `deprecate.yml` deprecates a bad release (needs an `NPM_TOKEN` secret). From a machine,
`bun run publish:all` publishes core-first, skips any version already on npm, and stops at the first failure.

MIT © sensei-hq
