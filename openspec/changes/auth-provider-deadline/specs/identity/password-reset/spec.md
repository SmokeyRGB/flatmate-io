## MODIFIED Requirements

### Requirement: Redeeming a reset link sets the password and ends every session

Redeeming a reset link SHALL happen in order, each step safe on its own if nothing after it ever
runs:
- first, every session of the profile's account SHALL end and the link SHALL be spent;
- then the profile's new password SHALL be set;
- then the person SHALL be signed in with a new session that lands on Start.

A failure before the password is set SHALL leave the link spent and every session ended, with the
password unchanged; the person needs a new link. A failure after the password is set SHALL leave
it set; the person is told to sign in with their new password. The old password SHALL no longer
sign in once the new one is set.

When the provider does not answer the request that sets the password (identity `provider-calls`:
an unknown outcome), the application SHALL find out whether the new password now signs in before
it says which of those two failures happened:
- If it signs in, the reset counts as done, and the person is signed in as after any redeemed
  reset.
- If it is found not to sign in, the request SHALL be sent at most once more.
- If the password is still not set after that, the person is told to ask for a new link, as for a
  failure before the password is set.
- If it cannot be told at all, the person SHALL be told that their new password may be set: to try
  signing in with it, and to ask the administration for a new link if that does not work. They
  SHALL NOT be told either definite outcome.

In every case the link stays spent and every earlier session stays ended.

Sources: O-16 (*„beendet alle aktiven `Session`s des betroffenen Profils"*); O-13; FR-2.18; the
redesign in answer to the second review round of PR #23 (Postgres and the identity provider are
separate systems with no transaction spanning both — `.claude/rules/implementation-hazards.md`,
"No transaction spans Postgres and Supabase Auth"); identity `provider-calls`.

#### Scenario: A redeemed reset
- **WHEN** someone redeems a valid reset link with a new password that meets the rule
- **THEN** the new password signs in, the old one does not, and every earlier session of that
  account has ended
- **AND** the link is spent and they are on Start

#### Scenario: A spent reset link
- **WHEN** a redeemed reset link is opened again
- **THEN** it is refused with the single invalid-link message

#### Scenario: A failure before the password is set
- **WHEN** redeeming a reset link ends every session and spends the link, but setting the new
  password then fails
- **THEN** the link stays spent and every session stays ended
- **AND** the password is unchanged (the old one still signs in), and the person is told to ask
  the administration for a new link

#### Scenario: A failure after the password is set
- **WHEN** redeeming a reset link sets the new password, but signing the person in afterward then
  fails
- **THEN** the new password is set and signs in
- **AND** the person is told to sign in with their new password, rather than told the reset failed

#### Scenario: The password was set but the provider's answer was lost
- **WHEN** redeeming a reset link, the provider sets the new password and its answer never arrives
- **THEN** the person is signed in with a new session and lands on Start, exactly as after a
  redeemed reset
- **AND** every earlier session of the account has ended

#### Scenario: The password request never reached the provider
- **WHEN** redeeming a reset link, the provider never receives the request to set the password,
  nor its one repeat
- **THEN** the old password still signs in, the link stays spent, every session stays ended, and
  the person is told to ask the administration for a new link

#### Scenario: Whether the password was set cannot be told
- **WHEN** neither the request to set the password nor any check of it gets an answer
- **THEN** the person is told their new password may be set, to try signing in with it, and to ask
  for a new link if that fails
- **AND** the link stays spent and every earlier session stays ended
