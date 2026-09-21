# Spec Delta

## Purpose

The lifecycle of a household's single join code: how long it stays valid, how many times it may be
redeemed, how a code presented by a visitor resolves to a household, and what a moderating person
can see and change about it. The code is the household's only remaining access control (C-2.4), so
this capability is where its limits live.

## ADDED Requirements

### Requirement: A join code expires

A household's join code SHALL carry an expiry instant, and SHALL be refused once that instant has
passed. The expiry SHALL be changeable by the household, and SHALL default to seven days after the
code was issued. Source: FR-2.3; `domain/identity.md` §2.1 `join_code_expires_at`.

#### Scenario: A fresh household gets a seven-day expiry
- **WHEN** a household is registered
- **THEN** its join code carries an expiry seven days later

#### Scenario: An expired code is refused
- **WHEN** a code is presented whose expiry has passed
- **THEN** the attempt is refused, whatever the usage cap and count say

#### Scenario: The household changes the expiry
- **WHEN** a moderating person sets a different expiry
- **THEN** validity is judged against the new instant from that moment on

### Requirement: A join code has a usage cap and a use count

A household's join code SHALL carry a maximum number of redemptions and a count of redemptions so
far. The maximum SHALL be changeable by the household and SHALL default to **one**. The count SHALL
start at zero and SHALL increase by exactly one per successful redemption. A code SHALL be refused
once the count has reached the maximum. Source: FR-2.4, FR-2.6, FR-2.7.

A maximum that is absent SHALL mean "no limit". This is the state households registered before this
capability existed are migrated into, so that links already in circulation are not invalidated
retroactively — `domain/identity.md` §2.1: *„`null` = unbegrenzt (Default für Bestandshaushalte bei
Migration)"*.

#### Scenario: A new code is single-use
- **WHEN** a household is registered
- **THEN** its join code permits one redemption and records none so far

#### Scenario: The count rises with each redemption
- **WHEN** a redemption of a code succeeds
- **THEN** its recorded count is exactly one higher than before

#### Scenario: A used-up code is refused
- **WHEN** a code is presented whose count has reached its maximum
- **THEN** the attempt is refused

#### Scenario: A cap of zero closes the household
- **WHEN** a moderating person sets the maximum to zero
- **THEN** every attempt is refused, with no separate treatment from any other refusal (EC-2.8)

#### Scenario: A code with no maximum is not capped
- **WHEN** a code carries no maximum
- **THEN** redemption is limited only by the expiry

### Requirement: A code resolves to at most one household

Presenting a join code SHALL identify at most one household. A code that matches no household SHALL
be refused in the same way as a code that matches one and fails its limits.

#### Scenario: A known code identifies its household
- **WHEN** a valid code is presented
- **THEN** the household it belongs to is identified, and no other household is reachable through it

#### Scenario: An unknown code is refused
- **WHEN** a code that belongs to no household is presented
- **THEN** the attempt is refused, and nothing distinguishes it from a code that once existed

### Requirement: A refusal discloses no reason

A refused redemption SHALL yield one single outcome that does not say which of the causes in FR-2.7
applied — expired, used up, rotated, or never valid. No caller SHALL be able to recover the cause
from the outcome. Source: FR-2.8 as corrected 2026-09-21, and the decision recorded in
`review-log.md` §Offene-Punkte-Register.

Two reasons, and the second is binding rather than a preference: naming the cause tells an
unauthenticated stranger whether a code ever existed and whether it was merely used up; and
"replaced by rotation" cannot be distinguished from "never existed" at all while the model carries
one rotating code rather than a history of issuances (**O-18**, open).

#### Scenario: Every cause produces the same outcome
- **WHEN** a code is refused for expiry, and another for its cap, and another for rotation, and
  another for never having existed
- **THEN** all four outcomes are indistinguishable from one another

#### Scenario: Expiry and cap exhausted together need no precedence
- **WHEN** a code is both expired and used up
- **THEN** one refusal is produced, and no rule decides which cause "wins" (EC-2.7)

### Requirement: A redemption is claimed atomically

Deciding that a code may be redeemed and recording that redemption SHALL be one indivisible step.
Where two attempts compete for the last remaining redemption of a code, exactly one SHALL succeed
and the other SHALL be refused. Source: EC-2.1.

This is the ordinary case rather than a rare one: with a default maximum of one, every normal
invitation is a contest for the only redemption a code has.

#### Scenario: Two simultaneous attempts on a single-use code
- **WHEN** two visitors present the same single-use code at the same moment
- **THEN** exactly one succeeds, the other is refused, and the recorded count is one — never two

#### Scenario: The count never exceeds the maximum
- **WHEN** any number of attempts compete for a code
- **THEN** the recorded count never rises above the maximum

### Requirement: Rotation invalidates the previous code and resets its limits

Rotating a household's join code SHALL replace it with a new value, SHALL refuse every subsequent
presentation of the previous value, SHALL reset the use count to zero, and SHALL re-base the expiry
on the moment of rotation. Rotation SHALL NOT affect memberships already created through the
previous code. Source: FR-2.5; `domain/identity.md` §2.1.

#### Scenario: The old link stops working
- **WHEN** a code is rotated and the previous value is presented
- **THEN** the attempt is refused, and the refusal does not say the code was replaced

#### Scenario: The new code starts fresh
- **WHEN** a code is rotated
- **THEN** its count is zero and its expiry is seven days from the rotation

#### Scenario: Existing members are untouched
- **WHEN** a code through which residents already joined is rotated
- **THEN** those memberships are unchanged

### Requirement: The moderating person can see and govern the link

The screen where the link is shared SHALL display the warning that whoever holds the link can vote
and that it belongs only in direct messages to flatmates, SHALL display the full invitation URL
alongside the code, and SHALL let a moderating person change the expiry, change the maximum, and
invalidate the link. Administration and moderation SHALL have equal access to all of it. Sources:
FR-2.2, FR-2.3, FR-2.4, FR-2.5; S-49; U-30 for the parity.

The action that invalidates the link SHALL be called **"Löschen"** — never *„Widerrufen"* and never
*„Zurückziehen"* (`screens/rahmenwerk.md` §8.6). Nothing on the screen SHALL present these limits as
security: they are social visibility (C-2.5).

#### Scenario: The warning sits where the link is copied
- **WHEN** a moderating person opens the screen that shares the link
- **THEN** the warning is visible without interaction, beside the link rather than elsewhere

#### Scenario: Both roles have the same controls
- **WHEN** either an administration account or a moderator opens the screen
- **THEN** both see the same link, the same controls and the same action to invalidate it

#### Scenario: A resident cannot reach any of it
- **WHEN** an account that is neither administration nor moderator requests the screen
- **THEN** the link and its controls are not disclosed

### Requirement: The join code never enters a log or a query string

The join code SHALL NOT appear in any log, including an access log, and SHALL NOT be transmitted as
a query-string parameter. Where the code travels in a URL it SHALL be a path segment. Sources:
AC-2.18, C-2.3, **G-A5**.

#### Scenario: The invitation URL carries the code in its path
- **WHEN** the invitation URL is displayed or copied
- **THEN** the code is a path segment of it, and appears in no query parameter

#### Scenario: A refusal logs nothing containing the code
- **WHEN** a redemption succeeds or is refused
- **THEN** no log record produced by it contains the code

### Requirement: The limits are scoped to their own household

The three limits SHALL be readable and writable only within the household that owns them, enforced
independently of the client. Source: C-2.10, **G-C7**.

#### Scenario: Another household cannot read them
- **WHEN** a session for one household reads households
- **THEN** no other household's code, expiry, maximum or count is returned

#### Scenario: Another household cannot change them
- **WHEN** a session for one household attempts to change another household's limits
- **THEN** nothing is changed
