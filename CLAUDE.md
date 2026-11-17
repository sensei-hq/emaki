# emaki: agent instructions

Monorepo (bun workspaces) for the `@senseihq/emaki*` packages and the emaki Claude plugin.

## Layout

```
packages/emaki          core (TypeScript → dist via tsc): renderer, registry, mount, show, controller, i18n, content,
                         elements/, loaders/{vite,fetch}, schemas/; specs in spec/ (jsdom)
packages/emaki-svelte   Svelte 5 components (svelte-package → dist); Svelte reactivity in player.svelte.ts
packages/emaki-react    React components + hooks (tsc, react-jsx)
packages/emaki-vue      Vue 3 components as render functions + composables (tsc)
packages/emaki-posting  desk rules, access, store interface, createDesk (Request → Response), /cloudflare, /sveltekit,
                         migrations/, poster/ (python, CI)
packages/emaki-cli      `emaki` (plain ESM JS, sade): src/, templates/ (film template + sample content), plugin/
                         (skills, agents, PLAYBOOK, templates, modules)
examples/svelte          the reference app + browser.mjs (Chromium check)
site                     emaki.sensei-hq.com (SvelteKit + rokkit): landing, /docs from docs/llms (committed copies,
                         spec-checked), llms.txt; vitest browser specs
config/                  bump.config.js, check-pins.mjs, publish-all.sh, spec/ (lockfile, library manifest, order)
docs/llms                the reference corpus named by sensei.library.json
```

## Commands

```sh
bun run check            # tsc per package, build all, vitest (projects: config, emaki, posting, cli)
bun run coverage         # the same specs with V8 coverage of packages/*/src (table; html in coverage/index.html)
cd packages/emaki-svelte && bun run check   # svelte-check
bun run test:browser     # build + run the example in Chromium
cd site && bun run check && bun run test && bun run build   # the site (needs `bun run build:all` first)
```

## Rules

- The core imports no UI library. Framework wrappers stay thin: state and DOM work belong in the core
  (`ScenePlayerState`, `attachScene`, `createShow`), the wrapper only binds it to the framework's reactivity.
- A scene is a pure function of time; JSON scenes first, JS scenes are the escape hatch.
- Keys and tokens live only in environment variables or CI secrets; `set-voice` drops anything named key/secret/token.
- One version for everything: never edit versions by hand; `bun run bump`.
- Plugin docs refer to the npm packages and the `emaki` command, never to copied kit files or python tools.
