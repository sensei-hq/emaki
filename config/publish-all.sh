#!/bin/sh
# Publishes every package from this machine (`bun run publish:all`; CI uses publish.yml).
#   - Core first: a wrapper compiled before the core has a dist fails with TS2307.
#   - A version already on npm is skipped, so a release that stopped halfway can be re-run.
#   - The first failure stops the run: nothing goes out against a sibling that did not build.
# `bun publish` runs each package's prepublishOnly (LICENSE + build) and rewrites workspace:* to the release.
set -e
cd "$(dirname "$0")/.."
for d in emaki emaki-svelte emaki-react emaki-vue emaki-posting emaki-cli; do
	name=$(node -p "require('./packages/$d/package.json').name")
	version=$(node -p "require('./packages/$d/package.json').version")
	if [ "$(npm view "$name@$version" version 2>/dev/null)" = "$version" ]; then
		echo "$name@$version is already on npm, skipping"
		continue
	fi
	(cd "packages/$d" && bun publish)
done
