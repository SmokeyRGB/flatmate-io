## MODIFIED Requirements

### Requirement: The Casting tab leads to what can be done there

The Casting destination SHALL take a resident who has applications awaiting their vote straight to
the screening pass. Otherwise it SHALL show the ranking (D1) of the round the resident takes part
in: the heading „Rangliste" and the scoreboard of capability `deliberation/ranking`, in one of its
states. It SHALL never be an empty surface. Sources: `rahmenwerk.md` §4.1; human decision
2026-09-24; `screens/D-casting-tab.md` D1 (*„Unterer Tab ‚Casting'"*); human decision Q-6
(2026-09-30), confirmed by F5 human decision Q-2 (2026-10-05).

#### Scenario: Something to screen
- **WHEN** a resident with applications awaiting their vote opens the Casting tab
- **THEN** they are taken to the screening pass

#### Scenario: Nothing to screen
- **WHEN** a resident with no application awaiting their vote opens the Casting tab
- **THEN** the heading „Rangliste" and the round's scoreboard are shown

#### Scenario: No round to show
- **WHEN** a resident who takes part in no round opens the Casting tab
- **THEN** the heading „Rangliste" and the empty state are shown, never a blank screen
