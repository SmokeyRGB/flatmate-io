# identity/account-settings Specification

## Purpose
A resident's own settings screen (E1): adding and changing their email address, changing their
password, and signing out. It also fixes what each of these does to their sessions and to the
address they sign in with.
## Requirements
### Requirement: A resident's settings act on their own account only

The settings screen SHALL be reachable only in a resident session. Every change made on it SHALL
apply to that session's own account and to no other. The account acted on SHALL derive from the
authenticated session, never from a value the caller supplies. A household-account session SHALL
NOT reach it. Sources: `screens/E-einstellungen.md` E1 (*„Aus dem Avatar-Menü"*); ADR-013; G-C.

#### Scenario: A resident changes their own settings
- **WHEN** a signed-in resident saves a change on their settings screen
- **THEN** only their own account is changed

#### Scenario: A household session cannot use the resident settings
- **WHEN** a household-account session attempts any change a resident's settings screen offers
- **THEN** it is refused and nothing is changed

### Requirement: An email address can be added later, framed as a way back in

A resident without an email address SHALL be able to add one on their settings screen. The screen
SHALL present it as restoring access if the password is lost. It SHALL NOT present it as a
requirement, a lock or a notification setting. The address SHALL be stored unverified. Being
unverified SHALL withhold nothing a resident may do, and no content SHALL be delivered to the
address. While no address is set, the screen SHALL state plainly that the resident cannot then
recover a lost password themselves. Sources: FR-2.17, FR-2.15, FR-2.16, AC-2.10, AC-2.11, EC-2.6
(corrected by this change); E1 (*„nie als Sperre formuliert"*); S-45.

#### Scenario: Adding an address
- **WHEN** a resident without an address enters a well-formed address and saves it
- **THEN** it is stored as their address, unverified, and they can do everything they could before

#### Scenario: The pitch is recovery
- **WHEN** a resident without an address opens their settings
- **THEN** the email section explains it as a way back in if the password is lost, and states that
  without it they cannot recover a lost password themselves

#### Scenario: An unverified address receives nothing
- **WHEN** a resident has added an address that was never verified
- **THEN** no deliberation content and no notification is delivered to it

### Requirement: The added address becomes the resident's sign-in address

Saving an address SHALL make it the address the identity provider knows the resident's account
by, so that it can later serve for signing in and for recovery. Changing it SHALL replace the
previous address there as well. Sources: human decision 2026-09-24; `domain/identity.md` §2.1
provider box (amended by this change).

#### Scenario: Signing in with the new address
- **WHEN** a resident has saved an address and later signs in with that address and their password
- **THEN** they are signed in as themselves

#### Scenario: A changed address replaces the old one
- **WHEN** a resident changes their address to a new one
- **THEN** the new one signs them in and the previous one no longer does

### Requirement: An address can be changed but not removed

A resident with an address SHALL be able to change it to another well-formed address. They SHALL
NOT be able to remove it. An empty or malformed submission SHALL be refused with a reason and SHALL
leave the stored address unchanged. Sources: human decision 2026-09-24.

#### Scenario: An empty submission keeps the address
- **WHEN** a resident with an address submits the field empty
- **THEN** the change is refused and their address is unchanged

#### Scenario: A malformed address is refused
- **WHEN** a resident submits text that is not a well-formed address
- **THEN** it is refused with a reason naming the format, and nothing is stored

### Requirement: An address already in use is refused without saying by whom

An address that any account already uses SHALL be refused. The refusal SHALL say only that the
address cannot be used. It SHALL name no account, household or person. Sources:
`resident-settings` proposal Assumption 2.

#### Scenario: The household account's own address
- **WHEN** a resident tries to save the address their household account signs in with
- **THEN** it is refused as unavailable, and nothing is changed

### Requirement: Changing the password needs the current one and ends the other sessions

A resident SHALL be able to change their password by giving the current one and a new one. The
rule the new password must meet SHALL be visible beside the field. A wrong current password SHALL
be refused, changing nothing. A successful change SHALL end every other session of the resident's
account and SHALL keep the session in which it was made. Sources: E1 (*„Passwort ändern"*);
FR-2.10a; O-13 (*„endet bei Passwortänderung"*); human decision 2026-09-24.

#### Scenario: A successful change
- **WHEN** a resident gives their current password and a new one that meets the rule
- **THEN** the new password signs them in and the old one no longer does
- **AND** they stay signed in here, and every other session of their account has ended

#### Scenario: A wrong current password
- **WHEN** a resident gives a wrong current password
- **THEN** the change is refused, the password is unchanged and no session ends

#### Scenario: The rule is visible
- **WHEN** a resident looks at the new-password field
- **THEN** the rule it enforces is shown beside it before they submit

### Requirement: Changes to email and password are recorded without their values

Adding the address, changing it, and changing the password SHALL each be recorded as an
append-only audit entry naming the account and the time. No entry SHALL contain an address or a
password. Sources: FR-0.13; G-D7.

#### Scenario: A recorded change carries no address
- **WHEN** a resident changes their address
- **THEN** an audit entry records the change and contains no address

### Requirement: The settings screen carries the four mandatory states and a way to sign out

The settings screen SHALL carry the loading, empty, error and no-permission states. It SHALL offer
signing out and a way back to Start. It SHALL NOT offer passkey enrolment or push settings in this
slice. Sources: `rahmenwerk.md` §6 (G-N6); E1 (*„Abmelden"*); ADR-007 and `domain/identity.md`
`PasskeyCredential` (a passkey needs a confirmed address, which v0.1 cannot produce).

#### Scenario: Signing out from settings
- **WHEN** a resident signs out from their settings screen
- **THEN** their session ends and they reach the sign-in screen

#### Scenario: No passkey is offered
- **WHEN** a resident opens their settings
- **THEN** no passkey enrolment is offered

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
