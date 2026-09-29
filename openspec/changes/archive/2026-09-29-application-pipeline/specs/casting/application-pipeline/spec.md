## Purpose

What the organisation does with an application after capture: the round's list of applications
grouped by state (screen O4), the optional privacy notice on every application's detail, correcting
an application with an audit trail that holds no values, and the rule every state change passes.

## ADDED Requirements

### Requirement: The round lists its applications grouped by state, with a count per group

The round's page SHALL carry a section headed „Bewerbungen" that lists every application of that
round. The section is part of the same visual block as the round's header (O4 layout, U-29). The
applications SHALL be grouped by their state:
- first the main path in its order (`new`, `screened`, `invited`, `scheduled`, `interviewed`,
  `offer_made`, `moved_in`);
- then the side states (`rejected_by_household`, `declined_by_applicant`, `withdrawn`,
  `archived`).

Each group SHALL be headed by its state word from `rahmenwerk.md` §8.6, together with the number of
applications in it. A group with no application SHALL NOT be shown. Within a group, the most
recently captured application SHALL come first.

Each row SHALL show:
- the applicant's name;
- the state word, as text and not by colour alone (`rahmenwerk.md` §12);
- a short contact summary built from the stored contact fields;
- „Über jemand anderen" when the collection source is a third party.

Each row SHALL link to that application's detail. The list SHALL offer no archive action (O4), and
no search, filter or pagination (A-3.1). Sources: FR-3.14, FR-3.15, AC-3.13, `03-PRD.md` §4.1.7,
`screens/O-organisation.md` O4.

#### Scenario: Grouped by state
- **WHEN** a moderator opens a round with applications in `new` and `screened`
- **THEN** they appear under „Neu" and „Gesichtet", in that order, each heading with its count

#### Scenario: Empty groups are left out
- **WHEN** a round has applications only in `new`
- **THEN** only the „Neu" group is shown

#### Scenario: A third-party application is marked
- **WHEN** a row's application was collected from a third party
- **THEN** the row shows „Über jemand anderen", and a row collected from the applicant shows no
  such marker

#### Scenario: A row leads to the detail
- **WHEN** a moderator activates a row
- **THEN** that application's detail opens

### Requirement: A round without applications says so

Where the round has no application, the section SHALL state „Noch keine Bewerbung erfasst" instead
of an empty surface. While the round is open and the viewer holds `create_application`, the
section SHALL offer „Bewerbung erfassen" as its primary action. Sources: FR-3.16, AC-3.14, O4
„Leer".

#### Scenario: Empty and open
- **WHEN** a moderator opens an open round with no application
- **THEN** the section states that no application has been captured and offers „Bewerbung
  erfassen"

#### Scenario: Empty and not open
- **WHEN** a moderator opens a round that is not open and has no application
- **THEN** the section states that no application has been captured and offers no capture

### Requirement: Only those who work on applications see the list, and the household account sees no number

The list SHALL be returned only to a session with a resident profile acting, whose live membership
holds `create_application` or `change_application_state`. It SHALL contain only applications of
that round and of the session's own household. The permission SHALL hold through the read itself:
the membership stays locked from the check to the end of the read.

A session without a resident profile (the household account) SHALL be refused before any query
runs. Its round page SHALL show neither the list nor any number derived from it. In their place
stands the sentence from `rahmenwerk.md` §8.6: „Das WG-Konto verwaltet die WG — Bewerbungen und
Abstimmung bleiben bei den Bewohner:innen." A resident without either permission SHALL see no
„Bewerbungen" section at all. A malformed round id SHALL show "not found". Sources: G-D15, ADR-014,
O4 „Keine Berechtigung", F3 plan decision Q-11 (the organisation surface is permission-gated,
stricter than V-2, which change `round-visibility-v2` builds for F4).

#### Scenario: The household account
- **WHEN** the household account opens a round's page
- **THEN** it sees the round's title and status and the §8.6 sentence, and no application, name or
  count; the list read runs no query

#### Scenario: A resident without an application permission
- **WHEN** a member without either permission opens a round's page
- **THEN** no „Bewerbungen" section is shown, and the list read refuses

#### Scenario: Another household's round
- **WHEN** a moderator requests the list for a round id of another household
- **THEN** nothing is returned

#### Scenario: A revocation in flight is waited for
- **WHEN** the reader's membership is being revoked in a transaction that has not ended
- **THEN** the list read waits, and once the revocation commits it is refused

### Requirement: Every application offers an optional privacy notice, and nothing depends on it

An application's detail SHALL offer, for every application, a collapsed short privacy notice for
the household to copy:
- for an application collected from the applicant, the Art. 13 text of
  `06-Compliance-Anhang.md` §4.5 Stufe 1, verbatim;
- for a third-party application, its *Variante Dritterhebung*, with the categories generated from
  the fields actually stored. The duty lines keep showing above it, with the one-month date counted
  from capture.

The text SHALL be editable before copying and SHALL never be sent or stored. Beside the notice,
„Warum steht das hier?" SHALL open two or three sentences, in place, on the household's
responsibility for informing the people it collects data from. The system SHALL NOT require, track
or remind anyone to send the notice, and nothing about the application SHALL depend on whether it
was opened or copied. There SHALL be no send, share or mail control. Sources: FR-3.12
(„afterwards"), FR-3.13, FR-3.23, AC-3.9, AC-3.10, AC-3.20, `screens/O-organisation.md` O5 shell.

#### Scenario: The notice for an application from the applicant
- **WHEN** a moderator opens the detail of an application collected from the applicant
- **THEN** a collapsed „Datenschutz-Hinweis" is offered, and opening it shows the Stufe 1 text,
  which does not carry the third-party sentence

#### Scenario: The notice for a third-party application
- **WHEN** a moderator opens the detail of a third-party application
- **THEN** the duty lines are shown with the date counted from capture, and the text behind the
  toggle carries the third-party sentence and the stored categories

#### Scenario: Nothing depends on it
- **WHEN** the notice is never opened, or opened and copied
- **THEN** the application's stored row and its audit trail are the same in both cases

#### Scenario: Why it is there
- **WHEN** a moderator activates „Warum steht das hier?"
- **THEN** a short explanation of the household's responsibility opens in place, and no page is
  navigated to

### Requirement: A holder of `create_application` corrects every captured field, and the audit names fields, never values

A session with a resident profile acting, whose live membership holds `create_application`, SHALL
be able to correct every field the capture form records:
- the name, the age, the contacts, the message and the further attributes;
- the collection source.

A correction SHALL be possible whatever the round's status, since Art. 16 rectification does not
end with a round. It SHALL be refused for a profile-less session before any query, and for a
membership without the permission. A correction SHALL NOT change:
- the application's round, household or state;
- its intake path (`source`, FR-3.10);
- its creator or its capture time.

The input SHALL pass the same rules as capture: the name is required after trimming, and the limits
of C-3.14 and the contact rule apply. A refusal SHALL return only a code and at most a field name,
never a typed value.

A correction SHALL be judged against the values the corrector was shown. If the application was
corrected by someone else after the form was loaded, the correction SHALL be refused as stale,
naming no field and writing nothing. The form keeps what was typed and says that the application
has changed in the meantime. A correction therefore never silently reverts another person's
correction.

A correction that changes nothing SHALL write nothing. Otherwise it SHALL store the new values and
write exactly one audit entry. The entry names the changed fields from a fixed list
(`applicantName`, `age`, `contactEmail`, `contactPhone`, `contactOther`, `messageRaw`,
`attributes`, `collectedFrom`) and contains neither the old nor the new value of any field. It
names the acting account and profile. A correction SHALL never alter or remove a vote already
cast. Sources: FR-3.21, FR-3.22, AC-3.19, `03-PRD.md` §4.1.3 (a correction of `collected_from`
creates an `ActivityEvent`), G-D7, `06-Compliance-Anhang.md` §7.2.

#### Scenario: Correcting the message and the source
- **WHEN** a moderator corrects an application's message text and switches its collection source
- **THEN** both new values are stored, one audit entry names `messageRaw` and `collectedFrom`, and
  the entry contains neither the old nor the new message nor either source value

#### Scenario: Nothing changed
- **WHEN** a moderator saves the correction form without changing anything
- **THEN** the row is unchanged and no audit entry is written

#### Scenario: A correction from a stale form
- **WHEN** moderator B opens the correction form, moderator A then saves a corrected name, and B
  saves a corrected message
- **THEN** B's correction is refused as stale, A's name stays, and no audit entry names B

#### Scenario: The round and the intake path cannot be corrected
- **WHEN** a correction request carries a different round id, a `source` or a `state`
- **THEN** the application's round, source and state are unchanged

#### Scenario: A resident without the permission
- **WHEN** a member without `create_application` submits a correction, through the screen or by
  calling the repository
- **THEN** it is refused and nothing changes

#### Scenario: The household account
- **WHEN** a session without a resident profile submits a correction
- **THEN** it is refused before any query, and nothing changes

#### Scenario: A blank name
- **WHEN** a correction sets the name to whitespace only
- **THEN** it is refused naming the name field, and the stored name is unchanged

### Requirement: Switching to a third party shows the duty with the date counted from capture

When a correction switches the collection source from the applicant to a third party, the
correction form SHALL show the information duty and the Art. 14 text before saving, as capture
does. The one-month date SHALL be counted from the application's capture and not from the
correction. If that date has passed, the form and the detail SHALL say so plainly. Switching from a
third party back to the applicant SHALL be permitted. The earlier audit entries, including the
capture's record of the third-party source, SHALL stay as they are. Sources: EC-3.5, EC-3.6, F-5 of
the F3 plan, `06-Compliance-Anhang.md` §4.5.

#### Scenario: Switched to a third party within the month
- **WHEN** a moderator switches a ten-day-old application to a third party
- **THEN** before saving, the duty is shown with the date one calendar month after the capture

#### Scenario: Switched after the month has passed
- **WHEN** a moderator switches a two-month-old application to a third party
- **THEN** the duty line says plainly that the one-month period has already passed

#### Scenario: Switched back
- **WHEN** a third-party application is switched back to the applicant
- **THEN** the change is saved and audited, and the capture's audit entry still records
  `third_party`

### Requirement: Every state change is guarded in the repository

A state change of an application SHALL be refused:
- for a session without a resident profile, before any query (the household account can change
  no state);
- for a membership that does not hold `change_application_state`;
- for a **backward** state change (every transition the declared table does not list as forward:
  a step back on the main path, a reopening, an un-archiving) whose membership does not also hold
  `reverse_application_state`, which only the moderator's set contains;
- for an application that is not in the session's household.

Each declared transition SHALL carry its own declared rule: which permissions it requires, and
whether it is executable as a plain state change. A transition whose domain effects belong to a
step not yet built (an appointment, the interview and second vote, an offer with its room, a
move-in with its resident profile, its reversal, retention, and the exits from and reopenings into
the states those steps own) SHALL change nothing until the feature that builds that step declares
its rights and the operation that carries its effects. Until then, a holder of
`change_application_state` asking for one SHALL be refused as not available. A member without that
permission SHALL be refused on the permission first. In v0.1 only these are executable plain state
changes:
- `new ⇄ screened ⇄ invited`;
- rejecting, withdrawing or declining from those states;
- reopening into those states.

A reopening into a state SHALL belong to the same step as the forward transition into it. Every
permission a transition's rule requires SHALL be checked, whether the state change runs as a plain
change or inside the operation of its step. The moderator's set SHALL contain every permission the
executable rows require. Every later step extends both the executable rows and the role sets in the
change that builds it (`domain/identity.md` §2.1). Sources: `docs/domain/zustandsmaschinen.md` §3.1 (the effects per transition, I-1 to I-5),
ADR-002 (one declared table), the human decision of 2026-09-29 (*"a moderator only needs rights
for processes from new ⇄ screened ⇄ invited, but that should be extendable with every further
step"*).

The acting account and profile SHALL come from the session, never from the caller. The rule SHALL
hold in the repository for every caller, not only in a route. The state change SHALL be serialised
against every other writer of the same application row. It SHALL keep writing exactly one audit
entry with the originating and target state (FR-0.11, G-D3). Sources: FR-3.24, AC-3.21, `03-PRD.md`
§4.0.1 (*„Kann Status ändern"*, *„`Application.status` zurücknehmen"*), `docs/review-log.md` „F3:
`transitionApplication`".

#### Scenario: A resident without the permission
- **WHEN** a member without `change_application_state` asks for any state change
- **THEN** it is refused, and the state and the audit trail are unchanged

#### Scenario: A forward change with the permission
- **WHEN** a moderator moves an application from `new` to `screened`
- **THEN** the state is `screened`, the state change time is set, and one audit entry names the
  moderator's account and profile with `new` and `screened`

#### Scenario: A backward change without the moderator-only permission
- **WHEN** a member who holds `change_application_state` by a grant, but not
  `reverse_application_state`, moves an application from `screened` back to `new`
- **THEN** it is refused, and the state is unchanged

#### Scenario: A backward change by a moderator
- **WHEN** a moderator moves an application from `screened` back to `new`
- **THEN** the state is `new`, and one audit entry records the backward move

#### Scenario: The household account
- **WHEN** a session without a resident profile asks for a state change
- **THEN** it is refused before any query, naming the missing profile

#### Scenario: Another household's application
- **WHEN** a moderator asks for a state change of an application id of another household
- **THEN** it is refused as not found, and nothing changes

#### Scenario: A step that is not built yet
- **WHEN** a moderator asks to move an application from `invited` to `scheduled`, or from
  `interviewed` to `offer_made`
- **THEN** it is refused as not available, and the state, the room and the audit trail are
  unchanged

#### Scenario: Reopening counts as a way back
- **WHEN** a member holding `change_application_state` by a grant, but not
  `reverse_application_state`, reopens a rejected application into `screened`
- **THEN** it is refused, and a moderator doing the same succeeds
