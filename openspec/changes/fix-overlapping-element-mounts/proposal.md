# Change: Coalesce overlapping motion-scene/motion-show mounts

Migrated from [gh issue #19](https://github.com/sensei-hq/emaki/issues/19).

## Why

When `defineMotionElements()` upgrades elements already in the DOM, each observed attribute fires
`attributeChangedCallback` and each call starts `#mount()` (plus one from `connectedCallback`): up to
six overlapping mounts. The element keeps whichever handle resolves last, which is not necessarily the
live one — `#fit()` then scales a stale detached stage and the visible figures render zoomed and cut off.

## What Changes

- `MotionScene.#mount()`: a mount token; a call superseded by a newer one returns after every `await`
  (before destroying/calling and after resolving), dropping its handle instead of assigning it.
- `MotionShow.#start()`: the same guard for overlapping starts.
- A regression spec on the upgrade path: define the elements after inserting attributed
  `<motion-scene>` elements, and assert every visible stage carries the box scale.

## Impact

- Affected specs: `web-components`
- Affected code: `packages/emaki/src/elements/index.ts`, `packages/emaki/spec/elements.spec.ts`
