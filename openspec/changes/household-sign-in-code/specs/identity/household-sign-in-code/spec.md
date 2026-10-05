## Purpose

The household sign-in code: a short, stable identifier a person can type in, naming a household
on the resident sign-in screen. It lets someone who joined by link sign in again on any device
without ever seeing an internal id (O-12, P-1, P-2).

## ADDED Requirements

### Requirement: Every household has exactly one sign-in code

Every household SHALL have exactly one household sign-in code from the moment it exists, including
households that existed before this capability. No two households SHALL share a code. The code
SHALL have a shape a person can type and that cannot be confused with a join code: upper case,
three groups of four, from the join-code alphabet (no `I`, `O`, `0`, `1`). Sources: P-1
(`docs/README.md` §3.1); `docs/review-log.md`, join-code format row (2026-09-21); the human decision
of 2026-10-05.

#### Scenario: A newly registered household has a code
- **WHEN** a household is registered
- **THEN** it has a sign-in code of three groups of four characters from the join-code alphabet

#### Scenario: Households created by any writer have a code
- **WHEN** a household row is created by a path that does not mention the code at all
- **THEN** the row still has a well-formed, unique sign-in code

#### Scenario: Existing households are backfilled
- **WHEN** the migration has run against a database with households created before it
- **THEN** every one of them has a well-formed sign-in code, and no two share one

### Requirement: The sign-in code is stable and grants nothing on its own

A household's sign-in code SHALL not change in this capability's scope. There SHALL be no
operation that rotates it. It SHALL NOT be treated as a secret: knowing it SHALL give no access to
any data without a resident's own name and password. It SHALL never be accepted where a join code
is expected, nor a join code where it is expected. Sources: C-1.4 (*„keine Sicherheitsgrenze, nur
Zuordnung"*); the join code's separate conditions in `domain/identity.md` §2.1, which this code
deliberately does not carry.

#### Scenario: The code does not join
- **WHEN** a visitor enters a household sign-in code on the join-code entry screen
- **THEN** it is refused like any other invalid code, and no profile is created

#### Scenario: The code alone signs nobody in
- **WHEN** someone presents a valid household sign-in code with a name that does not exist there
- **THEN** no session is created

### Requirement: Residents and the administration can see the code

A signed-in resident SHALL see their household's sign-in code on their settings screen (E1), with
one line saying it is what they sign in with together with their name. The household account SHALL
see it on the household settings screen (O20), with one line saying residents need it to sign in.
The code SHALL be shown in the same grouped form the system issues it in. It SHALL never be put
into a URL. Sources: A2; O-12; the human decision of 2026-10-05.

#### Scenario: Resident sees the code
- **WHEN** a resident opens their settings screen
- **THEN** their own household's sign-in code is shown with its explanatory line

#### Scenario: Household account sees the code
- **WHEN** the household account opens household settings
- **THEN** the household's sign-in code is shown with its explanatory line

#### Scenario: Only the own household's code
- **WHEN** a resident of one household opens their settings screen
- **THEN** no other household's sign-in code appears there
