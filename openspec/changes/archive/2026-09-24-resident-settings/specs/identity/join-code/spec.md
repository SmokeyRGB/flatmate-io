## MODIFIED Requirements

### Requirement: A link may name the person it was issued for

A join link SHALL optionally name one resident profile of its own household. Every link SHALL carry
a purpose: joining, or resetting a password.

- A link that names no profile SHALL behave exactly as every link did before, and SHALL always have
  the joining purpose.
- A joining link that names a profile SHALL name a prepared one, and redeeming it SHALL claim that
  profile.
- A password-reset link SHALL name an active profile whose account has no email address. Redeeming
  it SHALL reset that profile's password (capability `identity/password-reset`).

A link that names a profile SHALL be issued for exactly that person and SHALL carry a maximum of
one redemption. It SHALL be refused once it has been spent, like any other exhausted link. Neither
the name nor the purpose SHALL change anything else about a link: its expiry, its cap, its count,
its deletion and its refusal all behave identically. Sources: the human decisions of 2026-09-22 and
2026-09-24; C-2.4; FR-2.5, FR-2.7; O-16.

A link is the only way a prepared profile can be claimed. That is what makes the household's link
its access control in fact and not only in principle.

#### Scenario: A moderating person issues an invitation for a prepared profile
- **WHEN** a prepared profile exists and an invitation is issued for it
- **THEN** a link is created naming that profile, valid for one redemption

#### Scenario: A named link is refused like any other once spent
- **WHEN** a link naming a profile has been redeemed
- **THEN** further attempts on it produce the same refusal as an exhausted neutral link, naming no
  cause

#### Scenario: Deleting a named link leaves its profile alone
- **WHEN** a link naming a prepared profile is deleted before anyone redeems it
- **THEN** the profile is still prepared and a new invitation can be issued for it

#### Scenario: A link names a profile of its own household only
- **WHEN** a link is issued naming a profile
- **THEN** that profile belongs to the same household as the link, and no link can name a profile
  of another household

#### Scenario: A joining link cannot name an active profile
- **WHEN** a joining link is issued naming an active profile
- **THEN** it is refused and no link is created

#### Scenario: A reset link never creates or claims a profile
- **WHEN** a password-reset link is redeemed
- **THEN** no profile, account or membership is created or claimed
- **AND** no use of the link is attributed to a membership
