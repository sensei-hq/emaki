## ADDED Requirements

### Requirement: Standard toolbar

`mountPlayerChrome` SHALL render previous, play/pause, next, per-scene ticks, a scene count,
a captions toggle, a mute toggle, a full-screen toggle and, when a player-page href is given,
a pop-out link — as icons with text-free buttons carrying `aria-label` and, for toggles,
`aria-pressed`.

#### Scenario: Full bar with a player href

- **WHEN** chrome mounts with a player href on a narrated film
- **THEN** the toolbar shows prev, play/pause, next, one tick per scene, `1 / N`, CC, mute,
  full screen and the pop-out link

#### Scenario: Pop-out hidden without a href

- **WHEN** chrome mounts without a player href
- **THEN** no pop-out link renders and every other control still does

### Requirement: Play state

The chrome SHALL mirror the controller: play/pause icon and label follow `playing`, ticks mark
past scenes done and the current scene with its progress fill, and the count reads `index + 1 / N`.

#### Scenario: State follows the show

- **WHEN** the show advances to scene 2 of 6 while playing
- **THEN** the button reads Pause, tick 1 is done, tick 2 fills, and the count reads `2 / 6`

### Requirement: Captions from voice lines

The CC toggle SHALL show the current scene's voice line in an overlay caption (`aria-live`
polite); with no voice lines for the film the CC button SHALL NOT render.

#### Scenario: Caption follows the scene

- **WHEN** CC is on and the show moves to a scene with voice text
- **THEN** the overlay shows that scene's line and stays silent otherwise

#### Scenario: No lines, no CC

- **WHEN** the film has no voice lines in the locale
- **THEN** no CC button renders

### Requirement: One sound toggle

The mute toggle SHALL flip the controller's sound (score plus narration, ducked) and expose it
via `aria-pressed` and a `Sound on` / `Sound off` label. There SHALL be no separate VO button.

#### Scenario: Mute round-trips the controller

- **WHEN** the reader toggles mute on, then off
- **THEN** `aria-pressed` reads true, then false, and the controller's sound follows

### Requirement: Full screen and keys

The full-screen toggle SHALL fullscreen the player root (icon swaps enter/exit), and the chrome
SHALL answer Space, ArrowLeft/Right, M, C and F.

#### Scenario: Keys drive the chrome

- **WHEN** the reader presses C, then F
- **THEN** captions toggle, then the player root fullscreen toggles

### Requirement: Custom icons

The chrome SHALL merge caller `icons` over `DEFAULT_CHROME_ICONS` (Rokkit's pattern), so any
subset of glyphs can be replaced without touching the rest.

#### Scenario: One glyph swapped

- **WHEN** chrome mounts with `icons: { pause: '<svg>…</svg>' }`
- **THEN** the pause button shows the custom glyph and every other button shows its default

### Requirement: Custom ticks

The chrome SHALL call `renderTick` per scene tick when given, using its HTML string, and SHALL
otherwise render the default progress tick (done ticks full, the current tick filled to its
progress).

#### Scenario: Custom tick HTML

- **WHEN** chrome mounts with a `renderTick` returning `<i>2</i>` for scene 2
- **THEN** tick 2 shows `<i>2</i>` and still seeks to scene 2 on click

#### Scenario: Default progress tick

- **WHEN** chrome mounts without `renderTick` and the show is mid scene 2 of 6
- **THEN** tick 1 is full, tick 2 fills to the scene progress, and ticks 3–6 are empty

### Requirement: Aspect-locked stage

The show's stage wrapper SHALL keep the content aspect ratio for the current layout, so the
fitted stage fills its box edge-to-edge (within rounding) with the toolbar below it.

#### Scenario: Landscape stage fills its box

- **WHEN** a landscape show settles
- **THEN** the stage rect matches its wrapper rect within 2 px on every side

#### Scenario: Layout switch re-aspects

- **WHEN** the layout flips landscape to portrait
- **THEN** the wrapper keeps the portrait ratio and stays centered within its caps
