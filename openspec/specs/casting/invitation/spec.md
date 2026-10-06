# casting/invitation Specification

## Purpose
How a household invites an applicant: who may, from which states, the example text that comes with
it, and why nothing is sent or stored before the invitation is confirmed.
## Requirements
### Requirement: Inviting takes a new or screened application to invited in one action

An invitation SHALL take an application from `new` or `screened` to `invited` in one action and one
transaction. From `new` it passes through `screened` by the two declared transitions, so each step
is a declared transition with its own audit entry (G-D3). No other path SHALL be added to the
declared transition table. Sources: FR-5.24, `screens/O-organisation.md` O5 („Als eingeladen
markieren" → `status: new → screened → invited`), `03-PRD.md` §4.1 user flow row 9.

An invitation SHALL be refused:
- for a session without a resident profile, before any query (G-D15);
- for a membership that does not hold `change_application_state`, read as a stored permission in
  the same transaction as the write, never as a role;
- for an id that is not an application of the named round in the session's household (`not_found`);
- for an application in any state other than `new`, `screened` or `invited` (`not_invitable`).

An application that is already `invited` SHALL be left unchanged, with no audit entry, and the action
SHALL report success, so a second click or a second moderator changes nothing. The acting account
and profile SHALL come from the session, never from the caller. The invitation SHALL be serialised
against every other writer of the same application row.

#### Scenario: From new
- **WHEN** a moderator invites an application in `new`
- **THEN** its state is `invited`, its state change time is set, and two audit entries name the
  moderator's account and profile, one with `new` → `screened` and one with `screened` → `invited`

#### Scenario: From a leftover screened
- **WHEN** a moderator invites an application in `screened`
- **THEN** its state is `invited`, and exactly one audit entry records `screened` → `invited`

#### Scenario: Already invited
- **WHEN** a moderator invites an application that is already `invited`
- **THEN** nothing is written and no audit entry is added, and the action reports success

#### Scenario: Another state
- **WHEN** a moderator invites an application in `rejected_by_household` or `withdrawn`
- **THEN** it is refused as `not_invitable`, and the state and the audit trail are unchanged

#### Scenario: A plain resident
- **WHEN** a resident without `change_application_state` invites an application
- **THEN** it is refused on the permission, and the state and the audit trail are unchanged

#### Scenario: The household account
- **WHEN** a session without a resident profile invites an application
- **THEN** it is refused before any query, naming the missing profile

#### Scenario: Another household or another round
- **WHEN** a moderator names an application of another household, or of another round than the
  one given
- **THEN** it is refused as `not_found`, and nothing changes

#### Scenario: Two moderators at once
- **WHEN** two moderators invite the same `new` application at the same time
- **THEN** it ends `invited` with exactly two audit entries, and both actions report success

#### Scenario: A vote racing the invitation
- **WHEN** a resident's vote on an application and its invitation run at the same time
- **THEN** either the vote is recorded before the invitation, or it is refused because the
  application is no longer open for voting; never is a vote recorded on an `invited` application
  after the invitation committed

### Requirement: Quorum never blocks an invitation

An invitation SHALL NOT read votes, quorum or the score, and SHALL succeed for an application with
any number of votes, including none. Sources: FR-5.28, AC-5.10, R-5.5.

#### Scenario: Below quorum
- **WHEN** a moderator invites a candidate below quorum
- **THEN** the invitation succeeds

### Requirement: The invitation comes with an example text, and no privacy notice

Starting an invitation SHALL show an example text for the first contact, before anything changes.
The text SHALL greet the applicant by name, say that the household would like to meet them and ask
when they have time. It SHALL carry no privacy notice and no deadline, whatever the collection
source. Informing the applicant is the household's duty, served at capture and on the application's
detail (Compliance §1, §4.3). The text SHALL be a suggestion: editable, with one copy button. Sources:
FR-5.25 and AC-5.21 as amended by the human decision of 2026-10-06 („overly pushy … the
responsibility of the household"), S-16 as amended.

#### Scenario: The example text
- **WHEN** a moderator starts inviting an application, collected from the applicant or from a third
  party
- **THEN** the example text greets the applicant by name and invites them, and contains no privacy
  notice and no deadline

#### Scenario: The text is edited
- **WHEN** the moderator edits the text and copies it
- **THEN** the copied text is the edited one

### Requirement: Nothing is sent, and nothing is stored before „Eingeladen!"

No send, share or mail control SHALL exist anywhere in the invitation (FR-5.26, AC-5.22). The text,
edited or not, SHALL never be sent to the server. Opening the example text, copying it or closing it
SHALL store nothing and change no state. Only the confirmation „Eingeladen!" SHALL invite. While an
application has not been invited, „Einladen" SHALL stay where it was offered, so a started
invitation can be taken up again (human decision R-3 a, G-J4). The audit entries SHALL carry the
originating and target state only: no text, and nothing typed into the dialog (G-D7).

#### Scenario: Closed without confirming
- **WHEN** a moderator opens the example text and closes it without „Eingeladen!"
- **THEN** the application's state is unchanged, nothing was written, and „Einladen" is still
  offered

#### Scenario: No send action
- **WHEN** the example text is displayed
- **THEN** there is a copy button and no send, share or mail control

#### Scenario: Confirmed
- **WHEN** the moderator presses „Eingeladen!"
- **THEN** the application is invited, and the request carries no text

### Requirement: Where the invitation is offered

„Einladen" SHALL be offered only to a viewer whose live membership holds `change_application_state`,
decided on the server from the stored permission. It SHALL be offered:
- on the scoreboard, on every row of the „Score" group, scored or unscored, and on no other row;
- on the organisation's detail of an application in `new` or `screened`.

The dialog SHALL receive only the application's id, its round's id and the applicant's name. It
SHALL receive no contact, no message, no attribute and no collection source. The scoreboard's own
read SHALL stay unchanged. Sources:
FR-5.24, human decisions Q-14 and 2026-10-06 („Einladen" on the scoreboard row),
`screens/O-organisation.md` O5.

#### Scenario: A moderator on the scoreboard
- **WHEN** a moderator opens the scoreboard with candidates under „Score" and „Eingeladen"
- **THEN** every „Score" row carries „Einladen", and no „Eingeladen" or „Verdeckt" row does

#### Scenario: A plain resident on the scoreboard
- **WHEN** a resident without `change_application_state` opens the scoreboard
- **THEN** no row carries „Einladen"

#### Scenario: On the organisation's detail
- **WHEN** a moderator opens the detail of an application in `new`
- **THEN** „Einladen" is offered there, and for an application in `invited` it is not

