import { defineConfig } from 'bumpp'

// One version for every package, like rokkit. sensei.library.json's `documents` and `ref` name the release, so they
// move with it; bun.lock records each workspace's version and `bun pm pack` rewrites workspace:* from it, so the bump
// refreshes the lockfile and commits it with the versions (config/spec/lockfile.spec.js checks it before publishing).
export default defineConfig({
	files: ['package.json', 'packages/*/package.json', 'packages/emaki-cli/plugin/.claude-plugin/plugin.json', 'sensei.library.json'],
	recursive: true,
	execute: 'bun install --ignore-scripts',
	all: true
})
