## MODIFIED Requirements

### Requirement: Roles are names for fixed sets of permissions, and every check reads only the stored permissions

There SHALL be no rights management besides permissions. "Household", "resident" and "moderator"
SHALL be names for fixed sets of permissions, and nothing more. A membership SHALL hold the union
of the sets of the roles it occupies, stored on the membership. Every permission check SHALL test
only the stored permissions, and never a role, for every membership, the administering one
included. The sets, as the specification assigns them (`03-PRD.md` §4.0.1):

| Role | Occupied by | Set |
|---|---|---|
| **household** | the administering membership (`role = household_admin`) | `manage_rooms`, `manage_settings`, and nothing else |
| **resident** | a live membership with a resident profile (`is_resident`) | none yet; F4 adds the first (voting) |
| **moderator** | a membership appointed moderator (`role = moderator`) | `manage_rooms`, `close_round`, `create_application`, `change_application_state`, `reverse_application_state` |

`reverse_application_state` is the matrix's *„`Application.status` zurücknehmen"*. The matrix
gives it to the moderator with ✅ and to everyone else with ❌, not ⬜, so it is a
**moderator-only** permission. No other set contains it, and no individual grant may add it (see
"A membership that contradicts its roles cannot exist").

Nobody in a household can name, assemble or change a set, which is what S-04 excludes
(`domain/identity.md` §2.1). A feature that builds a further action checked as a permission SHALL
add it to the sets the Rechtematrix gives it to, together with the existing memberships, in the
same change. Sources: `03-PRD.md` §4.0.1; `domain/identity.md` §2.1 (*„vorbelegt"*; P-O-10
2026-09-14; human decisions 2026-09-22, 2026-09-28 and 2026-09-29); FR-1.8, FR-1.12, FR-3.1,
FR-3.24.

#### Scenario: The role alone grants nothing
- **WHEN** a permission is checked for a membership of any role, the administering one included
- **THEN** the answer depends only on its stored permissions

#### Scenario: The household account holds no application permission
- **WHEN** the household account's permissions are checked for `create_application`,
  `change_application_state` or `reverse_application_state`
- **THEN** all three are refused

#### Scenario: The household account does not run rounds
- **WHEN** the household account tries to create, open or close a round, or add a participant
- **THEN** it is refused, and no screen offers it the way to do so (`03-PRD.md` §4.0.1:
  *„`CastingRound` anlegen / schließen / wiedereröffnen"* ❌ for the household account, S-50/U-20)

#### Scenario: A moderator is not granted the settings
- **WHEN** a moderator changes a household setting
- **THEN** it is refused, because `manage_settings` is not in the moderator's set (the matrix gives
  it to the moderator only as a grant, ⬜)

### Requirement: Occupying a role grants its permissions, and losing it revokes them

A membership SHALL receive a role's set in the same write that gives it the role, and SHALL lose
it in the same write that takes the role away:
- **Registration** creates the administering membership with the household set.
- **Joining or claiming a profile** creates a resident membership with the resident set.
- **Appointment** as moderator adds the moderator set. **Demotion** to member removes it. The
  resident set stays.
- **Moving out or removal** revokes the membership. It loses its resident status and its moderator
  role in the same write: its role becomes member, and every stored permission is cleared.
- **Reactivation** of a moved-out member restores the resident set, as a member. A former
  moderator must be appointed again.

A claimed profile's move-out, removal or reactivation SHALL happen only through the paths that
also revoke or restore its membership (`setMovedOut`, `removeMember`, `reactivateMember`). A
direct status change of a claimed profile (one that has a membership) is refused, because it would
leave a live membership acting for a person who moved out. A prepared profile has no membership
yet and keeps its direct status change.

The matrix's ⬜ column (an individual grant to a resident) stays possible in the model for the
permissions the matrix marks ⬜. No screen or function grants one, so in practice every permission
comes with a role. Sources: `03-PRD.md` §4.0.1; FR-1.8, FR-1.26 (removal tiers); the human
decision of 2026-09-29.

#### Scenario: Registration stores the household set
- **WHEN** a household is registered
- **THEN** the administering membership's stored permissions are exactly `manage_rooms` and
  `manage_settings`

#### Scenario: Appointing a moderator grants the moderator set
- **WHEN** a member is appointed moderator
- **THEN** its stored permissions include `manage_rooms`, `close_round`, `create_application`,
  `change_application_state` and `reverse_application_state`, and it may create, open and close a
  round, manage rooms, capture applications, and move an application's state forward and back

#### Scenario: Demotion revokes the moderator set
- **WHEN** a moderator is set back to member
- **THEN** its stored permissions no longer include those five, each of those actions is refused,
  and the resident set is still held

#### Scenario: Moving out revokes everything
- **WHEN** a moderator is marked moved out, or removed
- **THEN** its membership is revoked, its role is member, and it stores no permission at all

#### Scenario: Reactivation restores the resident set only
- **WHEN** a moved-out former moderator is reactivated
- **THEN** it holds the resident set as a member, and none of the moderator's permissions until it
  is appointed again

#### Scenario: A direct status change of a claimed profile is refused
- **WHEN** the profile-only status change is asked to move a claimed moderator's profile out
- **THEN** it is refused, the profile stays active and the membership is unchanged

#### Scenario: A member cannot run a round or capture
- **WHEN** a resident membership that is not a moderator tries to create, open or close a round, or
  to capture an application
- **THEN** it is refused

#### Scenario: Existing memberships are brought in line
- **WHEN** the migration introducing this rule runs
- **THEN** every live membership holds exactly its roles' sets plus what it held before, and every
  revoked membership is a member holding nothing

#### Scenario: Existing moderators receive the new permission
- **WHEN** the migration adding `reverse_application_state` runs
- **THEN** every live moderator holds it, no other membership does, and no other stored permission
  of any membership has changed

### Requirement: A membership that contradicts its roles cannot exist

The database SHALL refuse, for every writer and including direct SQL under the application role,
any membership row that:
- is live and lacks a permission of a set its roles give it (moderator, household, resident);
- is the administering membership and holds a permission outside the household set (the matrix
  gives the household account no ⬜ at all);
- is revoked and still holds a permission or the moderator role;
- is **not a moderator** and holds a moderator-only permission (today
  `reverse_application_state`). The matrix gives such an action ❌, not ⬜, to everyone but the
  moderator, so no individual grant may add it.

A moderator missing its rights, a moved-out person keeping one, or a resident holding a
moderator-only right is therefore a refused write, not a state the application has to cope with.
Sources: the human remark of 2026-09-28 (*"if there is a moderator profile that does not have the
permissions that a moderator should have, something has significantly gone wrong before"*);
`03-PRD.md` §4.0.1 (✅ = *„immer"*, ❌ = not grantable).

#### Scenario: Removing a permission from a moderator is refused
- **WHEN** a live moderator membership's stored permissions are written without
  `create_application` or without `reverse_application_state`, by the application or by direct SQL
- **THEN** the database refuses the write

#### Scenario: Making someone moderator without the permissions is refused
- **WHEN** a membership's role is set to moderator by direct SQL without adding the permissions
- **THEN** the database refuses the write

#### Scenario: The household set is exact
- **WHEN** the administering membership's stored permissions are written without `manage_settings`,
  or with `close_round`, `create_application` or `reverse_application_state` added
- **THEN** the database refuses the write

#### Scenario: A revoked membership keeps nothing
- **WHEN** a revoked membership is written with a stored permission or with the moderator role
- **THEN** the database refuses the write

#### Scenario: A resident cannot be granted a moderator-only permission
- **WHEN** a live member (not a moderator) is written with `reverse_application_state`, by direct
  SQL
- **THEN** the database refuses the write, while the same member written with
  `change_application_state` (⬜, grantable) is accepted
