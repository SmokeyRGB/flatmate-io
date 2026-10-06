## ADDED Requirements

### Requirement: Rows still being decided carry „Einladen" for those who may invite

For a viewer whose live membership holds `change_application_state`, every row of the „Score" group
SHALL carry „Einladen", which starts the invitation (spec `casting/invitation`). This applies to
scored and unscored rows alike, because quorum blocks nothing (FR-5.28). No row of „Eingeladen" or
„Verdeckt" SHALL carry it. For any other viewer, no row SHALL carry it. The button SHALL change
nothing about which rows the viewer sees, their order, their score or the highlight. After an
invitation the candidate SHALL appear under „Eingeladen", with its results visible to every
participant, by the existing rules. Sources: FR-5.24, FR-5.28, AC-5.10, human decision 2026-10-06
(„Einladen" on the scoreboard row).

#### Scenario: A moderator sees the button on decided rows
- **WHEN** a moderator opens a scoreboard with one scored and one unscored row under „Score"
- **THEN** both rows carry „Einladen"

#### Scenario: A plain resident sees none
- **WHEN** a resident without `change_application_state` opens the same scoreboard
- **THEN** no row carries „Einladen", and the rows, their order and their scores are the same as
  the moderator's

#### Scenario: After inviting
- **WHEN** a moderator confirms „Eingeladen!" on a row under „Score"
- **THEN** the scoreboard shows that candidate under „Eingeladen" without „Einladen", and the
  candidates left under „Score" keep their order
