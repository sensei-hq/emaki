# Change: Voice controls (VO toggle, figure captions, one film-level state)

The standard chrome (0.4.0) ships one sound toggle: score plus narration, ducked, with no
separate VO button. Reviewing narrated campaign films surfaced three gaps: there is no way to
mute the voiceover while keeping the motion score; article figures (single scenes) have no
captions and no narration split even though their scenes carry voice lines; and every player
instance owns its sound/CC state, so a film plus its figures drift apart instead of behaving
as one film. This change closes all three while keeping the chrome's one-toggle simplicity
for apps that don't opt in.

## Why

Narrated films need a voice cut that isn't a mute: reviewers check the mix, readers re-read
with captions while the score plays, and figures inside an article are part of the same film
so their toggles must agree with the player's. Voice audio itself stays app-served (URLs on
the film source); this change only governs state, toggles and captions.

## What Changes

- Core `Show` gains an independent voice cut: `voiceOn` (default true) plus `setVoice(on)`.
  Narration is audible only when sound AND voice are on; the score ducks only while narration
  is actually audible. `ShowState` and the listener carry `voiceOn` so chrome and apps observe it.
- The chrome gains a VO toggle beside mute: mic glyph under a `voice` key in
  `DEFAULT_CHROME_ICONS` (overridable like every icon), `aria-pressed`, `Voice on` /
  `Voice off` labels, `V` key. It hides when the film has no voice lines, the same gate as CC.
- Figures speak the same language: `MotionScene` (all three wrappers, plus the
  `<motion-scene>` speaker path) gains captions — an overlay of the scene's voice line while
  CC is on — and its narration follows the voice cut (speaker plays score plus take, or score
  alone with voice off). The core scene-sound helper splits the same way so every surface
  inherits it.
- Controlled props on both `MotionShow` and `MotionScene` in all three wrappers: optional
  `sound` / `cc` / `voice` booleans plus change events, so an app lifts one film-level state
  object and every player on the page follows it. Undefined means uncontrolled (today's
  behavior, per-instance toggles). The elements stay uncontrolled.
- This supersedes the `add-standard-player-chrome` clause "no separate VO button": the button
  now exists, defaulting to on, so existing films behave exactly as before until an app or a
  viewer touches it.

## What Does Not Change

- No new audio pipeline: takes keep arriving as app-provided URLs. Dev serving and the
  user's voice bucket are site-side follow-ups, not part of this change.
- No visual redesign: the VO toggle reuses the chrome's button, icon and key patterns.
