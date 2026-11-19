## ADDED Requirements

### Requirement: Default show chrome

A connected `<motion-show>` SHALL render the standard player chrome; with `chrome="off"` it
SHALL render the bare stage as before (custom-chrome implementations keep working unchanged).

#### Scenario: Chrome by default

- **WHEN** `<motion-show film="f">` settles without a `chrome` attribute
- **THEN** its toolbar shows the standard icon set driving the element's controller

#### Scenario: Opt-out keeps the bare stage

- **WHEN** `<motion-show film="f" chrome="off">` settles
- **THEN** no toolbar renders and `controller` stays available for custom chrome

### Requirement: Speaker icon on scene figures

`<motion-scene>` sound button SHALL use the standard speaker SVG (not emoji), keeping its
`aria-label` action semantics (`Sound on` / `Sound off`) and hidden-until-sound behavior.

#### Scenario: Icon button

- **WHEN** a sounded `<motion-scene>` settles
- **THEN** its sound button shows the speaker-off icon labelled `Sound on`
