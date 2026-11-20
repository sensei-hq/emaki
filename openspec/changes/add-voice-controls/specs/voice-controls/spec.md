## ADDED Requirements

### Requirement: Independent voice cut

The core `Show` controller SHALL split narration from the score: a `voiceOn` flag (default
true) with `setVoice(on)`, where narration is audible only when sound and voice are both on,
and the score ducks only while narration is actually audible.

#### Scenario: Mute VO, keep the score

- **WHEN** a narrated film plays with sound on and the app calls `setVoice(false)`
- **THEN** the voice take stops (or stays silent) while the score keeps playing unducked

#### Scenario: Voice off plus sound off stays silent

- **WHEN** sound is off and voice is toggled either way
- **THEN** nothing is audible and restoring sound alone does not restore narration until voice is on

### Requirement: Observable voice state

`ShowState` and the show listener SHALL carry `voiceOn`, so chrome and apps observe voice
cuts the same way they observe sound, captions and play state.

#### Scenario: Listener sees the cut

- **WHEN** the app calls `setVoice(false)` on a playing show
- **THEN** the next listener snapshot reports `voiceOn: false` with everything else unchanged

### Requirement: Chrome VO toggle

The standard chrome SHALL render a voiceover toggle beside mute: the `voice` icon,
`aria-pressed`, `Voice on` / `Voice off` labels and the `V` key, flipping the controller's
voice cut. With no voice lines for the film the VO button SHALL NOT render.

#### Scenario: Toggle cuts the voice

- **WHEN** the viewer activates the VO toggle on a narrated, playing film
- **THEN** the button reads `Voice off` with `aria-pressed="false"` and narration goes silent while the score continues

#### Scenario: No lines, no VO button

- **WHEN** the film has no voice lines in the locale
- **THEN** no VO button renders and the mute toggle keeps working alone

### Requirement: Figure captions

`MotionScene` SHALL offer captions: while CC is on, an overlay shows the scene's voice line
(`aria-live` polite); with no voice line for the scene no caption UI renders.

#### Scenario: Caption follows the figure

- **WHEN** CC is on for a figure whose scene has a voice line
- **THEN** the overlay shows that scene's line

#### Scenario: No line, no captions

- **WHEN** the figure's scene has no voice line
- **THEN** no caption toggle or overlay renders

### Requirement: Figure narration follows the voice cut

A sounding figure SHALL play score plus its voice take while sound and voice are both on,
and score alone with voice off; with sound off it SHALL stay silent.

#### Scenario: Voice cut keeps the figure's score

- **WHEN** a narrated figure plays with sound on and voice is cut
- **THEN** the take goes silent while the figure's score keeps playing

### Requirement: Controlled sound, captions and voice

`MotionShow` and `MotionScene` in all three wrappers SHALL accept optional `sound`, `cc`
and `voice` booleans plus change events: a defined prop drives the player (app state wins
over internal toggles) and every user toggle emits its change event. An undefined prop SHALL
keep today's uncontrolled per-instance behavior.

#### Scenario: App state drives every player

- **WHEN** an app passes `cc={false}` to a show and its figures, then flips its state to true
- **THEN** the show and every figure show captions without any per-player interaction

#### Scenario: Toggle emits, app decides

- **WHEN** the viewer presses mute on a show with defined `sound` and a change handler
- **THEN** the handler fires with the requested value and the player follows the prop, not the press

#### Scenario: Undefined stays uncontrolled

- **WHEN** no controlled props are passed
- **THEN** each player's toggles work per instance exactly as today
