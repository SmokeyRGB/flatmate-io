## MODIFIED Requirements

### Requirement: No permission is inferred from how a membership came about

A membership's permissions SHALL NOT depend on the order in which it was created, or on anything
else about its arrival, with one named exception. A newly created membership SHALL start with
exactly the permissions its role confers and nothing else.

The exception is the household's **founding link**: the one link registration issues to the
founder. A membership created by redeeming it SHALL carry the moderator role, so it holds the
resident set and the moderator set. No other link confers anything, and no screen or function
other than registration SHALL mark a link as a founding link. Sources: FR-1.8; the human decision
of 2026-09-22 replacing the first-resident inference with a role default; the human decision of
2026-10-06 tying the founder's moderator role to the founding link.

A permission that appears because somebody happened to be first is one nobody chose to give and
nobody can see was given. The founding link is different: registration hands it to the founder by
name, its single use admits exactly one person, and the appointment it causes is recorded.

#### Scenario: Being first confers nothing
- **WHEN** the first resident membership in a household is created through any link other than
  the founding link, or by claiming a prepared profile
- **THEN** it holds exactly what its role confers, the same as the second and the tenth

#### Scenario: Arriving by link confers nothing
- **WHEN** a membership is created by redeeming a join link that is not the founding link
- **THEN** it holds no permission beyond the resident set, whichever link was used

#### Scenario: The founding link makes its redeemer moderator
- **WHEN** a membership is created by redeeming the household's founding link
- **THEN** its role is moderator, and its stored permissions are the resident set plus the
  moderator set, the same as a member appointed moderator

#### Scenario: Only registration marks a founding link
- **WHEN** a moderator or the household account issues a join link
- **THEN** that link is not a founding link, and redeeming it creates a member with the resident
  set

### Requirement: Occupying a role grants its permissions, and losing it revokes them

A membership SHALL receive a role's set in the same write that gives it the role, and SHALL lose
it in the same write that takes the role away:
- **Registration** creates the administering membership with the household set.
- **Joining or claiming a profile** creates a resident membership with the resident set.
- **Joining through the founding link** creates a resident membership with the moderator role, the
  resident set and the moderator set.
- **Appointment** as moderator adds the moderator set. **Demotion** to member removes it, and any
  retired permission with it. The resident set stays.
- **Moving out or removal** revokes the membership. It loses its resident status and its moderator
  role in the same write: its role becomes member, and every stored permission is cleared.
- **Reactivation** of a moved-out member restores the resident set, as a member. A former
  moderator must be appointed again.

A claimed profile's move-out, removal or reactivation SHALL happen only through the paths that
also revoke or restore its membership (`setMovedOut`, `removeMember`, `reactivateMember`). A
direct status change of a claimed profile (one that has a membership) is refused, because it would
leave a live membership acting for a person who moved out. A prepared profile has no membership
yet and keeps its direct status change.

An individual grant (the matrix's ⬜) is possible only to a moderator, for the permissions the
matrix marks ⬜ in the moderator column. No screen or function grants one, so in practice every
permission comes with a role. Sources: `03-PRD.md` §4.0.1; FR-1.8, FR-1.26 (removal tiers); the human
decisions of 2026-09-29, 2026-10-01 and 2026-10-06.

#### Scenario: Joining or claiming stores the resident set
- **WHEN** a resident joins by a link other than the founding link, or claims a prepared profile
- **THEN** the new membership's stored permissions are exactly `vote`

#### Scenario: Joining through the founding link stores the moderator set
- **WHEN** a resident joins through the household's founding link
- **THEN** the new membership's role is moderator and its stored permissions are `vote` plus the
  eleven moderator permissions, exactly what an appointment of a member stores

#### Scenario: Registration stores the household set
- **WHEN** a household is registered
- **THEN** the administering membership's stored permissions are exactly `manage_voting_procedure`,
  `manage_rooms`, `manage_join_codes`, `create_resident_profile`, `appoint_moderator`,
  `manage_members`, `export_subject_access` and `issue_password_reset_link`

#### Scenario: Appointing a moderator grants the moderator set
- **WHEN** a member is appointed moderator
- **THEN** its stored permissions include `manage_rooms`, `manage_join_codes`,
  `create_resident_profile`, `appoint_moderator`, `manage_members`, `export_subject_access`,
  `manage_rounds`, `manage_round_participation`, `create_application`, `change_application_state`
  and `reverse_application_state`, and it may run rounds and their participants, manage rooms,
  capture and move applications forward and back, administer members, profiles, moderators and
  join links, and trigger a subject-access export

#### Scenario: Demotion revokes the moderator set
- **WHEN** a moderator is set back to member
- **THEN** its stored permissions no longer include those eleven nor `close_round`, each of those
  actions is refused, and the resident set (`vote`) is still held

#### Scenario: Moving out revokes everything
- **WHEN** a moderator is marked moved out, or removed
- **THEN** its membership is revoked, its role is member, and it stores no permission at all

#### Scenario: Reactivation restores the resident set only
- **WHEN** a moved-out former moderator is reactivated
- **THEN** it holds the resident set (`vote`) as a member, and none of the moderator's permissions
  until it is appointed again


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

#### Scenario: Existing memberships receive the per-row permissions
- **WHEN** the migration introducing one permission per matrix row runs
- **THEN** every live administering membership holds the eight household values; every live
  moderator gains `manage_join_codes`, `create_resident_profile`, `appoint_moderator`,
  `manage_members`, `export_subject_access` and `manage_round_participation`; every live moderator
  holding `close_round` also holds `manage_rounds`; every live resident membership gains `vote`; no other
  membership gains anything; and no stored permission of any membership is dropped
