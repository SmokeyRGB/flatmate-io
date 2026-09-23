## Purpose

How a member leaves a household: the soft tier for an actual move-out, which can be undone, and the
hard tier for an intruder, which cannot. Covers what each tier does to the profile, the membership,
the sessions, the resident list and the display name. Seeded lazily on first touch from
implemented behaviour.

## ADDED Requirements

### Requirement: Removal has two tiers, and only the soft one is reversible

A moderating person SHALL be able to mark a member as moved out („Ausgezogen") and to remove a member
(„Entfernen"). Marking moved out SHALL be reversible by reactivation. Removal SHALL be final: no
action, and no update issued against the database under the application's own role, SHALL return a
removed member to any other state. A member already marked moved out SHALL still be removable, so a
moderator who used the soft tier first does not have to restore access in order to reach the hard
one. Sources: FR-1.26, U-27 (*„«Entfernen» (hart, endgültig)"*), `screens/O-organisation.md` O16.

#### Scenario: A moved-out member is reactivated
- **WHEN** a moderating person reactivates a member marked moved out
- **THEN** the member's profile is active again and their membership grants access again

#### Scenario: A removed member cannot be reactivated
- **WHEN** a reactivation is requested for a removed member, by any route
- **THEN** it is refused and the member stays removed, their membership still revoked

#### Scenario: Finality holds against a direct database update
- **WHEN** an update issued under the application's database role tries to set a removed profile's
  status to anything other than removed
- **THEN** the database rejects it

#### Scenario: A moved-out member can still be removed
- **WHEN** a moderating person removes a member currently marked moved out
- **THEN** the member becomes removed, with the same finality as removing an active member

#### Scenario: Other fields of a removed profile stay writable
- **WHEN** a column other than the status of a removed profile is updated
- **THEN** the update is not refused on the ground that the profile is removed

### Requirement: Removal requires typing the member's exact display name

Removal SHALL NOT proceed unless the confirmation typed by the acting person matches the member's
display name exactly. Marking moved out SHALL need no such confirmation. Sources: FR-1.26, U-27.

#### Scenario: A mismatched name removes nothing
- **WHEN** the typed confirmation differs from the display name
- **THEN** the member's state is unchanged and the acting person is told the name does not match

### Requirement: Both tiers revoke access at once

Either tier SHALL, in the same transaction as the status change, revoke the member's membership and
every session already issued for their account, so that access ends immediately rather than when a
session next expires. A member in either state SHALL drop out of every participation count and
quorum denominator, and off a round's participant list. Sources: V-3 (`domain/invarianten.md` §5.3, *„sofortiger Zugriffsentzug,
Quorum-Nenner sinkt"*), FR-1.26.

#### Scenario: A session open at removal stops working
- **WHEN** a member with an open session is removed
- **THEN** that session no longer resolves on its next request

#### Scenario: A removed member is not counted
- **WHEN** a round is opened after a member is removed
- **THEN** the removed member is not in the round's participant snapshot (EC-1.3's eligibility)

#### Scenario: A round's participant list shows current residents only
- **WHEN** a participant of an open round is marked moved out or removed, and another participant
  opens the round's participant list (FR-1.19)
- **THEN** that person's name is no longer on it

#### Scenario: A half-finished removal leaves nothing behind
- **WHEN** a removal fails after the status change but before the revocation completes
- **THEN** neither is persisted, and the member is exactly as they were before

### Requirement: A removed member leaves the resident list

The resident list a moderating person sees SHALL NOT show removed members. Members marked moved out
SHALL remain listed, labelled „Ausgezogen", with reactivation available. The read-only list of current
members every resident sees already shows active members only and SHALL continue to. Human decision,
2026-09-22, recorded in `screens/O-organisation.md` O16. Sources: FR-1.25, FR-1.31, U-30.

#### Scenario: A removed member is not listed
- **WHEN** a moderating person opens the resident list after removing a member
- **THEN** the removed member does not appear in it

#### Scenario: A moved-out member stays listed
- **WHEN** a moderating person opens the resident list after marking a member moved out
- **THEN** the member appears labelled „Ausgezogen" and can be reactivated

#### Scenario: A household whose only resident was removed leads with the join link
- **WHEN** the only resident profile in a household has been removed
- **THEN** administration's resident list is treated as having no resident member and leads with
  the join-code action (AC-1.22)

### Requirement: A removed member's display name is free again

Display-name uniqueness within a household SHALL apply only among profiles that are neither moved
out nor removed, so a removed member's name can be given to a new profile or chosen at join. Sign-in
by display name SHALL NOT resolve to a removed profile. Sources: FR-1.4 as amended 2026-09-22, O-12
(`domain/identity.md` §2.1: the display name is the sign-in identifier).

#### Scenario: A new profile takes a removed member's name
- **WHEN** a profile is created, or a join is made, with the display name of a removed member
- **THEN** it succeeds

#### Scenario: The name does not sign in as the removed member
- **WHEN** someone signs in with a removed member's household and display name
- **THEN** the sign-in is refused with the same message as any wrong credential

### Requirement: Removal is recorded, and distinguishable from a move-out

Every removal, move-out and reactivation SHALL write an audit entry naming both the acting account
and the acting profile, and a removal SHALL be recorded under a different event than a move-out.
Sources: FR-1.30, AC-1.23.

#### Scenario: The two tiers leave different records
- **WHEN** one member is marked moved out and another is removed
- **THEN** the audit trail records the two under different event types, each naming the actor

### Requirement: Removals made before the hard tier was final are carried over

A member removed before removal became final, and not reactivated since, SHALL be treated as removed:
not listed, not reactivatable, their name free. A member marked moved out, or reactivated after an
earlier removal, SHALL be left as they are.

#### Scenario: An earlier removal becomes final
- **WHEN** the carry-over runs over a profile whose latest membership event is a removal
- **THEN** the profile is removed and can no longer be reactivated

#### Scenario: An earlier move-out stays reversible
- **WHEN** the carry-over runs over a profile whose latest membership event is a move-out
- **THEN** the profile remains moved out and can still be reactivated
