## MODIFIED Requirements

### Requirement: Where the invitation is offered

„Einladen" SHALL be offered only to a viewer whose live membership holds `change_application_state`,
decided on the server from the stored permission. It SHALL be offered:
- on the scoreboard, on every row of the „Score" group, scored or unscored, and on no other row;
- on the candidate detail of an application in `new` or `screened` whose results the viewer sees;
- on the organisation's detail of an application in `new` or `screened`.

The dialog SHALL receive only the application's id, its round's id and the applicant's name. It
SHALL receive no contact, no message, no attribute and no collection source. Offering it SHALL
add nothing to the scoreboard's read: no distribution, no voter data and no card field. Sources:
FR-5.24, human decisions Q-14 and 2026-10-06 („Einladen" on the scoreboard row, and on the detail
card), `screens/O-organisation.md` O5.

#### Scenario: A moderator on the scoreboard
- **WHEN** a moderator opens the scoreboard with candidates under „Score" and „Eingeladen"
- **THEN** every „Score" row carries „Einladen", and no „Eingeladen" or „Verdeckt" row does

#### Scenario: A plain resident on the scoreboard
- **WHEN** a resident without `change_application_state` opens the scoreboard
- **THEN** no row carries „Einladen"

#### Scenario: On the organisation's detail
- **WHEN** a moderator opens the detail of an application in `new`
- **THEN** „Einladen" is offered there, and for an application in `invited` it is not

#### Scenario: On the candidate detail
- **WHEN** a moderator opens the candidate detail of a scored or unscored candidate in `new`
- **THEN** „Einladen" is offered there, and for an `invited` candidate, for a candidate whose
  results are hidden, and for a plain resident it is not
