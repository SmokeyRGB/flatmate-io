## MODIFIED Requirements

### Requirement: The Casting tab leads to what can be done there

The Casting destination SHALL take a resident who has applications awaiting their vote straight to
the screening pass. Otherwise it SHALL show the ranking's place (D1): the heading „Rangliste" and
one sentence saying the ranking will appear there, with no score, no ranking and no invented
content, until F5 fills it in. It SHALL never be an empty surface. Sources: `rahmenwerk.md` §4.1;
human decision 2026-09-24; `screens/D-casting-tab.md` D1 (*„Unterer Tab ‚Casting'"*); human
decision Q-6 (2026-09-30).

#### Scenario: Something to screen
- **WHEN** a resident with applications awaiting their vote opens the Casting tab
- **THEN** they are taken to the screening pass

#### Scenario: Nothing to screen
- **WHEN** a resident with no application awaiting their vote opens the Casting tab
- **THEN** the heading „Rangliste" and its one sentence are shown, and no score
