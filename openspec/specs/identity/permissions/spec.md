# identity/permissions Specification

## Purpose
What a membership is allowed to do: which permissions it holds because of the role it carries, which
must be granted to it one at a time, and what a newly created membership starts with. Seeded lazily
on first touch, describing behaviour that exists rather than restating the requirement packets.

## Requirements

### Requirement: Voting eligibility, role and permissions are three independent things

A membership SHALL carry voting eligibility and a role as independent attributes, plus permissions
that are grantable one at a time. There SHALL be no role hierarchy, no freely definable roles and no
permission templates: appointing somebody moderator SHALL NOT change whether they may vote, and
being able to vote SHALL NOT confer any role. Sources: **S-04**, **E-04**, C-1.3;
`domain/identity.md` §2.1.

This is what lets a person who does not live in the flat moderate it, and a person who does live
there moderate without giving up their vote — both without a special case.

#### Scenario: Appointing a moderator leaves the vote alone
- **WHEN** a resident membership is appointed moderator
- **THEN** it may still vote, and nothing about its voting eligibility changed

#### Scenario: A non-resident may moderate
- **WHEN** a membership that is not a resident carries the moderator role
- **THEN** it holds the moderator's permissions and still may not vote

#### Scenario: One member's grant is not another's
- **WHEN** one member is granted a permission
- **THEN** no other membership gains it, whatever role it carries

### Requirement: Two permissions come with the role, and the rest are granted

`manage_rooms` and `close_round` SHALL be held by every `household_admin` and every `moderator`
without anyone granting them. Every other permission SHALL be held only when it has been granted to
that membership individually. The administering account SHALL hold every permission implicitly —
that boundary is accountability, not access protection (C-1.4). Sources: `domain/identity.md` §2.1
(`manage_rooms`, P-O-10, 2026-09-14; `close_round`, human decision 2026-09-22); FR-1.8, FR-1.12.

These two are the whole list. A third role-assigned permission would make the set a template rather
than a pair of named exceptions, which is what S-04 excludes — so it is a decision to be taken
against S-04, not an extension of this requirement.

#### Scenario: A moderator runs a round without being granted anything
- **WHEN** a membership carries the moderator role and has no permissions granted to it
- **THEN** it may create, open and close a round, and may manage rooms

#### Scenario: A member cannot run a round
- **WHEN** a membership carries the member role and has not been granted `close_round`
- **THEN** creating, opening or closing a round is refused

#### Scenario: A granted member can
- **WHEN** a member is granted `close_round` individually
- **THEN** it may run a round, and its role is still member

#### Scenario: The administering account is never locked out
- **WHEN** the account that registered the household acts
- **THEN** every permission check passes, whatever the membership's permission list holds

### Requirement: No permission is inferred from how a membership came about

A membership's permissions SHALL NOT depend on the order in which it was created, on the join link
it came through, or on anything else about its arrival. A newly created membership SHALL start with
exactly the permissions its role confers and nothing else. Sources: FR-1.8; the human decision of
2026-09-22 replacing the first-resident inference with a role default.

A permission that appears because somebody happened to be first is one nobody chose to give and
nobody can see was given.

#### Scenario: Being first confers nothing
- **WHEN** the first resident membership in a household is created
- **THEN** it holds exactly what its role confers, the same as the second and the tenth

#### Scenario: Arriving by link confers nothing
- **WHEN** a membership is created by redeeming a join link
- **THEN** it holds no permission beyond its role's, whichever link was used

### Requirement: A revoked membership grants nothing

A membership that has been revoked SHALL fail every permission and role check, regardless of the
permissions or role recorded on it, and SHALL NOT be able to open a new session, whichever sign-in
path is used. Revocation itself comes from FR-1.26's two removal tiers (`Membership.revoked_at`,
`domain/identity.md` §2.1). That a revoked membership then grants nothing is implemented behaviour
with no requirement of its own. It is recorded here because every other requirement in this
capability rests on it, not because a packet states it. The sign-in half follows from V-3's
*„sofortiger Zugriffsentzug"* (`domain/invarianten.md` §5.3): revoking the sessions that exist
means nothing if a new one can be opened. Reactivating a moved-out member clears the revocation, and
they can sign in again.

#### Scenario: Revocation takes effect everywhere at once
- **WHEN** a membership carrying a role and granted permissions is revoked
- **THEN** every check against it is refused, on every route, without each route testing for it

#### Scenario: A revoked member cannot sign in again
- **WHEN** a member who was marked moved out or removed signs in with correct credentials, by display
  name or by the account's email address
- **THEN** no session is created, and the refusal is the same one a wrong password gets

#### Scenario: A reactivated member signs in normally
- **WHEN** a member marked moved out is reactivated and then signs in with correct credentials
- **THEN** a session is created
