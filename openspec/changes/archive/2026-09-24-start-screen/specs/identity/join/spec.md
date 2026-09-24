## MODIFIED Requirements

### Requirement: Someone who already belongs is not made to join again

A visitor who opens a join link while already signed in as a member of that household SHALL NOT get
a second account or profile; they SHALL be taken to their own landing — Start for a resident, the
household settings screen for the household account — and told they are already a member. A
visitor signed in as a resident of a **different** household SHALL be refused with an explanation,
and SHALL be offered to sign out on the spot; signing out there SHALL end only their own session and
SHALL bring them back to the same invitation, now as a visitor who may join. Sources: EC-2.4,
EC-2.5, A-2.4; `rahmenwerk.md` §6 (Keine Berechtigung: *„Erklärung warum plus wer helfen kann"*).

#### Scenario: An existing member follows the link
- **WHEN** a signed-in resident of this household opens its join link
- **THEN** no second account or profile is created and they are taken to Start with a note that
  they are already a member

#### Scenario: The household account follows its own link
- **WHEN** the household account of this household, signed in, opens one of its join links
- **THEN** no account or profile is created and it is taken to the household settings screen with
  the same note

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
