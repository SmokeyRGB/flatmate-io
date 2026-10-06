## ADDED Requirements

### Requirement: A change whose provider answer is lost ends in the provider's state

When the identity provider does not answer a request to change a resident's email address or
password (identity `provider-calls`: an unknown outcome), the application SHALL establish what the
provider now holds before it tells the resident anything definite.

**Email.** The change SHALL count as made only if the provider is found to hold the new address.
- Then the stored address SHALL be the new one, the change SHALL be recorded once, and the
  resident SHALL be told it was saved.
- Otherwise the stored address SHALL stay exactly as it was. That includes staying empty for a
  resident who never gave one: the application's internal sign-in identifier SHALL never become
  their stored address. Nothing SHALL be recorded, and the resident SHALL be told the change was
  not possible right now.
- If what the provider holds cannot be established, the stored address SHALL stay as it was, and
  the resident SHALL be told the change may have applied only partly.

**Password.**
- If the new password is found to sign in, the change SHALL count as made: every other session has
  ended, it is recorded once, and the resident is told it was saved.
- If any request to change the password went unanswered, every other session of the account SHALL
  end, whatever is found afterwards. An unanswered request can still take effect later, and a
  changed password must not leave other sessions running (O-13, *„endet bei Passwortänderung"*).
  The change SHALL be recorded only if it is confirmed. The resident SHALL be told what they need
  to know:
  - that the password is unchanged and their other sessions were ended, when the old password is
    found still to be current;
  - that it is uncertain which password now applies and their other sessions were ended, when it
    cannot be told.
- A change the provider plainly refuses, with no unanswered request before it, SHALL change nothing
  and end no session.

A password check that cannot be completed SHALL be reported as not possible right now, never as a
wrong current password, and nothing SHALL change. That covers a provider that does not answer while
the current password is verified, and a provider that declines the check for a reason other than
the password itself, such as too many requests.

Sources: `.claude/rules/implementation-hazards.md`, "No transaction spans Postgres and Supabase
Auth"; O-13; identity `provider-calls`.

#### Scenario: The email change reached the provider but its answer was lost
- **WHEN** a resident changes their address, the provider applies it, and its answer never arrives
- **THEN** the stored address is the new one, the change is recorded once, and the resident is told
  it was saved

#### Scenario: The email change never reached the provider
- **WHEN** a resident changes their address and the provider never receives the request, nor a
  second copy
- **THEN** the stored address and the provider's address are both unchanged, nothing is recorded,
  and the resident is told the change is not possible right now

#### Scenario: A resident without an address adds one and the request is lost
- **WHEN** a resident who has no stored address adds one, and the provider never receives the
  request, nor a second copy, nor answers any check of it
- **THEN** their stored address is still empty, and a reset link can still be issued for them

#### Scenario: The password change reached the provider but its answer was lost
- **WHEN** a resident changes their password, the provider applies it, and its answer never arrives
- **THEN** the new password signs in, every other session of the account has ended, the change is
  recorded once, and the resident stays signed in here

#### Scenario: The password change never reached the provider
- **WHEN** a resident changes their password and the provider never receives the request, nor a
  second copy
- **THEN** the old password still signs in, every other session of the account has ended, nothing
  is recorded, and the resident is told their password is unchanged and why they were signed out
  elsewhere

#### Scenario: Whether the password changed cannot be told
- **WHEN** neither the change nor any check of it gets an answer
- **THEN** every other session of the account has ended, nothing is recorded, and the resident is
  told it is uncertain which password applies

#### Scenario: The provider plainly refuses the new password
- **WHEN** the provider answers the change with a refusal, and no request before it went unanswered
- **THEN** nothing changes and no session ends

#### Scenario: The current password cannot be checked
- **WHEN** the provider does not answer, or declines for too many requests, while the current
  password is being verified
- **THEN** the resident is told the change is not possible right now, not that the current password
  is wrong, and nothing changes
