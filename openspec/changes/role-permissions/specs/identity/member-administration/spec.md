## Purpose

Who may administer a household's members — see the resident list and act on it, manage join links,
create a profile, appoint or demote a moderator, issue a reset link, trigger a subject-access
export — decided by stored permissions only, and how the screens learn what to offer. Seeded from
the behaviour F1, F2 and F3 change 2b built.

## ADDED Requirements

### Requirement: Member administration is decided by stored permissions, never by a role

Every identity action and read below SHALL be authorized by a stored permission of the caller's own
live membership, and SHALL NOT read the caller's role. Each permission SHALL sit in the role sets
the Rechtematrix (`03-PRD.md` §4.0.1, as amended by this change) gives the action with ✅:

| Action or read | Permission | Held by |
|---|---|---|
| create a resident profile | `create_resident_profile` | household, moderator |
| appoint a moderator or set one back to member | `appoint_moderator` | household, moderator |
| mark moved out, remove, reactivate a member; change a prepared profile's status | `manage_members` | household, moderator |
| issue, extend, delete and list join links | `manage_join_codes` | household, moderator |
| see the resident list | any of the four above | household, moderator |
| trigger a subject-access export | `export_subject_access` | household, moderator |
| issue a password-reset link, and read issued reset links back | `issue_password_reset_link` | household |
| see and change the voting procedure (the settings screen as built today) | `manage_voting_procedure` | household |

Creating a profile and appointing or demoting a moderator belong to the moderator as well, because
both are part of running a casting: a profile is created for a newcomer to claim through a personal
join link, and appointing further moderators shares the organising load (human decision,
2026-10-01). The password-reset link and the voting procedure stay with the household account.
Casting-round actions are not member administration; they are the moderator's through
`manage_rounds`, `manage_round_participation`, `create_application` and the other round
permissions (`identity/permissions`). Each action has its own permission, one per matrix row, so a
later decision can move any one of them to another role alone.

A refusal SHALL be the same denial for every one of them, whatever the caller's role. Sources:
`03-PRD.md` §4.0.1 (rows *„Beitrittscode erzeugen / löschen"*, *„`ResidentProfile` anlegen"*,
*„Moderator ernennen / zurückstufen"*, *„Mitglied entfernen / auf `moved_out` setzen"*,
*„Datenauskunft erzeugen"*, *„Household anlegen / Einstellungen ändern"*; Wechsel row
*„Reaktivierung durch Haushalts-Account oder Moderator"*); FR-1.3, FR-1.27 (*"fully available to
administration and to a profile with moderator rights"*), EC-1.7; `domain/identity.md` §2.1 (O-16
box, permission list); the human decisions of 2026-09-28/29 and 2026-10-01.

#### Scenario: The household account and a moderator administer members alike
- **WHEN** the household account or a moderator creates a resident profile, appoints or demotes a
  moderator, marks a member moved out, removes or reactivates one, or issues, extends, deletes or
  lists a join link
- **THEN** it succeeds for both

#### Scenario: A plain resident is refused every member-administration action
- **WHEN** a resident who is neither the household account nor a moderator attempts any action or
  read in the table
- **THEN** it is refused with the denial, and nothing is written

#### Scenario: A moderator is refused the household-only actions
- **WHEN** a moderator issues a password-reset link or opens the voting-procedure settings
- **THEN** each is refused with the denial, and nothing is written

#### Scenario: A moderator may trigger a subject-access export
- **WHEN** a moderator triggers a subject-access export
- **THEN** it is accepted, as for the household account (the matrix gives both ✅)

#### Scenario: The administering membership is never a role-change target
- **WHEN** the household account or a moderator tries to appoint or demote the household account's
  own membership
- **THEN** it is refused, and its role and permissions are unchanged

#### Scenario: A grant is honoured whatever the role
- **WHEN** a moderator is individually granted `manage_voting_procedure` (the matrix's ⬜ for the
  moderator) and opens the voting-procedure settings
- **THEN** the settings are shown, although the caller is not the household account

#### Scenario: A resident's casting participation confers no administration
- **WHEN** a plain resident who takes part in an open round attempts any action or read in the
  table
- **THEN** each is refused with the denial

### Requirement: Losing a right takes effect at once, on every route

When a membership loses a permission — a moderator set back to member, a member marked moved out or
removed — every action and every screen SHALL treat it as lost from the moment the change commits:
the next action is refused, and reloading the organisation area, the members screen or any other
organisation route shows the access message or no longer offers the item, without a new sign-in. An
identity mutator SHALL check its permission inside the transaction that performs its write, against
the caller's live membership read under a lock that conflicts with every membership writer, so a
demotion, move-out or removal of the caller committed before the action's check is seen, and one in
flight is waited for. Source: V-3 (*„sofortiger Zugriffsentzug"*, `domain/invarianten.md` §5.3);
`identity/permissions` "A revoked membership grants nothing".

#### Scenario: Demotion refuses the next action
- **WHEN** a moderator is set back to member and then attempts to mark someone moved out
- **THEN** it is refused

#### Scenario: Demotion takes the organisation screens away on reload
- **WHEN** a moderator who has the members screen or the organisation area open is set back to
  member, holds no other organisation permission, and reloads either page or opens any other page
  of the organisation area
- **THEN** each shows the access message with the way back to Start, renders no organisation
  control, and the navigation and Start no longer offer the organisation item

#### Scenario: A demotion committed first refuses an action already under way
- **WHEN** the demotion of a moderator commits while that moderator's removal of another member is
  waiting to check its permission
- **THEN** the removal is refused and the other member is unchanged

### Requirement: The organisation area is reached only with an organisation permission

Every page of the organisation area (the organisation overview, rooms, creating a round, a round's
applications, members, the voting-procedure settings) SHALL check, on every request, that the caller's live
membership holds at least one permission outside the resident set, and SHALL otherwise render the
access message with the way back to Start and no organisation content. The overview's links SHALL
be offered by permission: rooms with `manage_rooms`, members with any member-administration
permission, the voting-procedure settings with `manage_voting_procedure`, opening a round with `manage_rounds`. The same test decides whether the navigation
and Start offer the organisation item, so a page and the item leading to it cannot disagree. Each
page keeps the narrower check its own reads and actions already make. Sources: U-21 (*„sichtbare
Abschnitte richten sich ausschließlich nach `Membership.role`/`Membership.permissions`"*), V-3, the
human decision of 2026-10-01 (access is revoked on reload).

#### Scenario: A plain resident does not reach the organisation area by URL
- **WHEN** a resident holding no permission outside the resident set opens the organisation
  overview, the rooms page or a round page by typing its address
- **THEN** the page shows the access message with the way back to Start, and no organisation content

#### Scenario: The overview offers only what the caller may do
- **WHEN** a moderator opens the organisation overview
- **THEN** it offers rooms, members and opening a round, and not the voting-procedure settings; the
  household account is offered rooms, members and settings, and not opening a round

### Requirement: Screens offer what the caller's permissions allow

The resident list SHALL return, beside its rows, one flag per permission-gated control the members
screen offers (create a profile, appoint, manage members, manage join links, issue a reset link), each derived from the caller's stored
permissions. The members screen SHALL decide what to show from those flags only, and the
navigation SHALL show the members list exactly to holders of a member-administration permission. A screen MAY still
read a listed member's role to describe that member (the moderator badge, whether the toggle
appoints or sets back), since that describes the row, not the caller's rights. With no resident yet,
the screen SHALL lead with the join-link action (AC-1.22). Sources: FR-1.27, AC-1.22, EC-1.7, U-21
(*„sichtbare Abschnitte richten sich ausschließlich nach `Membership.role`/`Membership.permissions`"*),
`screens/O-organisation.md` O16.

#### Scenario: The household account sees every control
- **WHEN** the household account opens the members screen
- **THEN** it is offered the profile form, the appoint and set-back toggle, the reset-link action
  where eligible, the move-out, reactivate and remove actions, and the join links

#### Scenario: A moderator sees every control except the reset link
- **WHEN** a moderator opens the members screen
- **THEN** it is offered the profile form, the appoint and set-back toggle, the move-out,
  reactivate and remove actions and the join links, and no reset-link action

#### Scenario: A plain resident does not reach the list
- **WHEN** a resident without any member-administration permission opens the members screen, or looks at the navigation
- **THEN** the screen shows the access message and the navigation offers no members item

### Requirement: Reset links are read back only by those who may issue them

The list of a household's links SHALL include reset-purpose links only for a caller holding
`issue_password_reset_link`. Every other holder of `manage_join_codes` SHALL see the household's other
links and none of its reset links, since a reset link's code lets whoever reads it take over the
named profile. Sources: O-16 (`domain/identity.md` §2.1), `identity/password-reset`.

#### Scenario: A moderator does not see reset links
- **WHEN** the household account has issued a reset link and a moderator lists the household's links
- **THEN** the reset link is absent from the moderator's list and present in the household
  account's

### Requirement: A role comparison outside a named state read fails the build

The build gate SHALL fail when application source compares a role outside a marked state read —
one that describes a member rather than authorizing the caller — or outside the database
constraints that pair roles with their permission sets. Each state read SHALL carry its reason
beside it. Source: the human decision of 2026-10-01 (*a critical error, not a code smell*);
`audit/technical-debt.md` finding #1, item 6.

#### Scenario: A new role check is caught
- **WHEN** a change adds a comparison of the caller's role to authorize an action
- **THEN** the build gate fails and names the file and line

#### Scenario: A marked state read passes
- **WHEN** a comparison of a listed member's role carries the state-read marker and a reason
- **THEN** the build gate passes it
