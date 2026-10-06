## MODIFIED Requirements

### Requirement: A resident signs in by name whether or not they have an email

A resident SHALL be able to sign in with their household, display name and password. This SHALL
hold whether or not their account has an email address, and whether the address was given at join
or added later. The household SHALL be identified by its household sign-in code
(identity/household-sign-in-code), typed by hand or prefilled from the device
(identity/device-memory). A person SHALL never need to know the household's internal id. The code
SHALL be accepted regardless of letter case, surrounding whitespace and hyphens. Sources: O-12
(`domain/identity.md` §2.1, *„zuerst der Haushalt gewählt"*); P-1 and P-2 (`docs/README.md` §3.1);
the human decision of 2026-10-05.

#### Scenario: Name sign-in after adding an email
- **WHEN** a resident who has added an email signs in with household sign-in code, display name and
  password
- **THEN** they are signed in as themselves

#### Scenario: Name sign-in with a hand-typed code
- **WHEN** a resident who joined by link, on a device that has never stored anything, types the
  household sign-in code in lower case without its hyphens, plus their name and password
- **THEN** they are signed in as themselves

#### Scenario: The internal household id is not a sign-in code
- **WHEN** someone enters the household's internal id in the household field, with a correct name
  and password
- **THEN** the sign-in is refused as malformed, and no lookup or password check is made

## ADDED Requirements

### Requirement: An unknown household code is refused like a wrong password

A well-formed household sign-in code that belongs to no household, or to a deleted household,
SHALL be refused with the same message as a wrong name or password. Neither the message nor the
sequence of provider requests SHALL show whether the code, the name or the password was wrong. A
code that is not shaped like a household sign-in code at all MAY be refused as malformed before any
lookup, because its shape alone tells the visitor nothing about any household. Sources:
auth-provider-deadline design D11 (an unknown name takes the same request sequence as a known one);
C-1.4.

#### Scenario: Unknown code, correct name and password of another household
- **WHEN** someone enters a well-formed code that matches no household, with a name and password
  that are valid in some other household
- **THEN** the sign-in is refused with the same message as a wrong password, and no session is
  created

#### Scenario: A deleted household's code
- **WHEN** someone enters the sign-in code of a household whose deletion has been recorded
- **THEN** the sign-in is refused with the same message as a wrong password

#### Scenario: A join code typed into the household field
- **WHEN** someone types a join code (two groups of five) into the household field
- **THEN** it is refused as malformed, before any lookup

### Requirement: Resident name sign-in is rate limited per source

Attempts at the resident name path SHALL be counted per pseudonymised source and household code
entered, separately from the join route's attempts. Where no trusted source address is configured,
the count SHALL fall back to the household code alone. One household being flooded SHALL never
refuse another household's residents. Once a source exceeds the limit within the window, further attempts SHALL be
refused before any code lookup or password check, with a message saying to wait, not that the
credentials were wrong. Every attempt SHALL count, including refused and successful ones. Sources:
`03-PRD.md` §6.5 (*„Ratenbegrenzung bei Anmeldung und Beitrittscode-Eingabe"*); FR-2.28 for the
mechanism reused.

#### Scenario: Limit reached
- **WHEN** a source has made as many resident name sign-in attempts within the window as the limit
  allows, and makes one more
- **THEN** it is refused with the wait message, and neither the code nor the password is checked

#### Scenario: Buckets are separate
- **WHEN** a source has used up its join-route attempts
- **THEN** its resident name sign-in attempts are still allowed, and the reverse holds too

#### Scenario: One household's flood does not lock out another
- **WHEN** the limit is reached for household code A from some source
- **THEN** a resident name sign-in with household code B from the same source is still allowed

### Requirement: Sign-in offers "stay signed in"

Both sides of the sign-in screen SHALL show the checkbox „Auf diesem Gerät angemeldet bleiben",
ticked by default. Ticked, the session SHALL get the long lifetime. Cleared, it SHALL get the short
one, exactly as on the join screen. This SHALL hold for every identity either side can sign in,
including a resident who signs in with their address on the household side. With this, every path
that creates a resident session offers the choice.
Sources: `domain/identity.md` §2.1 `Session.remember_me`/`expires_at` (O-13); EC-2.10; A2
(*„vorbelegt, wenn das Gerät „angemeldet bleiben" hält"*).

#### Scenario: Cleared checkbox gives a short session
- **WHEN** a resident signs in on the resident side with the checkbox cleared
- **THEN** their session row has `remember_me = false` and the short server-side lifetime

#### Scenario: Default gives a long session
- **WHEN** a resident signs in on the resident side without touching the checkbox
- **THEN** their session row has `remember_me = true` and the long lifetime

#### Scenario: Household side, resident address, cleared checkbox
- **WHEN** a resident signs in with their address on the household side with the checkbox cleared
- **THEN** the session acts as their resident profile with `remember_me = false`
