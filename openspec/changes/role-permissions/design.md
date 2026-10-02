## Context

See proposal.md (Why). The inventory this design works from is `audit/technical-debt.md`, finding
#1 and its appendix, re-checked against `main` at `053c2b8` (2026-10-01):

- **Two central gates** in `src/modules/identity/repository.ts`:
  - `assertIsAdministrationOrModerator` (private) serves `transitionResidentProfileStatus`,
    `removeMember`, `setMovedOut`, `reactivateMember`, `issueJoinCode`, `extendJoinCode`,
    `deleteJoinCode` and `listJoinCodeIssuances`.
  - `assertIsAdministration` (exported) serves `createResidentProfile`, `issuePasswordResetLink`,
    `setMemberRole`, `triggerSubjectAccessExport` and `settings/page.tsx`.
- **Inline role reads:**
  - `getNavigationAccess`, in both flags;
  - `getResidentList`, which also lacks the session-account check;
  - the reset-row filter in `listJoinCodeIssuances`;
  - `setMemberRole`'s target check;
  - the members page's `isAdmin` / `m.role` branches.
- **Two denial classes:** `ResidentListActionDeniedError` and `PermissionDeniedError`.
- **The permission machinery from change 2 / 3:**
  - `membershipHoldsPermission`, `assertHasPermission`;
  - the in-transaction `assertHoldsAnyPermissionTx` / `assertHoldsAllPermissionsTx`, which read
    the caller's live membership `FOR SHARE`;
  - the constants in `identity/schema.ts`, with the CHECKs built from them;
  - `drizzle/0024` and `drizzle/0027` as the migration pattern.
- **Clean already:** casting, every RLS policy and every `SECURITY DEFINER` function read no role.
  `auth.ts` reads `is_resident` only to decide the account type (ADR-013). Those reads stay (proposal
  Assumption 4).
- **Shared dev database:** `flatmate-io-dev` is at `0028`, F4's `vote` from the unmerged
  `feat/screening-pass`. `main`'s journal ends at `0027`.
- **F4 change 1 (`screening-pass`) built voting** on its branch: `deliberation/repository.ts`
  `castVote`, `getScreeningPass`, `getAwaitingVoteCounts`, and the `vote_guard` trigger of `0028`
  (round open, active participation with `can_vote`, active profile, not one's own application).
  `castVote` authorizes the voter with identity's `assertAccountCanVote`, which reads
  `membership.is_resident` directly; the reads authorize by participation only.
- **Sequencing (D11):** this change is applied after F4 change 1 has merged to `main`, so it
  converts the vote gates too and its migration follows `0028` in the journal.

## Goals / Non-Goals

**Goals:**
- No identity authorization or visibility decision reads the caller's role. The lint keeps it that
  way.
- Each converted mutator checks inside its write transaction (V-3), which closes the gap change 2's
  design left open for "the older mutators" (`application-capture` design, Risks).
- The database refuses a role-bound permission outside its roles, as 0027 does for the
  moderator-only one.

**Non-Goals:**
- The lower bounds of the household and moderator CHECKs on the new values. They come with the
  contract migration in a follow-up change, after every open branch has rebased (D2).
- Voting eligibility (`is_resident`) and `auth.ts`'s account-type checks.
- `manage_rooms` grantability to plain residents until the contract migration. The matrix says ❌, the model
  allows it today; this goes to the register (task group 8), not into this change.
- A grant screen. Nobody grants individually in v0.1 (`identity/permissions`).
- Casting's caller-supplied `Actor` and its outside-the-transaction checks (audit #5, Cursor WP04).
- The error→message mapping in server actions (audit #10/#16, WP08).
- `Application` deletion (change 4 builds `delete_application` as a moderator-only permission on
  this pattern).

## Decisions

### D1 — One permission per matrix row, for every action that is built

The human asked for the role → permission assignment to stay debatable (2026-10-01). A permission
that bundles two matrix rows makes one of them impossible to move alone without touching a gate.
So the rule is: **one permission per row of `03-PRD.md` §4.0.1, for every action the code
builds today**, and none for actions not yet built (YAGNI, and S-04: no bundle the matrix does not
name).

Walking the matrix against the code (`casting/repository.ts`, `identity/repository.ts`, `main`
`053c2b8`):

| Matrix row (amended where marked) | HH | Mod | Res | Permission | Who may hold it | Gates today |
|---|:-:|:-:|:-:|---|---|---|
| Household anlegen | — | — | — | none: registration, before any membership exists | — | `registerHousehold` (unauthenticated) |
| Einstellungen ändern (household-level: name, contact address, privacy page release) | ✅ | ⬜ | ❌ | — not built; gets `manage_household_settings` when it is | — | — |
| Abstimmungsverfahren ändern | ✅ | ⬜ | ❌ | **`manage_voting_procedure`** (renames `manage_settings`) | household, moderator | `getHouseholdSettings`, `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen` | `getHouseholdSettings`, `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen` |
| `Room` anlegen · Verfügbarkeit ändern | ✅ | ✅ | ❌ | `manage_rooms` | household, moderator† | `createRoom`, `renameRoom`, `transitionRoomStatus`, `removeRoom` |
| Beitrittscode erzeugen / löschen | ✅ | ✅ | ❌ | **`manage_join_codes`** (new) | household, moderator | `issueJoinCode`, `extendJoinCode`, `deleteJoinCode`, `listJoinCodeIssuances` |
| `ResidentProfile` anlegen **(amended: Mod ✅)** | ✅ | ✅ | ❌ | **`create_resident_profile`** (new) | household, moderator | `createResidentProfile` |
| Moderator ernennen / zurückstufen **(amended, split from „Berechtigung vergeben")** | ✅ | ✅ | ❌ | **`appoint_moderator`** (new) | household, moderator | `setMemberRole` |
| Berechtigung einzeln vergeben **(split, unchanged)** | ✅ | ❌ | ❌ | — not built, no permission | — | — |
| Mitglied entfernen / auf `moved_out` setzen (+ Reaktivierung, Wechsel-Tabelle) | ✅ | ✅ | ❌ | **`manage_members`** (new) | household, moderator | `removeMember`, `setMovedOut`, `reactivateMember`, `transitionResidentProfileStatus` |
| `CastingRound` anlegen / schließen / wiedereröffnen **(amended: Res ⬜ → ❌)** | ❌ | ✅ | ❌ | **`manage_rounds`** (renames `close_round`) | moderator | `createRound`, `openRound`, `createAndOpenRound`, `listOrganisationTasks`; the future close/reopen/archive |
| `RoundParticipation` hinzufügen / entfernen | ❌ | ✅ | ❌ | **`manage_round_participation`** (new) | moderator | `addResidentToRound` |
| `Application` anlegen **(amended: Res ⬜ → ❌)** | ❌ | ✅ | ❌ | `create_application` | moderator† | `captureApplication`, `updateApplication` |
| `Application.status` ändern (vorwärts) **(amended: Res ⬜ → ❌)** | ❌ | ✅ | ❌ | `change_application_state` | moderator† | `transitionApplication`, the forward `TRANSITION_RULES` |
| `Application.status` zurücknehmen | ❌ | ✅ | ❌ | `reverse_application_state` | moderator | the backward `TRANSITION_RULES` |
| Datenauskunft erzeugen | ✅ | ✅ | ❌ | **`export_subject_access`** (new) | household, moderator | `triggerSubjectAccessExport` |
| — (O-16 box, `domain/identity.md` §2.1) | ✅ | ❌ | ❌ | **`issue_password_reset_link`** (new) | household | `issuePasswordResetLink`, the reset-row filter |
| `Vote` abgeben / ändern | ❌ | ✅ if `is_resident` | ✅ | **`vote`** (new, the resident set's first) | a resident membership (`is_resident`) | `assertAccountCanVote` (identity), and through it `castVote`; `getScreeningPass`, `getAwaitingVoteCounts` (deliberation, F4) |

**Residents only vote and take part (human decision, 2026-10-01).** Organising a casting —
rounds, participants, applications — is moderation and is reached only from the organisation area.
So no permission is holdable by a plain resident: every ⬜ in the matrix's resident column becomes
❌ (*„CastingRound anlegen / schließen / wiedereröffnen"*, *„Application anlegen"*,
*„Application.status ändern"*, and the unbuilt *„Fremde AvailabilityWindow pflegen"* and
*„Appointment bestätigen"*). The only ⬜ left is the moderator's (settings, voting procedure,
correcting attendance). This amends SRD **S-04** (precedence 2), `03-PRD.md` §4.0.1 and its AC
*„Eine Berechtigung … ist einzeln vergebbar, ohne dass das Profil Moderator wird"*, and FR-1.8 (D8),
with the decision recorded. Consequence for the model: a plain resident row holds the resident set
and nothing else, which the holder CHECKs enforce.

† Enforced from the contract step on. Old-code tests on other branches still grant
`manage_rooms`, `create_application` and `change_application_state` to plain members on the
shared dev database (`navigation-access`, `organisation-tasks`, `application-capture` 6.5). The
table declares the final holders; these three entries carry `checkFrom: "contract"`, which the CHECK
derivation skips until the contract change deletes the field (D2).

**`vote` is the resident set.** *„Moderator ✅ (wenn `is_resident`)"* is exactly what the resident set
already means: a moderator with a resident profile holds both sets, a moderator without one and the
household account hold neither. So voting stays orthogonal to moderating (S-04, E-04) without a role
or attribute check in the gate: `assertAccountCanVote` keeps its name and `HouseholdAccountCannotVoteError`
(FR-1.7/AC-1.5, its tests), and checks the stored `vote` instead of `is_resident`. The `vote_guard`
trigger keeps the per-round rule (participation with `can_vote`, open round, active profile); that is
eligibility for one round, not a right, and `can_vote` stays the freeze point the spec carries.

**Reads** derive from the same permissions; they get no permission of their own:
- the resident list and the members item in the navigation: any of `manage_members`,
  `manage_join_codes`, `create_resident_profile`, `appoint_moderator` (an `assertHoldsAny`);
- the organisation applications reads: any of `create_application`, `change_application_state`
  (unchanged);
- the organisation area (D9): any permission outside the resident set (so `vote` alone never opens it);
- the screening pass and the awaiting-vote counts: `vote`, plus the participation they already read.

So if a later decision takes every member-administration right from the moderator, the list goes
with them; no read needs editing.

**Why rename `manage_settings` → `manage_voting_procedure`** (human, 2026-10-02: „too broad"). Every
setting that exists is a voting-procedure setting (`household_settings`: scale weights, favourite
budget factor, hide results until voted, quorum share; snapshotted into a round when it opens), and
the matrix gives the procedure its own row. *„Household anlegen"* is registration and needs no
permission. Household-level settings (name, contact address, privacy page release, G-C9) are a
different matrix half and a different future permission. A broad name would make the voting
procedure impossible to move to the moderator without also moving those. Old-code tests grant
`manage_settings` to plain members, but the new name is new, so its holder rule is enforced at once.

**Why rename `close_round` → `manage_rounds`.** It gates creating and opening (closing is not
built), and the matrix row is *„anlegen / schließen / wiedereröffnen"*. Keeping a name that says the
opposite of what the gate does is the kind of trap the debate would trip over. Rejected:
- keep the name and redefine it in the docs: cheaper, but every reader of a gate would be misled;
- split into `create_round` / `close_round`: the matrix gives them one row with one column set.

The rename runs expand/contract like the CHECKs (D2, D3): `close_round` stays on existing rows
(old-code branches still check it) and is **retired**: no set contains it, no `src/` code may
name it (task 1.5), and the contract migration strips it.

**Why `manage_round_participation` is new.** It is its own matrix row
(*„RoundParticipation hinzufügen / entfernen"*), so under the one-permission-per-row rule it can be
debated apart from round management (e.g. letting the household account add a late joiner without
running rounds). No behaviour changes: both are moderator-only.

**Not built, so no permission yet** (each arrives with its feature, as a row of this table plus a
migration): *„Room-Status als Folge einer Bewerbung"*, *„`Application` löschen"* (change 4:
`delete_application`, moderator), *„Veto"* (a later F4/F5 slice; `vote` is built and is
in the table), *„CastingNote"*, both *„AvailabilityWindow"* rows, *„Slot"*, *„Auf Slot
reagieren"*, *„Appointment bestätigen"* (`confirm_appointment`), *„Anwesenheit korrigieren"*,
*„Aufbewahrung"* (`extend_retention`, `delete_data`), *„Berechtigung einzeln vergeben"*.

**Moderator creates profiles and appoints/demotes (human decision, 2026-10-01).** The matrix gives
the moderator ❌ on both rows today. `03-PRD.md` is precedence 3, so `openspec/` may not redefine
it silently; this change amends it (D8), with the decision recorded. A moderator may demote other
moderators and itself; the household account can always create a profile and appoint again
(EC-1.7). The administering membership is never a target (D6).

**Why `export_subject_access` reaches the moderator** (proposal Assumption 2): the matrix gives ✅.
The stub returns a handle and shows nothing, so it delivers less than either variant promises.

**Rejected: keep role checks for the household-only action**, since "only one membership can hold
it anyway". The human excluded every role check, the household account's included.

### D2 — One declarative table; CHECKs derived from it; expand now, contract later

`src/modules/identity/schema.ts` holds **one table** and derives everything else from it:

```ts
export const PERMISSIONS = {
  manage_voting_procedure:    { holders: ["household_admin", "moderator"] },
  manage_rooms:               { holders: ["household_admin", "moderator"], checkFrom: "contract" },
  manage_join_codes:          { holders: ["household_admin", "moderator"] },
  create_resident_profile:    { holders: ["household_admin", "moderator"] },
  appoint_moderator:          { holders: ["household_admin", "moderator"] },
  manage_members:             { holders: ["household_admin", "moderator"] },
  export_subject_access:      { holders: ["household_admin", "moderator"] },
  issue_password_reset_link:  { holders: ["household_admin"] },
  manage_rounds:              { holders: ["moderator"] },
  manage_round_participation: { holders: ["moderator"] },
  create_application:         { holders: ["moderator"], checkFrom: "contract" },
  change_application_state:   { holders: ["moderator"], checkFrom: "contract" },
  reverse_application_state:  { holders: ["moderator"] },
  vote:                       { holders: ["resident"] },               // "resident" = is_resident
} as const;                    // each entry carries a comment naming its matrix row

export const ROLE_SETS = {
  household: ["manage_voting_procedure", "manage_rooms", "manage_join_codes", "create_resident_profile",
              "appoint_moderator", "manage_members", "export_subject_access", "issue_password_reset_link"],
  moderator: ["manage_rooms", "manage_join_codes", "create_resident_profile", "appoint_moderator",
              "manage_members", "export_subject_access", "manage_rounds", "manage_round_participation",
              "create_application", "change_application_state", "reverse_application_state"],
  resident:  ["vote"],
} satisfies Record<string, readonly PermissionName[]>;

// Replaced names: a rename has one target, a split several. The migration that introduces an entry
// carries each holder over to every target its role may hold; the contract migration strips the
// old name and deletes the entry. No check may name a key (task 1.5).
export const REPLACED_PERMISSIONS = {
  close_round:     ["manage_rounds"],
  manage_settings: ["manage_voting_procedure"],
} as const satisfies Record<string, readonly PermissionName[]>;
export const RETIRED_PERMISSIONS = Object.keys(REPLACED_PERMISSIONS);
```

`HOUSEHOLD_PERMISSIONS`, `MODERATOR_PERMISSIONS` and `RESIDENT_PERMISSIONS` stay as exported names
(`= ROLE_SETS.household` …), so writers and casting need no new import. `MODERATOR_ONLY_PERMISSIONS`
becomes derived (holders = moderator). `permissionsHeldOnlyBy(roles)` groups the table by `holders`,
skipping entries with `checkFrom`; each group gets one CHECK. There is no "anyone" group any more:
every permission is held by the household account, a moderator, or both.

- `membership_moderator_only_permissions` (existing name): `role = 'moderator' OR NOT (permissions
  && [reverse_application_state, manage_rounds, manage_round_participation])` (the contract migration adds
  `create_application`, `change_application_state`);
- `membership_household_only_permissions`: `role = 'household_admin' OR NOT (permissions &&
  [issue_password_reset_link])`;
- `membership_resident_only_permissions`: `is_resident OR NOT (permissions && [vote])`. The holder
  `"resident"` maps to the `is_resident` column, not to a role value;
- `membership_administration_permissions`: `role IN ('household_admin', 'moderator') OR NOT
  (permissions && [manage_join_codes, create_resident_profile, appoint_moderator, manage_members,
  export_subject_access, manage_voting_procedure])` (the contract migration adds `manage_rooms`).

From the contract migration on these three amount to „a plain resident holds only the resident set"; the contract migration may add that
as one more CHECK (`role IN ('household_admin','moderator') OR permissions <@ RESIDENT_PERMISSIONS`)
so a future permission cannot slip through by being left out of every group.

A type-level check (`satisfies`) refuses a role set naming a permission the table lacks, and a unit
test refuses a set entry whose `holders` exclude that role (a moderator set entry held only by the
household would be a CHECK contradiction).

**Why a table now** (the earlier draft rejected one as "an abstraction for three short lists"): the
human made the assignment a standing subject of debate, and there are now five holder groups and
three sets over fourteen permissions. One table is the single place a move is made; the separate
lists were three places that had to agree.

**Expand/contract** (human instruction, 2026-10-01), because `flatmate-io-dev` is shared with
branches that run the old code (F4's `feat/screening-pass`, the Cursor WPs). Old code writes the
household set `{manage_rooms, manage_settings}` and the moderator set `{manage_rooms, close_round,
create_application, change_application_state, reverse_application_state}`, and checks
`close_round`.

| Constraint | 0029 (this change) | contract migration (`role-permissions-contract`) | Why not tighter in 0029 |
|---|---|---|---|
| household set | `@> old ∩ new` (= `manage_rooms`) `AND <@ new ∪ old` (= new eight + retired `manage_settings`) | exact: `@> new AND <@ new` | old registration writes `manage_rooms`, `manage_settings` |
| moderator set | `@> old ∩ new` (= `manage_rooms`, `create_application`, `change_application_state`, `reverse_application_state`) | `@> new` | old appointment writes `close_round`, not `manage_rounds`; new appointment writes no `close_round` |
| moderator-only | + `manage_rounds`, `manage_round_participation` | + `create_application`, `change_application_state` | old tests grant those two to plain members |
| household-only | new | same | — (old code never writes it) |
| resident set (`membership_resident_holds_role_permissions`) | `@> old ∩ new` (= `{}`, unchanged) | `@> [vote]` | old claim/join stores the empty resident set |
| resident-only | new (`vote`) | same | — (old code never writes `vote`) |
| administration | new, six values (incl. `manage_voting_procedure`) | + `manage_rooms` | old tests grant `manage_rooms` to members |
| plain resident ⊆ resident set | — | new (optional, see above) | follows from the rows above |
| retired `close_round`, `manage_settings` | kept on rows, retired in code | stripped from every row | old code checks them |
| organising permissions on plain residents | left as they are | stripped (counted and reported first) | old tests write them |

`HOUSEHOLD_FLOOR_UNTIL_CONTRACT` and `MODERATOR_FLOOR_UNTIL_CONTRACT` are exported, computed as the
intersections above from a frozen copy of the old sets (`…_AT_0024` / `…_AT_0027`), commented
"deleted by the contract migration". No permission check reads them.

**The one refusal old code can meet after 0029:** an old-code demotion of a moderator that 0029
backfilled removes only the old five, leaving administration, participation and `manage_rounds`
values on a member row. The administration and moderator-only CHECKs refuse it loudly; without them
the member would silently keep `manage_members`, which this change's code honours. Only pre-existing
moderators are affected (Demo-WG Alex), never an old-code test path, which creates its moderators
with the old five.

**Demotion in this change** sets the row to exactly the resident set (`vote` for a resident, `{}`
otherwise). Under the new rule a member holds nothing else, so this is simpler than a set
difference and also clears an individually granted `manage_voting_procedure` and any retired name —
a difference would leave the grant behind and the administration CHECK would refuse the demotion
(pre-mortem M5). The target is read `FOR UPDATE` and the UPDATE filters `revoked_at IS NULL`, so a
move-out that commits first is not overwritten with `vote` (L17).

**Household ceiling during the transition** includes the retired `manage_settings`: every backfilled
household row and every old-code registration carry it (pre-mortem H1). Constant
`HOUSEHOLD_CEILING_UNTIL_CONTRACT` = the eight ∪ (`RETIRED_PERMISSIONS` ∩ the old household set).

### D3 — Migration `0029_role_permissions.sql` (expand), statement order

Re-runnable, in one transaction (as 0024/0027). Argued against the constraints live at each
statement:

1. `LOCK TABLE membership IN SHARE ROW EXCLUSIVE MODE`.
2. **Precondition** (`DO` block, `RAISE EXCEPTION`): no row outside each holder group holds one of
   that group's new values (`manage_rounds`, `manage_round_participation`,
   `issue_password_reset_link`, the six administration values, `vote` on a row without
   `is_resident`). None can today; they are never
   silently stripped.
3. `DROP CONSTRAINT IF EXISTS` the household CHECK and the moderator-only CHECK. The household CHECK
   (`<@ old two`) would refuse step 4; the moderator-only CHECK is re-added wider in step 8.
4. **Household backfill:** sorted DISTINCT union with the eight, `WHERE revoked_at IS NULL AND role =
   'household_admin' AND NOT (permissions @> new)`. Live at this statement: the moderator CHECK
   (does not apply), `admin_has_no_profile`, `revoked_holds_nothing` (live rows only).
5. **Rename backfills**, one statement per `REPLACED_PERMISSIONS` entry, each limited to the roles
   the target's `holders` allow: `close_round` → `manage_rounds` for live moderators;
   `manage_settings` → `manage_voting_procedure` for live household rows (already covered by step 4)
   and live moderators individually granted it. A plain member holding an old name (only test data
   on dev) carries nothing over, since residents hold no organising permission; the contract
   migration strips the old names. The old names stay on every row for now.
6. **Moderator backfill:** union with the five administration values other than
   `manage_voting_procedure` (that one comes from step 5 only for moderators granted
   `manage_settings`) and
   `manage_round_participation`, `WHERE revoked_at IS NULL AND role = 'moderator' AND NOT …`. The
   moderator CHECK (`@>` old five) is live; a union keeps the five.
6a. **Resident backfill:** union with `vote` `WHERE revoked_at IS NULL AND is_resident AND NOT
   permissions @> ARRAY['vote']`. Live at this statement: the resident CHECK (`@> {}`) and the
   moderator CHECK (unchanged by a union); `admin_has_no_profile` guarantees no household row is
   `is_resident`, so the household ceiling is never touched.
7. `DROP` + `ADD` the moderator CHECK at the floor (four values): a relaxation, valid on every row.
8. `ADD` the household CHECK (floor = old ∩ new = `{manage_rooms}`, ceiling = the eight + retired
   `manage_settings`), the widened moderator-only CHECK, and
   (`DROP IF EXISTS` first) the household-only, administration and resident-only CHECKs. Valid by step 2 plus the
   backfills, which add each value only to rows its group allows (`manage_rounds` to moderators
   only, step 5).

**Re-run:** every backfill is `WHERE NOT @>`; every constraint is dropped `IF EXISTS` before it is
added; the precondition passes on a migrated table.

**Old code after 0029:** registration (two values) passes floor and ceiling; appointment (old five)
passes the four-value floor; demotion of a fresh old-code moderator leaves nothing role-bound;
revocation writes `[]`; reactivation the empty resident set; `close_round` checks still pass on
old-code rows. The only refusal is D2's backfilled-moderator demotion.

**Numbering:** with F4 change 1 merged first (D11), `npx drizzle-kit generate --name
role_permissions` writes `0029_*` directly after `0028_vote` and the journal needs no hand edit. If
the human decides otherwise, the fallback is in tasks group 0.
- The contract migration is **not** in this change; it is its own small change (tasks group 11).

### D4 — Every gate checks inside its own transaction

Each mutator in D1's table drops its pre-transaction `assert*` call. It calls
`assertHasPermissionTx(tx, context, …)` as the first statement inside its existing
`withSessionContext`, which reads the caller's live membership `FOR SHARE`. The caller-supplied
`actingAccountId` / `actor.accountId` must still equal `context.accountId` (PR #19), refused with
the same denial, before the transaction opens.

**Reads (`getResidentList`, `listJoinCodeIssuances`):**
- They check and compute their flags from **one** locked read of the caller's row through the
  existing `readLiveMembershipTx(tx, context, lock)` (it already returns the row with the same
  predicate; pre-mortem L15). The rule still lives in `membershipHoldsPermission` alone.
- `lock: true` for both reads, because they return personal data and codes. This follows change 2's
  precedent for `getOrganisationApplication`.
- No new helper: calling `assertHasPermissionTx` four times would re-read the same row (change 3's
  code-review finding), and `readLiveMembershipTx` already returns what the flags need.

**Voting:** `assertAccountCanVote` becomes `assertAccountCanVoteTx(tx, context)`, called by `castVote`
inside its insert transaction; the non-`Tx` export is deleted, and the FR-1.7 test moves onto
`castVote`, the real path (pre-mortem M7).

**Lock order** (pre-mortem M9): every in-transaction check takes S(caller membership) first. The
revocation paths (`setMovedOut`, `removeMember`) therefore lock the **target membership** `FOR UPDATE`
before updating the target profile; otherwise a vote by that target (S membership → trigger's S
profile) and its move-out (X profile → X membership) could deadlock. One order everywhere:
membership, then profile, then round / participation.

**Unlocked reads:** `getNavigationAccess` and `getHouseholdSettings` stay unlocked reads through
`getMembershipForAccount`. They return navigation booleans and the settings that the holder may
edit anyway. The settings check moves from the page into `getHouseholdSettings` itself:
authorization lives in the repository function, not in the route that calls it today (hazards,
"A sibling entry").

**Rejected: keep the checks before the transaction**, as change 2 left them. Each conversion
touches these lines anyway, and the window is the same race change 2 closed for capture: a
demoted moderator's request already in flight.

### D5 — One denial class

`ResidentListActionDeniedError` is deleted. Every refusal is a `PermissionDeniedError` naming the
missing permission, including the null-actor and the account-mismatch refusals. Callers that
caught the old class change:
- `settings/page.tsx`;
- the tests listed in tasks.md.

The members page already catches `PermissionDeniedError`.

### D6 — Capability flags

`getResidentList` returns `{ members, canManageMembers, canManageJoinCodes, canCreateProfile, canAppointModerator, canIssueResetLink, leadWithJoinCode }`, one flag per permission the members screen gates on:
- each flag is `membershipHoldsPermission(row, …)` on the same locked row;
- a list is returned when any of the four member-administration flags is true (D1, Reads);
- `leadWithJoinCode = canManageJoinCodes && members.length === 0`. A moderator always sees at
  least their own profile, so "no resident yet" needs no role.

`getNavigationAccess` returns:
- `membersList` = holds any of the four member-administration permissions;
- `organisation = holds any key of PERMISSIONS outside RESIDENT_PERMISSIONS` (retired names and
  unknown strings never count; pre-mortem L16). The role terms were redundant
  since change 2: both role sets are non-empty beyond the resident set. The same flag now also
  decides the organisation area (D9).

**Members page:** the profile form ← `canCreateProfile`, the role toggle ← `canAppointModerator`,
move-out/reactivate/remove ← `canManageMembers`, the join-link section and the per-profile
invitation ← `canManageJoinCodes`, the reset-link controls ← `canIssueResetLink`. The **toggle direction** and the **moderator badge** read the listed member's `role`,
as marked state reads (D7). They describe the row, not the caller (spec "Screens offer what the
caller's permissions allow").

**`setMemberRole`'s target check** (`target.role === 'household_admin'` → `CannotChangeAdminRoleError`)
stays a marked state read for a clear refusal. Since 0029 the household-only CHECK would also refuse
turning the administering row into a moderator (it keeps `issue_password_reset_link`), but as a raw
constraint error.

### D7 — `scripts/lint/role-reads.ts`, the ninth script lint

**Scans** `src/**/*.{ts,tsx}` except `src/modules/identity/schema.ts`, which holds the CHECKs. It
flags:
- `\brole\s*(===|!==|==|!=)` and `(===|!==|==|!=)\s*[\w?.]*\.role\b`;
- `\b(eq|ne|inArray|notInArray)\(\s*[\w.]*\.role\b`;
- SQL text `\brole\s*(=|<>|!=|IN\b)\s*['(]`.

These match `m.role ===`, `eq(membership.role, …)` and `role <> 'moderator'`, and they do not match
`toRole` or `fromRole`.

**Exemption:** a match passes only when the same line or the line above carries a marker comment,
`role-state-read: <reason>`, with a non-empty reason. Markers are found on the raw text; matches
are taken after stripping comments, so prose that mentions `role ===` is not flagged.

**Starting exemptions:** the three sites on the members page and `setMemberRole`'s target check.
Role **writes** (`role: "member"`) match none of the patterns.

**Other files:**
- a unit test in `tests/unit/lint/role-reads.test.ts`, on the pattern of the other lint tests;
- the lint joins `npm run verify` after `pending-feedback.ts`;
- `.claude/rules/guardrail-lints.md` and CLAUDE.md change "eight" to "nine".

**Rejected:**
- an eslint rule: the repo's guardrails are hand-written scripts, and this one needs the marker
  convention;
- banning `.role` reads entirely: the badge is legitimate.

### D8 — Docs amendments (German, verbatim style)

**The rename `close_round` → `manage_rounds`** in the living docs: `domain/identity.md` §2.1 (the
list, and the box „`close_round` ist die zweite Rolle-Vorbelegung", which gains „heißt seit
2026-10-01 `manage_rounds`, weil es Anlegen, Öffnen, Schließen und Wiedereröffnen trägt"),
`domain/zustandsmaschinen.md` (the round table's „Recht" column), `screens/rahmenwerk.md`, and the
F1 packet's note. The frozen `04-Domaenenmodell.md` and `07-Screen-Inventar.md` keep the old name
(they are snapshots; Rule 4).

**`domain/identity.md` §2.1:**
- the permission list: `manage_rounds` for `close_round`; add `manage_join_codes`,
  `create_resident_profile`, `appoint_moderator`, `manage_round_participation`,
  `issue_password_reset_link`;
- replace the "Nur im Rechtebündel einer Rolle" line with who may hold which (D2's holder groups);
- in §2.1's `ResidentProfile` passage (the profile the Verwaltung creates), add that a moderator may
  create one too;
- change the O-16 box's `manage_members` to `issue_password_reset_link`;
- add one paragraph recording the 2026-10-01 decision, with the matrix rows it maps;
- leave the „`Application` löschen hängt … an der Rolle" sentence for change 4, which builds
  deletion.

**`03-PRD.md` §4.0.1** (precedence 3, human decision 2026-10-01): the row *„`ResidentProfile`
anlegen (aus Verwaltungskontext)"*: Moderator ❌ → ✅, label „`ResidentProfile` anlegen"; the row
*„Moderator ernennen / Berechtigung vergeben"* split into „Moderator ernennen / zurückstufen"
(✅ ✅ ❌ ❌) and „Berechtigung einzeln vergeben" (✅ ❌ ❌ ❌); a Versionshistorie line. The
Wechsel row „Moderator scheidet aus" and the AC on the last moderator stay true (the household
account still can do both).

**SRD S-04 and the resident column (human decision 2026-10-01, „residents should only vote /
participate in casting"):** `02-SRD.md` §5.3 S-04 *„plus einzeln vergebbare Berechtigungen
(Bewerber anlegen, Status ändern, Runde schließen, Termine bestätigen)"* → individual grants only
to the moderator; §3 line 102 likewise. `03-PRD.md` §4.0.1: every resident ⬜ → ❌; the Dimension
table's „Kann Status ändern / Runde schließen / Termine bestätigen — nur mit (einzeln vergebener)
Berechtigung" → „nein"; the AC *„Eine Berechtigung … ist einzeln vergebbar, ohne dass das Profil
Moderator wird"* struck through with the reason. `domain/identity.md` §2.1: the `permissions` row
„einzeln vergebbar" → „einzeln vergebbar nur an die Moderation (⬜)", and the box sentence „Beide
Rechte bleiben außerdem einzeln vergebbar …" amended.

**`backlog/requirements/F1-requirements.md`:** FR-1.8's „plus individually grantable permissions
(create applicant, change status, close round, confirm appointments)" → „… permissions grantable
individually to a moderator; residents only vote and take part (amended 2026-10-01)". FR-1.3 („the household account **or a moderator**
…") and EC-1.7 (a note that a moderator may now do the same), each with an „Amended 2026-10-01"
marker in the packet's style.

**Other docs:**
- `screens/O-organisation.md` O16: the profile form and the role toggle for the moderator too
  (if the screen spec says Verwaltung only);
- `screens/O-organisation.md` O20 Zugang:
  „Nur mit `manage_voting_procedure` (Haushalts-Account; Moderation nur als einzeln vergebenes Recht, ⬜),
  unabhängig von `acting_profile_id` (§4.2)".
- `docs/review-log.md`:
  - closed: role checks → permissions;
  - open: `manage_rooms`/`manage_voting_procedure` grantable to residents against the matrix's ❌;
  - open: the moderator's export „mit Einsicht" belongs to the real export (G-D6).
- `docs/SPEC-INDEX.md`: check for a row on the rights matrix and permission names, and add one if
  missing.

All German text in tasks.md is written out for the human to approve.

### D9 — The organisation area checks on every request

`/organization` has no area check today, and its members link uses a household-account shortcut
(`profileId === null ||`). The `(org)` layout cannot carry the check: Next.js layouts are not
re-rendered on navigation between sibling pages, so a layout check would not run on a soft
navigation (see `node_modules/next/dist/docs/` on layouts; the applier confirms it there). So:

- one helper, `src/app/(org)/organisation-access.ts`, `requireOrganisationAccess(current)`: reads
  `getNavigationAccess(current.context)` and returns `false` when `organisation` is false;
- every `page.tsx` under `src/app/(org)/` **except `rounds/[id]`** calls it first and renders the
  shared access message (with the back link to Start) when it returns `false`. A page's own narrower
  check (members, settings, rounds/new, the application reads) stays;
- **`rounds/[id]` is exempt** (pre-mortem H3): it is the only screen with the round's participant
  list, which FR-1.19 promises every participating resident (*"All residents taking part in a round
  shall be able to see a list of the round's participants"*), and it is already gated by
  participation (`getRoundForSession`, `getRoundParticipants`) and shows organisation content only
  with the application permissions. Locking it would silently drop a requirement; a demoted
  moderator who still participates keeps seeing that list, which FR-1.19 wants;
- the overview's links: rooms ← `manage_rooms`, members ← the members-list flag, settings ←
  `manage_voting_procedure`; `canOpenRound` ← `manage_rounds`. The `profileId === null` term
  goes;
- `getNavigationAccess` is read per request (`session-data.ts` memoises with React `cache`, which is
  per request), so a committed demotion shows on the next load. Nothing caches it across requests.

This is the permission-based organisation guard change 5 had planned on the moderator role; change
5 inherits it. Rejected: `proxy.ts`/middleware, which would need a database read per request outside
the repository boundary.

### D10 — Role sets stay debatable (human, 2026-10-01)

Household settings (voting procedure and quorum included) stay with the household account for now;
the assignment as a whole stays open to debate. With D1 and D2 a move is:

1. the decision, recorded in `03-PRD.md` §4.0.1;
2. one edit to `ROLE_SETS` (and to `holders` if the move crosses a holder group);
3. one migration on the 0027/0029 shape: lock, backfill or strip, re-add the CHECKs the table
   derives; expand/contract if old code on other branches still writes the old set;
4. `openspec/specs/identity/permissions` updated.

No gate, read, flag, screen or behaviour test changes, because every one names a permission (the
lint, D7) and each permission is one matrix row (D1). Examples the design was checked against:
- *the voting procedure moves to the moderator* (the open debate): add `manage_voting_procedure` to
  `ROLE_SETS.moderator` (it is already holdable by the moderator); the migration backfills live
  moderators. Household-level settings, once built under `manage_household_settings`, are
  unaffected;
- *a permission turns out too broad* (as `manage_settings` did): add the narrower rows, enter the old
  name in `REPLACED_PERMISSIONS` with its targets, switch each gate to its own row; the migration
  carries holders over; the contract migration retires the old name;
- *moderators may no longer appoint*: remove `appoint_moderator` from `ROLE_SETS.moderator`, strip it
  from live moderators, re-add the moderator floor;
- *residents should be able to do X after all* (reversing today's decision for one row): add the
  permission to `ROLE_SETS.resident` and widen its `holders`; the migration backfills residents and
  re-adds the holder CHECK. The gate is untouched.

**Drift guard** (task 1.5): every permission literal passed to an `assert…Permission…` call, a
`membershipHoldsPermission` flag or a `TRANSITION_RULES` `requires` list in `src/` must be a key of
`PERMISSIONS`; a retired name fails; every set entry must be holdable by its role. A gate on a
misspelled or retired permission, which nobody could ever pass, fails the build.

**Removing a permission from a set** strips it from existing memberships in the same migration,
ahead of any CHECK that would refuse it (the 0017 ordering lesson).

The open question goes to the register (task 8.4 d).

### D11 — Sequencing with F4

2b's apply starts after F4 change 1 (`screening-pass`) has merged to `main`, and this branch is
rebased onto that `main` first (tasks group 0). Reasons:
- the vote gates live only on F4's branch; converting them in 2b avoids leaving F4 with a role-like
  `is_resident` check after 2b claims "no role check left";
- the migration follows `0028` naturally;
- F4 is on the pitch path; 2b must not disturb it, and 0029 is applied to dev only right before
  2b's merge (tasks group 9), after the pitch has run from F4's merged `main`.

In 2b, voting changes in three places only: `assertAccountCanVote` checks `vote`; `castVote` checks
`vote` inside its insert transaction (`assertHasPermissionTx`, membership `FOR SHARE`), so a move-out
committed first is seen, which F4's out-of-transaction check could miss; the two deck reads require
`vote` inside their transaction. The `vote_guard` trigger is untouched.

**Status 2026-10-02:** F4 change 1 merged (PR #48, fix #49, `main` `3c929c0`); this branch is on top of
it. The fallback once written here is no longer needed.

### D12 — Future: household-adjustable role sets (not built; human idea, 2026-10-02)

The human may later add a „Rechte" tab in the household settings where a household adjusts, for its
own three roles, the permissions that are a household's own decision rather than a product
decision (Discord-like, roles fixed to household, moderator, resident). Not part of this change.
What this design already gives such a feature, and what it would still have to change:

**Carries over unchanged**
- One permission per matrix row, and every check reads only the stored permission: a tab moves a
  row between roles and no gate notices.
- `holders` already separates the two kinds of decision: it is the **product bound** (who may ever
  hold a permission — e.g. `issue_password_reset_link` never leaves the household, `vote` never
  leaves residents, nothing organising reaches a plain resident). The tab would only choose within
  it, and the holder CHECKs keep enforcing it for every writer.
- Carrying stored memberships along when a set changes is the same operation the migrations do now
  (backfill / strip under a `membership` lock); it would become a repository function instead of a
  migration.

**Would change**
- **Where the sets live.** `ROLE_SETS` would become per-household rows (a `role_permission_set`
  table, defaults = today's constants), written only by that settings function, audited.
- **The set CHECKs.** `membership_household_admin_holds_role_permissions` and
  `membership_moderator_holds_role_permissions` compare against constants; a CHECK cannot read
  another table, so per-household sets need a trigger (or the set CHECKs are dropped and the holder
  CHECKs stay as the only database bound). The holder CHECKs need no change.
- **One writer per state, pairwise:** the tab's update of a role's set and appointment / demotion /
  revocation all write `membership.permissions` and must serialize (role-set row lock, then
  membership locks, in one order).
- **A marker per permission** saying whether it is household-adjustable at all (a field on the
  `PERMISSIONS` entry), so product decisions stay out of the tab.

**Needs a human decision first:** SRD **S-04** excludes `Berechtigungsvorlagen`, i.e. bundles a
household names, assembles or changes (`domain/identity.md` §2.1). A household-editable role set is
exactly that, within fixed role names, so S-04 has to be reopened (its Abgabebedingung) before such a
change is proposed.

## Entry paths (G-C)

| Path to member administration | Enforced where | Test |
|---|---|---|
| Each repository mutator in D1 | `assertHasPermissionTx` inside its transaction, membership `FOR SHARE` | authorization matrix (resident, moderator and household columns) |
| `getResidentList`, `listJoinCodeIssuances` | `readLiveMembershipTx` (locked) + account-mismatch refusal | `resident-list-access`, `join-code-isolation`, new mismatch test |
| `getHouseholdSettings` | `assertHasPermission(manage_voting_procedure)` in the repository | `settings-page-admin-guard` (moderator refused, granted moderator allowed) |
| Navigation and the organisation area | `getNavigationAccess` from permissions, checked by every `(org)` page per request (D9) | `navigation-access`, `organisation-access` |
| Raw SQL as `app_runtime` granting a role-bound value | D2 CHECKs (household-only and administration in 0029; lower bounds in the contract migration) | `membership-role-integrity` raw-SQL cases |
| Casting gates (`manage_rounds`, `manage_round_participation`) | renamed / re-pointed only; still `assertHasPermission` before the transaction, as today (moving them inside is audit #5, Cursor WP04 — which must now use the new names) | `room-round-authorization`, authorization matrix |
| `SECURITY DEFINER` functions | none writes `membership.permissions` or reads a role (re-checked: `drizzle/` grep) | — |
| Voting (`castVote`, deck reads) | stored `vote` checked in the transaction (D11), plus `vote_guard` (participation, round, profile) | `account-cannot-vote`, F4's vote-guard tests, new non-resident-moderator case |
| Concurrent demotion / removal of the caller | `FOR SHARE` on the caller's row conflicts with the writer's row lock | new deterministic test (held uncommitted demotion) |

**Writers of `membership.permissions`, and what serializes each pair:**
- `registerHousehold`: an insert of a new row, with no conflict;
- `claimResidentProfile` and `joinHousehold`: inserts;
- `setMemberRole`, `revokeMembershipForProfileTx` and `reactivateMember`: `UPDATE` of the target row,
  with an implicit row lock;
- migration 0029: `LOCK TABLE`.

Every permission check of a mutator takes `FOR SHARE` on the caller's row, so it serializes
against any of the `UPDATE` writers on that row. Two mutators on different rows do not conflict.

## Risks / Trade-offs

- **0029 against branches without this change, on the shared dev database.**
  - Risk: an exact household CHECK or a widened moderator CHECK would refuse every registration
    or appointment made by old code (F4's `feat/screening-pass`, the Cursor WP branches), as 0024
    did.
  - Mitigation: expand/contract (D2, D3). 0029 refuses no old-code **write** on a test path; the
    lower bounds arrive with the contract migration once every open branch has merged `main`.
- **0029 relaxes refusals that old-code tests assert** (pre-mortem H2).
  - Risk: `membership-role-integrity.test.ts` "the household set is exact" on every branch without
    this change expects a missing `manage_settings` to be refused; after 0029 it is accepted, so
    those branches' pre-push runs (and `verify-hosted` on `main` if a WP merges in between) fail.
  - Mitigation: apply 0029, verify, push and merge back-to-back (tasks 9.0–9.1); the WP owners merge
    `main` straight after, which brings this change's rewritten test.
- **A plain resident holding `create_application` or `change_application_state` until the contract migration.**
  - Risk: the holder rule for those two is enforced only from the contract migration, and the gates honour stored
    permissions. A row written that way (old-code tests on other branches do, in their own
    households; nothing in this change's code does) can capture or move applications.
  - Mitigation: dev-only, no writer in this code, no grant screen; the contract migration strips such values and
    adds the CHECK. Production is not touched before v0.1 ends.
- **The window between 0029 and the contract migration.**
  - Risk: a household or moderator row created by old code on dev lacks the new permissions, so
    this change's code denies it member administration; and an old-code demotion of a backfilled
    moderator is refused by the administration CHECK.
  - Mitigation: both are safe failures, dev-only, and production is not touched before v0.1 ends.
    the contract migration backfills again before tightening. Its trigger (every open branch rebased) is a register
    row and a plan entry, so it cannot be forgotten.
- **Deadlock between two moderators removing or demoting each other at once.**
  - Risk: A holds `FOR SHARE` on A and updates B, while B holds `FOR SHARE` on B and updates A.
    Postgres aborts one with `40P01`, and the survivor proceeds. The aborted caller sees a generic
    failure; a retry is then refused by the permission check.
  - Mitigation: accepted. It is vanishingly rare, both outcomes are safe, and the alternative
    (locking the target first) would read the target before authorizing.
- **A moderator demoting itself while the household demotes it** (pre-mortem L18): S(own row) then
  X(own row) against the household's X(same row) can deadlock; Postgres aborts one with `40P01`,
  both outcomes leave the row demoted or unchanged. Accepted.
- **Lock contention on the household account's row.**
  - Risk: every household-account action now takes `FOR SHARE` on one row.
  - Mitigation: none needed. Shared locks do not conflict with each other, only with writes to
    that row, which are rare (none in v0.1 besides the migration).
- **Behaviour changes, all named:**
  - the moderator gains `export_subject_access`;
  - a moderator individually granted `manage_voting_procedure` sees the voting-procedure settings page;
  - `getResidentList` refuses a foreign `accountId`;
  - one denial class.
- **The lint's patterns can miss an aliased role read** (`const r = row.role; if (r === …)`).
  - Mitigation: the authorization matrix and the moderator/granted columns test behaviour; the lint
    is a tripwire, not a proof.

## Migration Plan

1. Code, constants, CHECKs and 0029 are written with dev still at `0028`. Tests that register a
   household are expected red against dev until 0029 is applied (dev's exact two-value household
   CHECK refuses the eight-value set), so only lints, `tsc` and pure unit tests run until then.
2. Local review (`/code-review high`), the walkthrough preparation and the archive come **before**
   0029 reaches dev, so it is applied as late as possible, right before the push and merge.
3. The agent applies 0029 to `flatmate-io-dev` (no `DROP COLUMN`, no `SECURITY DEFINER`), after
   telling the human. Catalog check: the five constraint definitions (household, moderator floor,
   moderator-only, household-only, administration); every live admin row with the eight values;
   every live moderator with the six backfilled values and `manage_rounds`; every live
   `close_round` holder also holding `manage_rounds`; zero holder-restricted values outside their
   group.
4. `npm run verify` green, push, PR, merge.
5. **Later, change `role-permissions-contract` (its migration numbered when written; WP01 holds `0030`):** once every branch that was open at merge
   time has merged `main`, backfill again and tighten the household and moderator lower bounds to
   the new sets; flip `manage_rooms` (and drop `checkFrom` from the application pair) to their final
   holders; strip the retired names; delete the transitional constants.

**Rollback of 0029:** remove the new values with `array_remove`, drop the two new CHECKs, re-add the
old exact household, five-value moderator and one-value moderator-only CHECKs. Safe only before code depends on them; a note in the task, not a script.
