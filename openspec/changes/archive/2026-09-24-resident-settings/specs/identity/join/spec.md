## MODIFIED Requirements

### Requirement: An email given at join is stored unverified and blocks nothing

An email address supplied at join SHALL be stored without being verified. Its unverified state
SHALL NOT prevent the resident from doing anything the product lets a resident do. No content SHALL
be delivered to an unverified address. The address SHALL become the one the identity provider
knows the resident's account by, exactly as an address added later in the resident's settings
does. An address any account already uses SHALL be refused with a message that names no account,
household or person. The refusal SHALL keep what was typed, except the password. Sources: FR-2.11,
FR-2.15, FR-2.16, FR-2.17, AC-2.10, AC-2.11; `resident-settings` proposal Assumptions 1 and 2.

#### Scenario: An unverified address is not a gate
- **WHEN** a resident joins with an email address and that address is never verified
- **THEN** their membership is active and nothing they may do is withheld pending verification

#### Scenario: An address given at join signs in
- **WHEN** a resident joined with an email address
- **THEN** that address and their password sign them in as themselves

#### Scenario: An address already in use at join
- **WHEN** a joiner submits an address another account already uses
- **THEN** the join is refused, no account or profile is created, and the link is not spent
- **AND** the message names no one
