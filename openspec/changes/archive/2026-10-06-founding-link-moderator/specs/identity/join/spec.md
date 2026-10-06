## MODIFIED Requirements

### Requirement: Someone who already belongs is not made to join again

A visitor who opens a join link while already signed in as a member of that household SHALL NOT get
a second account or profile; they SHALL be taken to their own landing — Start for a resident, the
household settings screen for the household account — and told they are already a member. A
visitor signed in as a resident of a **different** household SHALL be refused with an explanation,
and SHALL be offered to sign out on the spot; signing out there SHALL end only their own session and
SHALL bring them back to the same invitation, now as a visitor who may join. Sources: EC-2.4,
EC-2.5, A-2.4; `rahmenwerk.md` §6 (Keine Berechtigung: *„Erklärung warum plus wer helfen kann"*).

One exception (human decision, 2026-10-06): the household account of this household opening **its
founding link** is the founder about to join as a resident. It SHALL be shown the join form.
Opening the link SHALL change no session. Submitting the form SHALL end the household account's
own session in the same step that creates the resident, so the founder continues signed in as the
new resident. If the join is refused, the household account's session SHALL be left as it was.
No other session is touched.

#### Scenario: An existing member follows the link
- **WHEN** a signed-in resident of this household opens its join link, the founding link included
- **THEN** no second account or profile is created and they are taken to Start with a note that
  they are already a member

#### Scenario: The household account follows its own link
- **WHEN** the household account of this household, signed in, opens one of its join links that is
  not the founding link
- **THEN** no account or profile is created and it is taken to the household settings screen with
  the same note

#### Scenario: The household account follows its founding link
- **WHEN** the household account of this household, signed in, opens its founding link
- **THEN** it is shown the join form, and its session is still active

#### Scenario: The founder joins from the household account's session
- **WHEN** the household account, signed in, submits the founding link's join form successfully
- **THEN** the household account's session is ended, a resident membership with the moderator role
  is created, and the visitor is signed in as that resident and lands on Start

#### Scenario: A refused founding join keeps the household session
- **WHEN** the household account submits the founding link's join form and the join is refused (a
  taken name, a short password, a link already used)
- **THEN** no account or profile is created and the household account is still signed in

#### Scenario: A resident of another household follows the link
- **WHEN** a signed-in resident of a different household opens this link
- **THEN** the join is refused with an explanation, and it is not the invalid-link message

#### Scenario: Signing out resolves it without losing the invitation
- **WHEN** that resident chooses to sign out from the refusal
- **THEN** their own session ends, no other session is touched, and they are shown the same
  invitation's form

#### Scenario: Signing in elsewhere mid-registration is met the same way at submit
- **WHEN** a visitor opens a link signed out, signs in to a different household in another tab,
  and then submits the join form
- **THEN** the submission is refused with the same explanation and the same offer to sign out, and
  no account is created

### Requirement: A join is recorded, and attributed to the link it was made with

Every successful join SHALL raise the count of the link it used by exactly one, SHALL record which
link that was, and SHALL produce one append-only audit entry naming the new resident profile and the
time of joining. A join through the founding link SHALL additionally produce one audit entry
recording the change from member to moderator, attributed to the new resident, so the appointment
it caused is visible in the history. Neither the record nor an audit entry SHALL contain the code.
Sources: FR-2.6, FR-2.19, AC-2.19, AC-2.26, **G-A5**; the human decision of 2026-10-06.

#### Scenario: The audit answers who and when
- **WHEN** a join succeeds and the audit record is inspected
- **THEN** it names the new resident profile and the time of joining, and carries no code

#### Scenario: A founding join records the appointment
- **WHEN** a resident joins through the founding link and the audit record is inspected
- **THEN** besides the join entry there is exactly one entry recording the role change from member
  to moderator, attributed to that resident, and neither entry carries the code

#### Scenario: The link knows who came through it
- **WHEN** two residents join through the same link
- **THEN** that link's count is two and it names both of them, including after it is used up or
  deleted

#### Scenario: The count rises exactly once per join
- **WHEN** one resident joins
- **THEN** the link's count rises by one, not by two and not by zero
