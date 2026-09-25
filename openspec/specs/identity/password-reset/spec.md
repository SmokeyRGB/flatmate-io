# identity/password-reset Specification

## Purpose
The way back in for a resident who lost their password and never added an email address. The
administration issues a single-use reset link for that one active profile, and the resident redeems
it by setting a new password. This is a deliberate trade-off (K-18, O-16). It is recorded and never
presented as a security boundary.
## Requirements
### Requirement: The administration can issue a reset link for an active profile without an email

The household account SHALL be able to issue a password-reset link for an active resident profile
of its own household, provided that profile's account has no email address. No other identity
SHALL be able to issue one. A reset link SHALL be single-use and SHALL expire like any join link.
Sources: O-16 (`domain/identity.md` §2.1, amended by this change: *„Die Verwaltung
(`Membership.is_resident = false`, `manage_members`)"*); PRD §4.1.1 K-18; `resident-settings`
proposal Assumption 5.

#### Scenario: Issuing a reset link
- **WHEN** the household account issues a reset link for an active profile whose account has no
  email
- **THEN** a single-use link is created naming that profile

#### Scenario: A moderator cannot issue one
- **WHEN** a moderator's resident session attempts to issue a reset link
- **THEN** it is refused and no link is created

#### Scenario: A profile with an email gets no reset link
- **WHEN** the household account attempts to issue a reset link for a profile whose account has an
  email
- **THEN** it is refused and no link is created

#### Scenario: Only active profiles
- **WHEN** the household account attempts to issue a reset link for a prepared, moved-out or
  removed profile
- **THEN** it is refused and no link is created

### Requirement: A reset link is valid only while the gap it closes still exists

A reset link SHALL be refused, with the same single message as every invalid join link, once its
profile is no longer active or its account has an email address. This SHALL hold whenever that
happened, including after the link was issued. Sources: O-16 (*„Die Lücke schließt sich
selbst"*); FR-2.8.

#### Scenario: The person adds an email after the link was issued
- **WHEN** a reset link was issued and the resident then adds an email address
- **THEN** the link is refused with the single invalid-link message

#### Scenario: The person moves out after the link was issued
- **WHEN** a reset link was issued and the profile then leaves the active state
- **THEN** the link is refused with the single invalid-link message

### Requirement: Opening a reset link greets the person and asks only for a password

Opening a valid reset link SHALL show the household's name and greet the person by their display
name. It SHALL ask only for a new password, with its rule visible, and for the stay-signed-in
choice. It SHALL NOT ask for a name or an email. Sources: `screens/A-zugang.md` A3 (bound shape);
FR-2.9, FR-2.10a, FR-2.12.

#### Scenario: The reset shape
- **WHEN** someone opens a valid reset link
- **THEN** they see the household name, a greeting naming the profile, and one password field

### Requirement: Redeeming a reset link sets the password and ends every session

Redeeming a reset link SHALL happen in order, each step safe on its own if nothing after it ever
runs:
- first, every session of the profile's account SHALL end and the link SHALL be spent;
- then the profile's new password SHALL be set;
- then the person SHALL be signed in with a new session that lands on Start.

A failure before the password is set SHALL leave the link spent and every session ended, with the
password unchanged; the person needs a new link. A failure after the password is set SHALL leave
it set; the person is told to sign in with their new password. The old password SHALL no longer
sign in once the new one is set. Sources: O-16 (*„beendet alle aktiven `Session`s des betroffenen
Profils"*); O-13; FR-2.18; the redesign in answer to the second review round of PR #23 (Postgres and the identity
provider are separate systems with no transaction spanning both — CLAUDE.md "No transaction spans Postgres and
Supabase Auth").

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

### Requirement: A reset is recorded where the household can see it

Issuing a reset link SHALL be recorded like issuing any link. Redeeming one SHALL be recorded as an
administrative password reset of that profile, naming no password and no code. Sources: O-16
(*„jeder administrative Reset erzeugt einen `ActivityEvent` … (`account.password_reset_by_admin`)"*);
G-A5; G-D7.

#### Scenario: A reset leaves an event
- **WHEN** a reset link is redeemed
- **THEN** an append-only `account.password_reset_by_admin` entry names the profile and the time
- **AND** it contains neither the code nor a password

### Requirement: The reset is never presented as protection

No screen SHALL describe the reset link as a security measure. The screen that issues it SHALL
state that whoever holds the link can set the profile's password. Sources: E-03; K-18 (*„Nicht als
Sicherheitsgrenze darstellen"*).

#### Scenario: Issuing states what the link can do
- **WHEN** the household account issues a reset link
- **THEN** the screen says that whoever opens the link can set this person's password

