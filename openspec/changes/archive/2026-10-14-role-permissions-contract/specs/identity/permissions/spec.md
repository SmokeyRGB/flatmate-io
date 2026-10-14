# Spec Delta

## MODIFIED Requirements

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
contract step of its rename removed it from stored memberships; the database refuses storing a
name that is not declared. Actions not yet built get their permission when
they are built, as a new row.

**The model is built to change.** Permissions are expected to be added, moved between roles, split,
renamed and retired as the product grows. Each of these SHALL be a change to the one declaration
(the permission rows with their holders, the role sets, and, only between a rename's expand and
contract migrations, a record of replaced names with what replaced them) plus one migration that carries the stored memberships along — never a change to
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

### Requirement: A membership that contradicts its roles cannot exist

The database SHALL refuse, for every writer and including direct SQL under the application role,
any membership row that:
- is live and lacks a permission of a set its roles give it (moderator, household, resident);
- is the administering membership and holds a permission outside the household set (the matrix
  gives the household account no ⬜ at all);
- is revoked and still holds a permission or the moderator role;
- holds a permission that is not declared, a retired name such as `close_round` or
  `manage_settings` included;
- holds a permission whose declared holders exclude its role: a moderator-only permission
  (`manage_rounds`, `manage_round_participation`, `create_application`, `change_application_state`,
  `reverse_application_state`) on a row that is not a moderator; a household-only permission
  (`issue_password_reset_link`) on a row that is not the administering membership; a
  household-or-moderator permission (`manage_voting_procedure`, `manage_rooms`, `manage_join_codes`,
  `create_resident_profile`, `appoint_moderator`, `manage_members`, `export_subject_access`) on a row
  that is neither; a resident-only permission (`vote`) on a row without a resident profile.
  Together: a plain resident row holds the resident set and nothing else.

The constraints SHALL be derived from the one declaration of permissions, holders and sets, so a
move between roles changes the declaration and the constraints together. Every declared
permission SHALL fall under exactly one holder rule the database enforces, so a permission cannot
escape enforcement by being declared with an unforeseen combination of holders.

A moderator missing its rights, a moved-out person keeping one, or a resident holding a role-bound
right is therefore a refused write, not a state the application has to cope with. Sources: the
human remark of 2026-09-28 (*"if there is a moderator profile that does not have the permissions
that a moderator should have, something has significantly gone wrong before"*); `03-PRD.md` §4.0.1
(✅ = *„immer"*, ❌ = not grantable).

#### Scenario: Removing a permission from a moderator is refused
- **WHEN** a live moderator membership's stored permissions are written without any permission of
  the moderator set (for example `manage_join_codes`, `create_application` or
  `reverse_application_state`), by the application or by direct SQL
- **THEN** the database refuses the write

#### Scenario: Until the contract step, a set missing the new values is accepted but grants nothing new
- **WHEN** a live household row holding only `manage_rooms` and `manage_settings` (what pre-2b code
  registered), or a live moderator holding only the five earlier values, is written by direct SQL
  after the contract step
- **THEN** the database refuses the write: the transition window this scenario described is closed,
  and the sets are exact

#### Scenario: A live resident without the vote is refused
- **WHEN** a live resident membership (a member or a moderator with a resident profile) is written
  without `vote`, by direct SQL
- **THEN** the database refuses the write; a resident loses `vote` only by losing the membership
  (moving out or removal), which clears every permission

#### Scenario: A retired or undeclared permission cannot be stored
- **WHEN** any membership, the household account and a moderator included, is written with
  `close_round`, `manage_settings` or any other name that is not a declared permission, by direct
  SQL
- **THEN** the database refuses the write

#### Scenario: Making someone moderator without the permissions is refused
- **WHEN** a membership's role is set to moderator by direct SQL without adding the permissions
- **THEN** the database refuses the write

#### Scenario: The household set is exact
- **WHEN** the administering membership's stored permissions are written without any of its eight
  permissions, or with `manage_rounds`, `create_application` or `reverse_application_state` added
- **THEN** the database refuses the write

#### Scenario: A revoked membership keeps nothing
- **WHEN** a revoked membership is written with a stored permission or with the moderator role
- **THEN** the database refuses the write

#### Scenario: A resident cannot be granted a moderator-only permission
- **WHEN** a live member (not a moderator) is written with `reverse_application_state`,
  `manage_round_participation`, `manage_rounds`, `create_application` or
  `change_application_state`, by direct SQL
- **THEN** the database refuses the write

#### Scenario: Only a resident membership can hold the vote
- **WHEN** the household account, or a moderator without a resident profile, is written with
  `vote` by direct SQL
- **THEN** the database refuses the write

#### Scenario: A moderator cannot be granted a household-only permission
- **WHEN** a live moderator is written with `issue_password_reset_link`, by direct SQL
- **THEN** the database refuses the write

#### Scenario: A plain member cannot be granted member administration
- **WHEN** a live member (neither administering nor moderator) is written with `manage_join_codes`,
  `create_resident_profile`, `appoint_moderator`, `manage_members`, `export_subject_access`,
  `manage_voting_procedure` or `manage_rooms`, by direct SQL
- **THEN** the database refuses the write

#### Scenario: Existing memberships are brought to the exact sets
- **WHEN** the migration that makes the sets exact runs
- **THEN** every live membership holds every permission of its roles' sets; a moderator that held
  `manage_settings` holds `manage_voting_procedure`; no membership holds `close_round`,
  `manage_settings` or any other undeclared name; no plain member holds anything but `vote`; every
  other stored permission is unchanged; and the migration reports, before it changes anything, how
  many rows each step will touch
