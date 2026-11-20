## 1. Failing specs (red)

- [ ] 1.1 Core show spec: `voiceOn` default true, `setVoice` cuts narration but not score, duck only while narration audible, listener carries `voiceOn`
- [ ] 1.2 Core chrome spec: VO toggle renders beside mute with `voice` icon, pressed state, labels and `V` key; hidden without voice lines
- [ ] 1.3 Core scene-sound spec: figure sound splits score vs take on sound/voice; captions resolve the scene line
- [ ] 1.4 Wrapper specs (svelte/react/vue): `MotionScene` captions overlay; controlled `sound`/`cc`/`voice` plus change events on `MotionShow` and `MotionScene`; undefined stays uncontrolled

## 2. Core

- [ ] 2.1 `Show`: `voiceOn` + `setVoice(on)`; narration gated on sound AND voice; duck only while narration audible; state/listener carry `voiceOn`
- [ ] 2.2 Scene-sound helper: same sound/voice split for single scenes plus the caption-line lookup

## 3. Chrome + element

- [ ] 3.1 `player-chrome.ts`: VO toggle (`voice` icon key, pressed, labels, `V` key, hidden without lines)
- [ ] 3.2 `<motion-scene>`: caption overlay and speaker narration follow the voice cut (elements stay uncontrolled)

## 4. Wrapper adoption

- [ ] 4.1 Svelte `MotionShow`/`MotionScene`: captions overlay, controlled `sound`/`cc`/`voice` + change events
- [ ] 4.2 React `MotionShow`/`MotionScene`: same adoption
- [ ] 4.3 Vue `MotionShow`/`MotionScene`: same adoption

## 5. Gates and docs

- [ ] 5.1 All specs green; coverage still 100/100/100/100; `tsc` clean per package
- [ ] 5.2 Example app shows the VO toggle, figure captions and one-state controlled players (screenshots, Chromium check green)
- [ ] 5.3 READMEs, `docs/llms` texts and plugin references updated where they describe the player; the one-state article pattern documented with an example
