## MODIFIED Requirements

### Requirement: The round's frozen weights are one tap away

A small „(?)" control on the pass SHALL open an explanation of the weights of each rating
taken from the round's frozen rules, and the sentence that the step between „Eher nicht" and
„Finde gut" is the large one. The weights SHALL come from the round's snapshot taken at opening,
never from the household's current settings. When the frozen weights are missing or malformed, or
every weight is zero, the pass SHALL be refused instead of falling back to defaults. The pass and
the ranking SHALL read the weights by the same rule. Sources: FR-4.9, FR-4.10, AC-4.8 (V1.1,
F-11), AC-4.9, EC-4.11, C-4.3, C-4.4, P-3; EC-5.6 and F5 plan finding F-3 (all-zero weights).

#### Scenario: Looking up the weights
- **WHEN** the resident taps „(?)"
- **THEN** a explanation pop-over opens explaining the weights of the four options.

#### Scenario: Settings changed after opening
- **WHEN** the household's weight for `good` is changed to 4 while the round is open
- **THEN** the pass still shows 3 for „Finde gut" (AC-4.9)

#### Scenario: Malformed snapshot
- **WHEN** the round's frozen weights lack a key or hold a non-numeric value
- **THEN** the pass is refused with a message, and no card is shown

#### Scenario: All weights zero
- **WHEN** every one of the round's frozen weights is zero
- **THEN** the pass is refused with the same message, and no card is shown
