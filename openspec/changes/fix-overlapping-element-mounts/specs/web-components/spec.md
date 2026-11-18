## ADDED Requirements

### Requirement: Coalesced mounts

The newest of overlapping mount or start calls on one element SHALL win, leaving exactly one live
mount: a superseded call SHALL NOT replace the live handle, fit a stale stage, or leak a render loop.
(Custom-element upgrade fires one attribute callback per observed attribute plus `connectedCallback`.)

#### Scenario: Upgrade mounts settle on one live handle

- **WHEN** `defineMotionElements()` upgrades connected `<motion-scene>` elements carrying all five attributes
- **THEN** every overlapping mount resolves with the visible stage scaled to its box (`scale(clientWidth / 1600)`)

#### Scenario: Superseded show start is dropped

- **WHEN** a `<motion-show>` restarts while a previous start is still in flight
- **THEN** the element keeps the newest show and the visible stage stays fitted
