## 1. Failing regression spec

- [x] 1.1 Upgrade-path spec: insert `<motion-scene>` elements with all attributes, then `defineMotionElements()`; assert every visible stage carries the box scale (red)

## 2. Coalesce mounts

- [x] 2.1 Token guard in `MotionScene.#mount()` (pre-call + post-await checks; destroy dropped handles)
- [x] 2.2 The same guard in `MotionShow.#start()` (plus restart-if-emptied: a superseded show that mounted last owns the host, so its destroy clears it)
- [x] 2.3 Regression spec green; no other spec changes needed

## 3. Gates

- [x] 3.1 Emaki project suite and `tsc` clean
- [x] 3.2 Full coverage still 100/100/100/100
