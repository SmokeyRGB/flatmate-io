## REMOVED Requirements

### Requirement: Two permissions come with the role, and the rest are granted
**Reason**: the roles were shortcuts inside the permission check. A moderator held its defaults,
and the administering account every permission, without either being stored, so the permission
list said nothing about what a membership may do. Human decision, 2026-09-28/29: *"The terms
'household' or 'moderator' should simply map to permissions; they shouldn't be a separate
workaround for permissions / Backdoor for ignoring permissions."* And: *"Permissions are granted
via becoming/occupying one of the roles (resident, moderator, household) and revoked when someone
looses the moderator role / moves out and looses the resident status."* The requirement also
called two defaults "the whole list", while `domain/identity.md` §2.1 now has four.
**Migration**: replaced by the requirements below. Existing memberships receive their roles'
permissions in the same migration that makes them required. The round and room scenarios carry
over unchanged.

## ADDED Requirements

### Requirement: Roles are names for fixed sets of permissions, and every check reads only the stored permissions

There SHALL be no rights management besides permissions. "Household", "resident" and "moderator"
SHALL be names for fixed sets of permissions, and nothing more. A membership SHALL hold the union
of the sets of the roles it occupies, stored on the membership. Every permission check SHALL test
only the stored permissions, and never a role, for every membership, the administering one
included. The sets, as the specification assigns them (`03-PRD.md` §4.0.1):

| Role | Occupied by | Set in this change |
|---|---|---|
| **household** | the administering membership (`role = household_admin`) | `manage_rooms`, `manage_settings`, and nothing else |
| **resident** | a live membership with a resident profile (`is_resident`) | none yet; F4 adds the first (voting) |
| **moderator** | a membership appointed moderator (`role = moderator`) | `manage_rooms`, `close_round`, `create_application`, `change_application_state` |

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
- **WHEN** the household account's permissions are checked for `create_application` or
  `change_application_state`
- **THEN** both are refused

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

The matrix's ⬜ column (an individual grant to a resident) stays possible in the model. No screen or
function grants one, so in practice every permission comes with a role. Sources: `03-PRD.md`
§4.0.1; FR-1.8, FR-1.26 (removal tiers); the human decision of 2026-09-29.

#### Scenario: Registration stores the household set
- **WHEN** a household is registered
- **THEN** the administering membership's stored permissions are exactly `manage_rooms` and
  `manage_settings`

#### Scenario: Appointing a moderator grants the moderator set
- **WHEN** a member is appointed moderator
- **THEN** its stored permissions include `manage_rooms`, `close_round`, `create_application` and
  `change_application_state`, and it may create, open and close a round, manage rooms and capture
  applications

#### Scenario: Demotion revokes the moderator set
- **WHEN** a moderator is set back to member
- **THEN** its stored permissions no longer include those four, each of those actions is refused,
  and the resident set is still held

#### Scenario: Moving out revokes everything
- **WHEN** a moderator is marked moved out, or removed
- **THEN** its membership is revoked, its role is member, and it stores no permission at all

#### Scenario: Reactivation restores the resident set only
- **WHEN** a moved-out former moderator is reactivated
- **THEN** it holds the resident set as a member, and none of the moderator's permissions until it
  is appointed again

#### Scenario: A member cannot run a round or capture
- **WHEN** a resident membership that is not a moderator tries to create, open or close a round, or
  to capture an application
- **THEN** it is refused

#### Scenario: Existing memberships are brought in line
- **WHEN** the migration introducing this rule runs
- **THEN** every live membership holds exactly its roles' sets plus what it held before, and every
  revoked membership is a member holding nothing

### Requirement: A membership that contradicts its roles cannot exist

The database SHALL refuse, for every writer and including direct SQL under the application role,
any membership row that:
- is live and lacks a permission of a set its roles give it (moderator, household, resident);
- is the administering membership and holds a permission outside the household set (the matrix
  gives the household account no ⬜ at all);
- is revoked and still holds a permission or the moderator role.

A moderator missing its rights, or a moved-out person keeping one, is therefore a refused write,
not a state the application has to cope with. Sources: the human remark of 2026-09-28 (*"if there
is a moderator profile that does not have the permissions that a moderator should have, something
has significantly gone wrong before"*); `03-PRD.md` §4.0.1 (✅ = *„immer"*).

#### Scenario: Removing a permission from a moderator is refused
- **WHEN** a live moderator membership's stored permissions are written without
  `create_application`, by the application or by direct SQL
- **THEN** the database refuses the write

#### Scenario: Making someone moderator without the permissions is refused
- **WHEN** a membership's role is set to moderator by direct SQL without adding the permissions
- **THEN** the database refuses the write

#### Scenario: The household set is exact
- **WHEN** the administering membership's stored permissions are written without `manage_settings`,
  or with `close_round` or `create_application` added
- **THEN** the database refuses the write

#### Scenario: A revoked membership keeps nothing
- **WHEN** a revoked membership is written with a stored permission or with the moderator role
- **THEN** the database refuses the write

### Requirement: The administering membership never acts as a resident profile

A membership in the `household_admin` role SHALL NOT carry a resident profile. The database SHALL
refuse such a row for every writer, including direct SQL under the application role. The household
account is the WG's administration, never a resident (ADR-013), so the household and resident
roles are never occupied by the same membership. Everything that requires a resident profile,
applications first, stays out of the household account's reach. Sources: ADR-013, S-50,
`domain/identity.md` §2.1 (*„der Haushalts-Account erreicht keine Bewerbung, S-50/U-20"*).

#### Scenario: A household_admin row with a profile is refused
- **WHEN** a membership row with role `household_admin` and a resident profile is written, by the
  application or by direct SQL
- **THEN** the database refuses it

#### Scenario: Registration creates no profile for the administering membership
- **WHEN** a household is registered
- **THEN** its administering membership is created without a resident profile, as before
