# Change: Standard player chrome by default

The Clearwell stories site (Astro + `@senseihq/emaki`) ships its own player toolbar over the
`<motion-show>` controller: icon buttons for previous / play-pause / next, scene ticks, a count,
captions, mute, full screen and a pop-out link, with Space / arrows / M / C / F keys. Every emaki
user rebuilds this separately today (the three wrappers each carry the older text-button bar, and
pages like sensei-hq.com roll a fourth), so players look and behave differently everywhere.

## Why

One standard control set, shipped as the emaki default, so every implementation gets the same
player: the reference set above, driven by the core show controller, with the voiceover-script
description staying optional. Custom-chrome users (Clearwell itself) keep working through an
explicit opt-out.

## What Changes

- New core module `player-chrome.ts`: `mountPlayerChrome(host, show, opts)` builds the toolbar
  (prev / play-pause / next / ticks with progress fill / count / CC / mute / full screen /
  pop-out link) plus the caption overlay (current scene's voice line, `aria-live="polite"`).
  Icons ride Rokkit's pattern: `DEFAULT_CHROME_ICONS` (complete `<svg>` strings, one per
  control: prev, play, pause, next, cc, soundOn, soundOff, fullscreenEnter, fullscreenExit,
  popout; Material Symbols paths, Apache 2.0, compatible with MIT, source noted in code) merged
  under an `icons` prop (`{ ...DEFAULT_CHROME_ICONS, ...userIcons }`), so any app swaps glyphs
  without patching the package. Ticks keep emaki's progress fill and are customizable the same
  way via a `renderTick` callback (HTML string per tick, or void for the default progress tick).
  Styling inherits (`currentColor`, system-ui); no brand colors. Progress fill honors a
  `--emk-accent` hook (`var(--emk-accent, currentColor)`) so apps can theme it.
- `<motion-show>` renders the chrome by default; `chrome="off"` keeps today's bare stage for
  custom-chrome users. `<motion-scene>` speaker button moves from emoji (🔈/🔊) to the same
  speaker SVG. Keys: Space, ←/→, M, C (captions), F, handled by the chrome.
- CC and description both read the film's voice lines and hide when a film has none. Pop-out
  renders only when a player-page href is given (`playerHref`; `fullscreenHref` stays as an
  alias). Sound keeps one toggle: score plus narration, ducked (no separate VO button).
  `<motion-show>` takes `icons` and `renderTick` as JS properties (attributes cannot carry
  markup or callbacks); the three wrappers expose them as props.
- The Svelte, React and Vue `MotionShow` components adopt the core chrome, replacing their
  text-button bars; props stay compatible (`cover`, `poster`, `controls`, `description`, …).
- The stage wrapper keeps the content aspect ratio for the current layout (from SIZES) with the
  toolbar below it, so the fitted stage fills its box edge-to-edge instead of letterboxing:
  landscape is width-driven, portrait height-driven, both centered and capped, degrading to
  today's contain-fit gracefully in capped shells.
- Docs follow: package READMEs, `docs/llms` texts, the example app (showing the default), and
  the plugin references where they describe the player.

## Impact

- Affected specs: `player-chrome` (new), `web-components` (element chrome default + opt-out).
- Affected code: `packages/emaki/src/{player-chrome.ts,elements/index.ts}`,
  `packages/emaki-{svelte,react,vue}` MotionShow, `examples/svelte`, docs.
- Visual change for every `MotionShow` user (text bar → icon bar): a minor release, not a
  breaking API change. Custom-chrome implementations add `chrome="off"` on upgrade.
