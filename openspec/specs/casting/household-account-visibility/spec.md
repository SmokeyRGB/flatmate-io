# casting/household-account-visibility Specification

## Purpose
What a household-account session — one with no resident profile acting (ADR-013) — can see of a
casting round and of the applications in it: the round's identity and lifecycle, and nothing derived
from `Application`, enforced both in the application and in the database. Seeded lazily on first
touch from implemented behaviour plus this change. Sources: `docs/GUARDRAILS.md` G-D15,
`docs/adr/0014-haushalts-account-sieht-runden-ohne-bewerbungsdaten.md`.
## Requirements
### Requirement: A household-account session sees a round's identity and lifecycle only

Every read of a casting round in a session without a resident profile SHALL return only the round's
identity and lifecycle fields — existence, title, status, room ids, opened/closed/phase-deadline
timestamps, and the three retention fields — and SHALL NOT return the list of participating
residents. This is already-implemented behaviour, recorded here on first touch. ADR-014:
*„Rundenidentität und Lebenszyklus ja, alles aus `Application` Abgeleitete nein — **einschließlich
Aggregaten.**"*

#### Scenario: A single round is read without a profile
- **WHEN** a household-account session reads one round
- **THEN** exactly the identity and lifecycle fields listed above are returned, and no other field

#### Scenario: A round's participants are requested without a profile
- **WHEN** a household-account session requests the participants of a round
- **THEN** an empty list is returned

### Requirement: No application is visible or writable without a resident profile, at the database level

A session without a resident profile SHALL NOT be able to read, count, insert, update or delete any
`Application` row — neither through the application's repository functions nor by SQL issued
directly under the application's database role inside that session. This holds for every way the
session can lack a profile: the profile setting never set in the transaction, and the profile setting
reading as empty on a pooled connection that earlier served a resident. A session with a resident
profile SHALL keep its existing access, still limited to its own household. G-D15: *„Über die
Policy-Schicht **und** direkt gegen die Datenbank unter der Anwendungsrolle. **Der Test muss die
Zahl ausdrücklich prüfen, nicht nur die Zeile.**"*

#### Scenario: Counting applications by direct SQL without a profile
- **WHEN** a household whose applications exist is queried with `count(*)` over the application table,
  by SQL under the application role, in a session without a resident profile
- **THEN** the count is zero

#### Scenario: The profile setting reads as empty rather than unset
- **WHEN** the same count runs in a transaction where the profile setting reads as the empty string
- **THEN** the count is still zero

#### Scenario: Reading one application through the repository without a profile
- **WHEN** a household-account session reads an existing application of its own household by id
- **THEN** nothing is returned

#### Scenario: Transitioning an application without a profile
- **WHEN** a household-account session requests a state transition on an application
- **THEN** it is refused with an error that names the missing resident profile, and the application's
  state and state-changed timestamp are unchanged

#### Scenario: Inserting an application by direct SQL without a profile
- **WHEN** an insert into the application table is issued by SQL under the application role in a
  session without a resident profile
- **THEN** the database rejects it

#### Scenario: Updating or deleting by direct SQL without a profile
- **WHEN** an update or delete on the household's applications is issued by SQL under the application
  role in a session without a resident profile
- **THEN** no row is changed or removed

#### Scenario: A resident session is unaffected
- **WHEN** a session with a resident profile reads applications
- **THEN** it sees its own household's applications and none of another household's

### Requirement: Application audit events are not visible without a resident profile

A session without a resident profile SHALL NOT be able to read or count audit events whose subject is
an application by SQL under the application role — no repository function reads them today — since each such event
carries that application's state change and their number reveals how many applications exist. Audit
events about other subjects (rooms, rounds, settings, memberships) SHALL remain visible to that
session as before. Source: G-D15, *„weder Zeilen noch **Aggregate**"*.

#### Scenario: Counting application events by direct SQL without a profile
- **WHEN** a household with application state-change events is queried with `count(*)` over the audit
  events whose subject type is application, by SQL under the application role, without a profile
- **THEN** the count is zero

#### Scenario: Other audit events stay visible
- **WHEN** a household-account session reads the audit event recorded for a procedure change while a
  round was open
- **THEN** it is returned as before
