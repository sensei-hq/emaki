## 1. Failing specs (red)

- [x] 1.1 Core chrome spec: toolbar buttons (prev/play/next/ticks/count/CC/mute/fullscreen/pop-out), caption overlay, key map, CC/description hidden without voice lines, pop-out hidden without href, icon overrides, custom ticks
- [x] 1.2 Element spec: `<motion-show>` renders chrome by default; `chrome="off"` renders the bare stage; `<motion-scene>` speaker is SVG, not emoji
- [x] 1.3 Wrapper specs (svelte/react/vue): MotionShow renders the icon bar and forwards `playerHref`/`description`

## 2. Core chrome

- [x] 2.1 `player-chrome.ts`: `mountPlayerChrome(host, show, opts)` + `CHROME_CSS`, driven by the show controller subscription (index/playing/sound/ticks)
- [x] 2.2 Caption overlay from `voiceLines(film, locale)`; `aria-live="polite"`; CC toggle with `aria-pressed`
- [x] 2.3 Keys on the chrome root: Space, ArrowLeft/Right, M, C, F (no controller changes)

## 3. Element + wrapper adoption

- [x] 3.1 `<motion-show>`: chrome by default, `chrome="off"` opt-out, `playerhref` attribute; `<motion-scene>`: speaker SVG
- [x] 3.2 Svelte `MotionShow`: adopt core chrome, keep props (`playerHref` new, `fullscreenHref` alias)
- [x] 3.3 React `MotionShow`: same adoption
- [x] 3.4 Vue `MotionShow`: same adoption

## 4. Gates and docs

- [x] 4.1 All specs green; coverage still 100/100/100/100; `tsc` clean per package
- [x] 4.2 Example app shows the default chrome (screenshots, Chromium check green)
- [x] 4.3 READMEs, `docs/llms` texts and plugin references updated where they describe the player

## 5. Aspect-locked stage (follow-up: no letterbox gutters)

- [ ] 5.1 Element `#box`: aspect-ratio from layout always (not just with description), width-driven landscape / height-driven portrait, centered within caps (red specs first)
- [ ] 5.2 Svelte/React/Vue fit containers: same aspect treatment, reactive to layout (red specs first)
- [ ] 5.3 Browser check asserts the stage fills its box edge-to-edge in the example app
- [ ] 5.4 Gates green (specs, 100% coverage, tsc); release notes mention the layout change
