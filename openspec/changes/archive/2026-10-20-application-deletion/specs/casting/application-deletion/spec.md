## Purpose

Removing one application for good: who may do it, what goes with it in the same transaction, how
it is confirmed, and what the audit log keeps afterwards. Serves FR-3.17–FR-3.20 and AC-3.15–AC-3.18
of `docs/backlog/requirements/F3-requirements.md`, G-D4 and G-E5.

## ADDED Requirements

### Requirement: Only a moderator acting as a resident profile deletes an application

Deleting an application SHALL require a session with a resident profile acting whose live
membership holds `delete_application` at the moment of the write. A session without a resident
profile (the household account, a non-resident moderator) SHALL be refused before any query runs.
A membership without the permission SHALL be refused before the application is read, so it learns
nothing about it. Sources: FR-3.17; `03-PRD.md` §4.0.1 („`Application` löschen").

#### Scenario: A moderator deletes
- **WHEN** a moderator with a resident profile deletes an application of a round of its household
- **THEN** the application no longer exists

#### Scenario: A plain resident is refused
- **WHEN** a resident who is not a moderator tries to delete an application
- **THEN** it is refused as lacking the permission, and the application is unchanged

#### Scenario: The household account is refused
- **WHEN** the household account tries to delete an application, through the application or by
  direct SQL under the application role
- **THEN** it is refused, and the application is unchanged

#### Scenario: An application of another round or household is not found
- **WHEN** a moderator names an application that does not exist, belongs to another round than the
  one named, or to another household, or names a malformed id
- **THEN** the deletion is refused as not found and nothing changes

### Requirement: Deleting an application deletes everything that depends on it, and nothing else

A deletion SHALL be a real deletion: the application row and every record that references it
SHALL be removed in one transaction, or nothing is. No other application, its votes, the round,
or its rooms SHALL change. The application SHALL carry no soft-delete marker; there is nothing to
restore. Any application state and any round status SHALL be deletable. Sources: FR-3.17, FR-3.18,
AC-3.15, AC-3.16, G-D4, G-E5, R-3.5.

#### Scenario: One deletion leaves the rest of the round as it was
- **WHEN** a round holds three applications and one is deleted
- **THEN** the other two applications and the round are unchanged in every column

#### Scenario: The votes go with the application
- **WHEN** an application carrying votes of four residents is deleted
- **THEN** none of those votes exists any more, as each of those residents can see, and every
  vote on another application is unchanged

#### Scenario: A failed deletion leaves everything in place
- **WHEN** any step of a deletion fails
- **THEN** the application, its votes and its audit entries are exactly as before

### Requirement: Every table that references an application is deleted through the one entry point

There SHALL be exactly one way to delete an application. The build gate SHALL fail whenever a
table declares a reference to an application and the deletion does not remove that table's rows,
so a table added later cannot be forgotten. Sources: FR-3.18, G-E5 („genau einen
Einstiegspunkt").

#### Scenario: A new referencing table fails the gate
- **WHEN** a table with an application reference is declared and the deletion does not cover it
- **THEN** the test suite fails, naming the table

#### Scenario: A covered table that no longer exists fails the gate
- **WHEN** the deletion names a table that no schema declares any more
- **THEN** the test suite fails, naming the table

### Requirement: The audit log keeps that a deletion happened, and no personal data

A deletion SHALL record one audit entry for the application that states that it was deleted, by
which account and resident profile, and when, with no payload: no name, contact, message,
attribute or other value. In the same transaction, every payload field of the application's
earlier audit entries that is classified as personal SHALL be set to null, keeping the entries'
structure and timestamps. Sources: FR-3.20, AC-3.18, `06-Compliance-Anhang.md` §5.6 rules 1, 3, 4.

#### Scenario: The deletion entry holds no personal data
- **WHEN** an application is deleted and its deletion entry is inspected
- **THEN** it names the event, the application's id, the acting account and profile and the time,
  and its payload is empty

#### Scenario: Earlier entries lose their personal fields
- **WHEN** an application captured with a source and a collection channel is deleted
- **THEN** its creation entry still exists with its time and actor, and its source and collection
  channel are null; its state-change and correction entries are unchanged, since they hold no
  personal field

#### Scenario: Entries of other applications are untouched
- **WHEN** one application is deleted
- **THEN** the audit entries of every other application are unchanged

### Requirement: A deletion and a concurrent change of the same application cannot both apply

A deletion SHALL be serialized against every other writer of the same application and of its
votes: a state change, a correction or a vote arriving while a deletion is in flight SHALL either
complete before the deletion, whose result then includes it, or find the application gone and be
refused. No vote SHALL remain for an application that no longer exists. Sources: AC-3.16 (lock
order), EC-3.7, EC-3.8.

#### Scenario: A deletion waits for a change in flight
- **WHEN** another transaction holds the application for a state change and a deletion starts
- **THEN** the deletion waits for it and then deletes the application as it was left

#### Scenario: A change after the deletion finds nothing
- **WHEN** a state change, a correction, a vote or a second deletion of an application arrives
  after its deletion committed
- **THEN** it is refused, and no row for that application is created again

### Requirement: Deleting asks for a confirmation that names the applicant

The application's detail SHALL offer „Löschen" only to a holder of `delete_application`. It SHALL
open a confirmation naming the applicant and saying the deletion is final; confirming SHALL be the
destructive action, cancelling SHALL change nothing. After a deletion the round's page SHALL be
shown with a short confirmation. A refusal SHALL be shown in the dialog in the apologetic du-tone.
Sources: FR-3.19, AC-3.17, `09-Design-System.md` (dialogs).

#### Scenario: The confirmation names the applicant
- **WHEN** a moderator presses „Löschen" on an application of „Lea Beispiel"
- **THEN** a dialog asks whether to delete „Lea Beispiel", says that the application and everything
  stored with it is deleted for good and cannot be undone, and offers a red confirm and a cancel

#### Scenario: Cancelling keeps the application
- **WHEN** the dialog is cancelled or closed
- **THEN** the application is unchanged and the detail stays open

#### Scenario: Who does not hold the permission sees no way to delete
- **WHEN** the detail is shown to a session that does not hold `delete_application`
- **THEN** no „Löschen" is shown

#### Scenario: After the deletion the round is shown
- **WHEN** the deletion is confirmed and succeeds
- **THEN** the round's page is shown with a confirmation that the application was deleted, and the
  application is no longer listed
