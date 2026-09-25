# identity/sign-in Specification

## Purpose
How a person signs in, seeded lazily with only what this change adds or depends on: which address
a resident's account signs in with, and signing in as a resident with an email address.
## Requirements
### Requirement: A resident signs in by name whether or not they have an email

A resident SHALL be able to sign in with their household, display name and password. This SHALL
hold whether or not their account has an email address, and whether the address was given at join
or added later. Sources: O-12 (`domain/identity.md` §2.1); P-2.

#### Scenario: Name sign-in after adding an email
- **WHEN** a resident who has added an email signs in with household, display name and password
- **THEN** they are signed in as themselves

### Requirement: A resident with an email can sign in with it

A resident whose account has an email address SHALL be able to sign in with that address and their
password. The session SHALL then act as their own resident profile, never as the household.

- The resident side of the sign-in screen SHALL offer the email address as an alternative to
  household and name.
- The household side SHALL also accept a resident's address.
- On the resident side, an address that belongs to the household account SHALL be refused: choosing
  the side is choosing the identity.

A wrong address or password, and a refusal on the resident side, SHALL produce the same refusal as
every other failed sign-in. Sources: human decisions of 2026-09-24 (including the walkthrough);
ADR-013; G-D14.

#### Scenario: Email sign-in as a resident
- **WHEN** a resident with an email signs in with that address and their password, on either side
- **THEN** the session acts as their resident profile

#### Scenario: Email sign-in stays one identity
- **WHEN** a resident signs in with their email
- **THEN** the session does not act as the household account

#### Scenario: The household address on the resident side
- **WHEN** someone enters the household account's address and password on the resident side
- **THEN** it is refused with the same refusal as a wrong password, and no session is created

