# identity/permissions Specification

## Purpose
What a membership is allowed to do. Roles (household, resident, moderator) are names for fixed sets
of permissions; a membership stores the union of the sets of the roles it occupies, every check
reads only those stored permissions, and the database refuses a membership that contradicts its
roles. Seeded lazily on first touch, describing behaviour that exists rather than restating the
requirement packets.
## Requirements
### Requirement: Voting eligibility, role and permissions are three independent things

A membership SHALL carry voting eligibility and a role as independent attributes, plus its stored
permissions (the union of the sets of the roles it occupies). There SHALL be no role hierarchy, no freely definable roles and no
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

### Requirement: Roles are names for fixed sets of permissions, and every check reads only the stored permissions

There SHALL be no rights management besides permissions. "Household", "resident" and "moderator"
SHALL be names for fixed sets of permissions, and nothing more. A membership SHALL hold the union
of the sets of the roles it occupies, stored on the membership. Every permission check SHALL test
only the stored permissions, and never a role, for every membership, the administering one
included.

There SHALL be **one permission per row** of the Rechtematrix (`03-PRD.md` §4.0.1, as amended on
2026-10-01) for every action that is built, so that each row can later be given to another role on
its own. Each permission SHALL also declare which roles may hold it at all.

**Residents only vote and take part in the casting** (human decision, 2026-10-01). Organising a
casting — rounds, participants, applications — is moderation, reached only from the organisation
area. No permission is therefore holdable by a plain resident: a membership that is neither the
household account nor a moderator holds the resident set and nothing else. The matrix's ⬜ (an
individual grant) remains only for the moderator (the voting procedure).

| Permission | Matrix row | Household | Moderator | Who may hold it |
|---|---|:-:|:-:|---|
| `manage_voting_procedure` | Abstimmungsverfahren ändern (scale weights, favourite budget, hiding results until voted, quorum share) | ✅ | ⬜ | household, moderator |
| `manage_rooms` | `Room` anlegen · Verfügbarkeit ändern | ✅ | ✅ | household, moderator |
| `manage_join_codes` | Beitrittscode erzeugen / löschen | ✅ | ✅ | household, moderator |
| `create_resident_profile` | `ResidentProfile` anlegen | ✅ | ✅ | household, moderator |
| `appoint_moderator` | Moderator ernennen / zurückstufen | ✅ | ✅ | household, moderator |
| `manage_members` | Mitglied entfernen / auf `moved_out` setzen; Reaktivierung | ✅ | ✅ | household, moderator |
| `export_subject_access` | Datenauskunft erzeugen | ✅ | ✅ | household, moderator |
| `issue_password_reset_link` | (O-16, `domain/identity.md` §2.1) | ✅ | — | household |
| `manage_rounds` | `CastingRound` anlegen / schließen / wiedereröffnen | — | ✅ | moderator |
| `manage_round_participation` | `RoundParticipation` hinzufügen / entfernen | — | ✅ | moderator |
| `create_application` | `Application` anlegen | — | ✅ | moderator |
| `change_application_state` | `Application.status` ändern (vorwärts) | — | ✅ | moderator |
| `reverse_application_state` | `Application.status` zurücknehmen | — | ✅ | moderator |
| `vote` | `Vote` abgeben / ändern (and the screening pass that collects it) | — | ✅ if a resident | a resident membership (`is_resident`) |

The resident set is `vote`: a resident votes and takes part in the casting, and that is all a
resident membership holds. A moderator who is also a resident holds it through the resident set, so
voting stays independent of moderating (S-04); a moderator without a resident profile, and the
household account, never hold it. *„Household anlegen"* is registration, before any membership
exists, so it needs no permission; the other half of that row, *„Einstellungen ändern"* for
household-level settings (name, contact address, releasing the privacy page), gets its own
permission when such a setting is built — it is not the voting procedure. F4's later slices and F5 add the remaining resident actions
(veto, notes, own availability, reacting to slots) as further rows of the resident set. The household set is
exactly its ✅ column, since the matrix gives the household account no ⬜. `manage_rounds`
replaces the earlier name `close_round`, which gated creating and opening a round as well, and
`manage_voting_procedure` replaces `manage_settings`, which named every setting while only the
procedure exists. A replaced name is **retired**: it grants nothing, no check may name it, and the
contract step removes it from stored memberships. Actions not yet built get their permission when
they are built, as a new row.

**The model is built to change.** Permissions are expected to be added, moved between roles, split,
renamed and retired as the product grows. Each of these SHALL be a change to the one declaration
(the permission rows with their holders, the role sets, and a record of replaced names with what
replaced them) plus one migration that carries the stored memberships along — never a change to
the checks, screens or flags beyond the one action concerned. A rename or split SHALL carry every
holder of the old name over to the new name(s) its role may hold, in the same migration.

Nobody in a household can name, assemble or change a set, which is what S-04 excludes
(`domain/identity.md` §2.1). A feature that builds a further action checked as a permission SHALL
add its row, with its holders, to the sets the Rechtematrix gives it to, together with the existing
memberships, in the same change. Which role holds which permission SHALL stay open to debate (human
decision, 2026-10-01): moving a permission from one set to another — for example the voting
procedure from the household account to the moderator — SHALL need only a decision recorded in the
matrix, the set definition, and one migration that backfills or strips the existing memberships and
adjusts the constraints. No check, screen or flag SHALL have to change for it, since every one of
them names a permission, never a role. Sources: `03-PRD.md` §4.0.1; `domain/identity.md` §2.1
(*„vorbelegt"*; P-O-10 2026-09-14; human decisions 2026-09-22, 2026-09-28, 2026-09-29 and
2026-10-01); S-04 and FR-1.8 (both amended 2026-10-01: no individual grant to residents); FR-1.3,
FR-1.12, FR-1.27, FR-3.1, FR-3.24; EC-1.7.

#### Scenario: Moving a permission between roles touches no check
- **WHEN** a later decision moves a permission from the household set to the moderator set
- **THEN** the actions it gates, the screens and the navigation follow from the stored permissions
  after the backfill, without a change to any of them

#### Scenario: Renaming a permission keeps every holder's right
- **WHEN** a permission is renamed or split, as `manage_settings` is into `manage_voting_procedure`
- **THEN** every live membership that held the old name and whose role may hold the new one holds
  the new one after the migration, and no check names the old one

#### Scenario: A check on an undeclared permission fails the build
- **WHEN** application code checks a permission that is not declared, or the retired `close_round`
- **THEN** the build gate fails, since nobody could ever pass such a check

#### Scenario: The role alone grants nothing
- **WHEN** a permission is checked for a membership of any role, the administering one included
- **THEN** the answer depends only on its stored permissions

#### Scenario: The household account holds no application permission
- **WHEN** the household account's permissions are checked for `manage_rounds`,
  `manage_round_participation`, `create_application`, `change_application_state` or
  `reverse_application_state`
- **THEN** all five are refused

#### Scenario: The household account does not run rounds
- **WHEN** the household account tries to create, open or close a round, or add a participant
- **THEN** it is refused, and no screen offers it the way to do so (`03-PRD.md` §4.0.1:
  *„`CastingRound` anlegen / schließen / wiedereröffnen"* ❌ for the household account, S-50/U-20)

#### Scenario: A resident holds no organising permission
- **WHEN** a plain resident membership is checked for every permission in the table
- **THEN** only `vote` is held; every other check is refused

#### Scenario: Voting is a permission, not an attribute check
- **WHEN** a membership casts a vote or opens the screening pass
- **THEN** the stored `vote` permission decides, alongside the round's own participation rule;
  the household account and a moderator without a resident profile are refused

#### Scenario: A moderator is not granted the settings
- **WHEN** a moderator changes a household setting
- **THEN** it is refused, because `manage_voting_procedure` is not in the moderator's set (the
  matrix gives it to the moderator only as a grant, ⬜)

#### Scenario: A moderator holds no household-only permission
- **WHEN** a moderator's permissions are checked for `issue_password_reset_link`
- **THEN** it is refused, while `create_resident_profile`, `appoint_moderator`, `manage_join_codes`
  and `manage_members` are held

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

### Requirement: A membership that contradicts its roles cannot exist

The database SHALL refuse, for every writer and including direct SQL under the application role,
any membership row that:
- is live and lacks a permission of a set its roles give it (moderator, household, resident);
- is the administering membership and holds a permission outside the household set (the matrix
  gives the household account no ⬜ at all);
- is revoked and still holds a permission or the moderator role;
- holds a permission whose declared holders exclude its role: a moderator-only permission
  (`manage_rounds`, `manage_round_participation`, `create_application`, `change_application_state`,
  `reverse_application_state`) on a row that is not a moderator; a household-only permission
  (`issue_password_reset_link`) on a row that is not the administering membership; a
  household-or-moderator permission (`manage_voting_procedure`, `manage_rooms`, `manage_join_codes`,
  `create_resident_profile`, `appoint_moderator`, `manage_members`, `export_subject_access`) on a row
  that is neither; a resident-only permission (`vote`) on a row without a resident profile.
  Together: a plain resident row holds the resident set and nothing else.

The constraints SHALL be derived from the one declaration of permissions, holders and sets, so a
move between roles changes the declaration and the constraints together.

**Transition.** Other branches sharing the development database still write the earlier sets. Until
a later contract step, therefore: a live household or moderator row is required to hold only what
both the earlier and the new set contain (the household's `manage_rooms`; the
moderator's `manage_rooms`, `create_application`, `change_application_state`,
`reverse_application_state`); the retired `close_round` and `manage_settings` stay on the rows that
hold them, and the household set may still contain `manage_settings`; and the holder rule is not
yet enforced for the permissions those branches' tests still grant to plain residents
(`manage_rooms`, `create_application`, `change_application_state`). A resident
row is required to hold nothing yet (old code stores the empty resident set). A row short
of its new values is accepted and simply denied the actions they gate. The household set's upper
bound (nothing outside the eight, plus the retired `manage_settings`) and the holder rule for every other permission hold from this
change on. The contract step requires the full sets (`vote` on every live resident), strips the retired names and every organising
permission still held by a plain resident, and enforces the holder rule for all permissions.

A moderator missing its rights, a moved-out person keeping one, or a resident holding a role-bound
right is therefore a refused write, not a state the application has to cope with. Sources: the
human remark of 2026-09-28 (*"if there is a moderator profile that does not have the permissions
that a moderator should have, something has significantly gone wrong before"*); `03-PRD.md` §4.0.1
(✅ = *„immer"*, ❌ = not grantable).

#### Scenario: Removing a permission from a moderator is refused
- **WHEN** a live moderator membership's stored permissions are written without
  `create_application` or without `reverse_application_state`, by the application or by direct SQL
- **THEN** the database refuses the write

#### Scenario: Until the contract step, a set missing the new values is accepted but grants nothing new
- **WHEN** a live household row holding only `manage_rooms` and `manage_settings` (what old code
  registers), or a live
  moderator holding only the five earlier values, is written by direct SQL
- **THEN** the database accepts it, and that membership is refused every action gated by a
  permission it lacks

#### Scenario: Making someone moderator without the permissions is refused
- **WHEN** a membership's role is set to moderator by direct SQL without adding the permissions
- **THEN** the database refuses the write

#### Scenario: The household set is exact
- **WHEN** the administering membership's stored permissions are written without `manage_rooms`,
  or with `manage_rounds`, `create_application` or `reverse_application_state` added
- **THEN** the database refuses the write (until the contract step the set is exact from above
  only: a household row short of its new values is accepted, see the transition scenario)

#### Scenario: A revoked membership keeps nothing
- **WHEN** a revoked membership is written with a stored permission or with the moderator role
- **THEN** the database refuses the write

#### Scenario: A resident cannot be granted a moderator-only permission
- **WHEN** a live member (not a moderator) is written with `reverse_application_state`,
  `manage_round_participation` or `manage_rounds`, by direct SQL
- **THEN** the database refuses the write (and, from the contract step on, the same for
  `create_application` and `change_application_state`)

#### Scenario: Only a resident membership can hold the vote
- **WHEN** the household account, or a moderator without a resident profile, is written with
  `vote` by direct SQL
- **THEN** the database refuses the write

#### Scenario: A moderator cannot be granted a household-only permission
- **WHEN** a live moderator is written with `issue_password_reset_link`, by direct SQL
- **THEN** the database refuses the write

#### Scenario: A plain member cannot be granted member administration
- **WHEN** a live member (neither administering nor moderator) is written with `manage_join_codes`,
  `create_resident_profile`, `appoint_moderator`, `manage_members` or `export_subject_access`, by
  direct SQL
- **THEN** the database refuses the write (and the same for `manage_voting_procedure`; from the
  contract step on also for `manage_rooms`)

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

