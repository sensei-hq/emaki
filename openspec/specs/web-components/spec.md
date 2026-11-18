# web-components

## Purpose

`<motion-scene>` and `<motion-show>`: the core's story rendering as web components, so every framework
(or none) renders stories the same way.

## Requirements

### Requirement: Element registration

`defineMotionElements()` SHALL define `motion-scene` and `motion-show`, exactly once each.

#### Scenario: First call defines both elements

- **WHEN** `defineMotionElements()` runs
- **THEN** `customElements.get('motion-scene')` and `customElements.get('motion-show')` are defined

#### Scenario: Repeat calls are no-ops

- **WHEN** `defineMotionElements()` runs again
- **THEN** it does not redefine either element

### Requirement: Scene figure

A connected `<motion-scene>` with `film` and `scene` SHALL mount the scene fitted to its box, play it
while visible, and loop it with a short rest. Without both attributes it SHALL render nothing.

#### Scenario: Mounts and fits

- **WHEN** a connected `<motion-scene film="f" scene="a">` settles
- **THEN** its stage carries the box scale and its box has the layout height

#### Scenario: Waits for a film and a scene

- **WHEN** the element lacks `film` or `scene`, or names a film that does not exist
- **THEN** it mounts nothing

### Requirement: Show player

A connected `<motion-show>` with `film` SHALL start the story player, restart it when the film
changes, fit it on resize, and answer the player's keys once the player exists.

#### Scenario: Starts and restarts

- **WHEN** the element gains a `film`, then a different `film`
- **THEN** `controller` exposes the first show, then a new show for the second film

#### Scenario: Fits on resize

- **WHEN** the element resizes after the show started
- **THEN** the visible stage carries the new fit scale

#### Scenario: Keys wait for the player

- **WHEN** a key arrives before the show exists
- **THEN** it is ignored (not prevented)
