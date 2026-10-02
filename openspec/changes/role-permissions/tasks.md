# Tasks

> **Order matters.** Migration `0029` reaches `flatmate-io-dev` only in group 9, after all the code
> is written, reviewed and archived — as late as possible, right before the merge. It is the
> **expand** half (design D2/D3): it must not refuse anything that branches without this change
> write. Until it is applied, every test that registers a household fails
> against dev, because `registerHousehold` stores the eight-value household set that dev's old CHECK
> refuses. So, as you go, run only `npx tsc --noEmit`, `npm run lint`, the lint scripts and the
> pure unit tests (`tests/unit/lint/**`, `tests/unit/identity/role-permissions-constants.test.ts`).
> The full `npm run verify` runs in group 10.
>
> **Hard floor:**
> - G-C, G-D, G-L, G-G1/G-G3.
> - No `expect` line in a guarded test file changes. G-D15's `vote-household-account.test.ts` and the
>   vote-scoping tests DO call `castVote`, `getScreeningPass`, `getAwaitingVoteCounts` (converted in
>   3.10c): keep each function's `profileId === null` early exit **before** the new `vote` check, so
>   their "issues no query" assertions hold unchanged. If any other guarded file
>   turns out to, stop and report.
> - Never mark anything in `test/guarded.manifest.json`.
> - **Never edit an applied migration** (`drizzle/0000`–`0027`).
> - Never touch `feat/screening-pass`'s `drizzle/0028_vote.sql`; it is not on this branch.
>
> **Every test task names its deliberate break.** Run it, see the test fail, revert, report the
> failure message. Where a case is held by something the code cannot change (a CHECK that already
> refused it before this change), it is labelled an **invariant guard**, and it has no break.
>
> **Test files end in `.test.ts`.** Render tests use `createElement` + `renderToStaticMarkup`, as
> `tests/unit/casting/third-party-notice.test.ts` does.
>
> **`main` may move under you** (Cursor work packages WP01–WP08 run in parallel). If `main` gains
> commits, merge them before group 9 and re-run the lints. None of them may touch the permission
> constants or the membership CHECKs (`audit/cursor/README.md`).

## 0. Precondition: F4 change 1 is on `main` (design D11)

- [x] 0.1 *(Done by the orchestrator, 2026-10-02: F4 change 1 merged as PR #48 + fix #49; branch
  fast-forwarded to `3c929c0`; `drizzle/` ends at `0028_vote`.)* Check `git log origin/main` for F4 change 1 (`screening-pass`, migration `0028_vote`,
  `src/modules/deliberation/`). If it is **not** merged, stop and report; do not start group 1 (the
  human decides whether to wait). If it is, rebase this branch onto
  `origin/main` (the branch holds only `openspec/changes/role-permissions/` so far), re-run
  `openspec validate role-permissions --strict`, and re-check the line numbers the tasks cite.
- [x] 0.2 *(Done, 2026-10-02: only the five sites this file names — `assertAccountCanVote` in
  `deliberation/repository.ts`, `close_round` in `organization/page.tsx` and `rounds/new/{page,actions}.ts`.)*
  `grep -rn "close_round\|isResident\|is_resident\|assertAccountCanVote" src/modules/deliberation src/app`
  on the rebased tree; paste the list into the report. Any `close_round` or role/attribute check F4
  added that this file does not name yet becomes a task in group 3 before you continue.

- [ ] 0.3 Open Cursor audit PRs overlap this change (state on 2026-10-02; re-check with `gh pr list`
  before group 1 and again before group 9, and merge `main` whenever one lands):
  - **WP01 #45** adds `drizzle/0030_revoke_anon_authenticated.sql` (journal `idx` 29). See task 1.2.
  - **WP03 #44** also adds `drizzle/0031_auto_join_open_rounds_lock.sql` (journal `idx` 29 as well;
    human hand-off, **already applied to `flatmate-io-dev`** on 2026-10-02). It replaces the
    `auto_join_open_rounds` membership-insert trigger (round `FOR SHARE`); it touches no permission
    or `membership` CHECK. Its documented lock order membership → household_settings → casting_round
    agrees with task 3.10d's membership → profile → round. Dev is therefore at `0028` + `0031` (+
    `0030` if WP01's was applied); check `list_migrations`/the catalog before group 9 and report.
  - **WP03 #44** reorders locks in `src/modules/casting/repository.ts`: expect a conflict on the
    `close_round` lines of task 3.10a; resolve by keeping WP03's lock order and this change's literals.
  - **WP05 #46** adds `scripts/lint/_shared.ts`: if merged, task 6.1 uses it; if not, 6.1 reuses an
    existing lint's walker, and WP05 migrates `role-reads.ts` when it rebases.
  - **WP06 #47** edits the `verify` script in `package.json`: keep both additions.
  - **WP04** (not yet open) moves casting's checks inside their transactions; it must use
    `manage_rounds` / `manage_round_participation`. Say so in the report so the human tells Cursor.

## 1. The permission table, CHECKs and migration 0029 (design D1, D2, D3)

- [x] 1.1 `src/modules/identity/schema.ts`, per design D2:
  - `PERMISSIONS` (14 entries, `vote` with `holders: ["resident"]` meaning `is_resident`, each with its final `holders`, a `checkFrom: "contract"` on the three
    D1 marks with † (`manage_rooms`, `create_application`, `change_application_state`; never on
    `manage_voting_procedure`), and a comment naming its matrix row) and the `PermissionName` type; no
    `"any"` holder exists;
  - `ROLE_SETS` (`household` 8, `moderator` 11, `resident` = `["vote"]`), typed with `satisfies` so an
    undeclared name is a compile error;
  - `REPLACED_PERMISSIONS = { close_round: ["manage_rounds"], manage_settings:
    ["manage_voting_procedure"] }` and `RETIRED_PERMISSIONS` = its keys, commented "kept on stored rows
    for branches without this change; carried over by 0029, stripped by the contract migration" (D2);
  - `HOUSEHOLD_PERMISSIONS` / `MODERATOR_PERMISSIONS` / `RESIDENT_PERMISSIONS` re-exported as the
    sets; `MODERATOR_ONLY_PERMISSIONS = permissionsHeldOnlyBy(["moderator"])` (so it skips `checkFrom`
    entries and equals the CHECK literal); a small `permissionsHeldOnlyBy(roles)` helper, the only
    grouping logic;
  - frozen old sets `HOUSEHOLD_PERMISSIONS_AT_0024` (two), `MODERATOR_PERMISSIONS_AT_0027` (five),
    `MODERATOR_ONLY_PERMISSIONS_AT_0027` (`reverse_application_state`), and the transition bounds,
    each commented "deleted by the contract migration; no permission check reads it":
    - `HOUSEHOLD_FLOOR_UNTIL_CONTRACT` = old ∩ new = `["manage_rooms"]`;
    - `HOUSEHOLD_CEILING_UNTIL_CONTRACT` = `HOUSEHOLD_PERMISSIONS` ∪ (`RETIRED_PERMISSIONS` ∩
      `HOUSEHOLD_PERMISSIONS_AT_0024`) = the eight + `manage_settings` (old-code registration and
      every backfilled household row still carry `manage_settings`);
    - `MODERATOR_FLOOR_UNTIL_CONTRACT` = old ∩ new = the four;
    - the resident CHECK keeps its existing `@> RESIDENT_PERMISSIONS_AT_0024` (empty) literal; no
      separate floor constant;
  - CHECKs: household `@> HOUSEHOLD_FLOOR_UNTIL_CONTRACT AND <@ HOUSEHOLD_CEILING_UNTIL_CONTRACT`;
    moderator `@> MODERATOR_FLOOR_UNTIL_CONTRACT`; resident unchanged (`@> '{}'`); moderator-only,
    household-only, administration and resident-only (`is_resident OR NOT …`) built from
    `permissionsHeldOnlyBy(…)`. All via `permissionArrayLiteral`, each commented with `drizzle/0029`
    and, where it tightens later, the contract migration.
  Keep every existing export name that casting, `auth.ts` and tests import; `npx tsc --noEmit`
  lists anything that breaks.
- [x] 1.2 Generate: `npx drizzle-kit generate --name role_permissions`. The file is
  `0029_role_permissions` in every merge order. **General rule** (WP01's `0030` and WP03's `0031` both
  carry journal `idx` 29 on their branches): the journal on `main` must list entries in file-number
  order with sequential `idx`; `0029_role_permissions` sits directly after `0028_vote`; each later
  entry's `prevId` points at the entry before it; `when` values increase down the list. Before
  generating, copy every `drizzle/meta/00NN_snapshot.json` with NN ≥ 29 to the scratchpad, since
  drizzle-kit names its output by last idx + 1 and may overwrite one. Cases:
  - **WP01 not merged:** it writes `0029_*` after `0028_vote`; nothing to fix. WP01 then rebases
    onto this change (its file is already named `0030`; it re-points its snapshot's `prevId`).
  - **WP01 merged first** (journal `…, 0028_vote (idx 28), 0030_revoke_anon_authenticated (idx 29)`):
    drizzle-kit numbers by **last idx + 1** and names the file by that idx
    (`node_modules/drizzle-kit/bin.cjs` ~32926, ~30616), so it writes `0030_role_permissions.sql` and
    **overwrites WP01's `drizzle/meta/0030_snapshot.json`**. Procedure: before generating, copy
    `drizzle/meta/0030_snapshot.json` to the scratchpad; generate; move the new
    `0030_role_permissions.sql` → `0029_role_permissions.sql` and the new `0030_snapshot.json` →
    `0029_snapshot.json`; restore WP01's `0030_snapshot.json` from the copy (`git checkout -- drizzle/meta/0030_snapshot.json`
    also works); in the journal put this entry between `0028_vote` and `0030_…` with
    `idx` 29 and WP01's entry `idx` 30, `when` between theirs (`1790765030593` < when <
    `1790863115553`); set `0029_snapshot.json`'s `prevId` to `0028`'s `id` and WP01's `prevId` to
    `0029`'s `id`.
  - **WP03 (or both) merged first:** the same procedure, generalised by the rule above (restore every
    overwritten snapshot, slot `0029` after `0028`, renumber `idx`, re-point `prevId`s).
  - **WP01 / WP03 merge after this change:** their owners renumber their journal `idx` and re-point
    `prevId` per the rule; say so in the report for the human to pass on.
  Then `npx drizzle-kit check` (report its output). The contract migration (later change) takes the
  next free number.
- [x] 1.3 Hand-edit `drizzle/0029_role_permissions.sql` into D3's steps (1–8 with 6a), in order, with a header
  comment arguing each step against the constraints live at it (copy `0027`'s header shape). Every
  array literal is written out, not bound. `grep -nE '\$[0-9]' drizzle/0029*` → no output (the `$$`
  of the `DO` block is expected). `npx tsx scripts/lint/migration-shape.ts` → passes. Keep
  `drizzle/meta/` as generated, apart from the rename.
- [x] 1.4 `tests/unit/identity/role-permissions-constants.test.ts`: read `0029` like `0027`; assert
  that the last-adding migration's literals equal what `schema.ts` derives: household floor and
  ceiling; moderator floor (now from `0029`); the three holder CHECKs (moderator-only =
  `reverse_application_state`, `manage_rounds`, `manage_round_participation`); and `0029`'s backfill
  literals (household eight; one rename backfill per `REPLACED_PERMISSIONS` entry with its target
  and role filter; the moderator's six; `vote` for residents) and the resident-only CHECK literal = `["vote"]`. Assert the household
  ceiling literal contains `manage_settings` (finding: without it 0029 aborts on every backfilled
  row). The 0024/0027 history pins (today compared with the live `HOUSEHOLD_PERMISSIONS`,
  `RESIDENT_PERMISSIONS`, `MODERATOR_ONLY_PERMISSIONS`, test lines ~94–108) are **repointed to the
  frozen copies** of 1.1.
  **Breaks:** (a) drop `issue_password_reset_link` from the `0029` household ceiling → fails; (b)
  put the eight-value set into the household floor (the exact CHECK the human ruled out) → fails;
  (c) leave `manage_round_participation` out of the `0029` moderator-only literal → fails; (d) drop
  `manage_settings` from the ceiling in both `schema.ts` and `0029` → the explicit containment
  assertion fails (the literal-equality check alone would not).
- [x] 1.5 New `tests/unit/identity/permission-declarations.test.ts` (design D10):
  - every set entry is a key of `PERMISSIONS` whose `holders` include that set's role;
  - every permission string literal passed in `src/**/*.{ts,tsx}` to `assertHasPermission`,
    `assertHasPermissionTx`, `assertHoldsAnyPermissionTx`, `assertHoldsAllPermissionsTx`,
    `membershipHoldsPermission`, and every `requires` entry of casting's `TRANSITION_RULES`, is a key
    of `PERMISSIONS` and not in `RETIRED_PERMISSIONS`;
  - every key of `PERMISSIONS` is checked somewhere in `src/` (no dead permission);
  - every `REPLACED_PERMISSIONS` target is a key of `PERMISSIONS`, no key of it is, and `0029` holds a
    backfill statement per entry (a rename without its carry-over fails).
  **Breaks:** gate `issueJoinCode` on `manage_join_code` (typo) → fails; leave one `close_round`
  check in `src/app/(org)/rounds/new/page.tsx` → fails; put `issue_password_reset_link` into the
  moderator set → fails.

## 2. The permission primitive and one denial class (design D4, D5)

- [x] 2.1 No new read helper (pre-mortem L15): the reads in group 4 and `assertAccountCanVoteTx` use the
  existing private `readLiveMembershipTx(tx, context, lock)`, which already returns the caller's live
  row with the session-profile predicate. The holding rule stays only in `membershipHoldsPermission`.
- [x] 2.2 Delete `ResidentListActionDeniedError`, `assertIsAdministration` and
  `assertIsAdministrationOrModerator`. Every refusal they produced becomes a `PermissionDeniedError`
  naming the permission (null actor, account mismatch, missing permission). `npx tsc --noEmit`
  lists every caller; each is fixed in groups 3–5.

## 3. Convert the mutators, one function per commit (design D1, D4)

Each task: refuse `actingAccountId !== context.accountId` (or a null `actor.accountId`) with
`PermissionDeniedError` before the transaction; remove the old pre-transaction gate; call
`assertHasPermissionTx(tx, context, "<permission>")` as the **first** statement inside the existing
`withSessionContext`. Rewrite each function's authorization comment to name the permission and the
matrix row (no "administration or moderator" wording left). All in
`src/modules/identity/repository.ts`.

- [x] 3.1 `transitionResidentProfileStatus` → `manage_members`.
- [x] 3.2 `removeMember` → `manage_members`.
- [x] 3.3 `setMovedOut` → `manage_members`.
- [x] 3.4 `reactivateMember` → `manage_members`.
- [x] 3.5 `issueJoinCode` → `manage_join_codes` (inside the `withSessionContext` that calls
  `issueJoinCodeTx`; `issueJoinCodeTx` itself stays ungated for `registerHousehold`).
- [x] 3.6 `extendJoinCode`, `deleteJoinCode` → `manage_join_codes`.
- [x] 3.7 `createResidentProfile` → `create_resident_profile` (a moderator may now create a profile; human decision 2026-10-01, design D1). Rewrite the FR-1.3 comment above it.
- [x] 3.8 `issuePasswordResetLink` → `issue_password_reset_link`.
- [x] 3.9 `setMemberRole` → `appoint_moderator` (a moderator may now appoint and demote, itself and other moderators included; design D1). Demotion sets `permissions = CASE WHEN is_resident THEN RESIDENT_PERMISSIONS ELSE '{}' END` (a
  member holds the resident set and nothing else; a set-difference would leave an individually
  granted `manage_voting_procedure` behind and the administration CHECK would refuse the demotion).
  The target UPDATE gets `isNull(membership.revokedAt)` and the target is read `FOR UPDATE` (a
  concurrent move-out must not make the demotion write `vote` onto a revoked row); a vanished live
  target → the existing "not found" path, no write. Rewrite the EC-1.7 "administration-only" comment. Mark the target check
  (`target.role === "household_admin"`) with `// role-state-read: …` (reason: a clear refusal; the
  household-only CHECK would also refuse it, but as a 500).
  The `fromRole === toRole` no-op stays.
- [x] 3.10 `triggerSubjectAccessExport` → `export_subject_access`. It has no transaction: use
  `assertHasPermission` (no write follows; the stub returns a handle), and say so in its comment.
- [x] 3.10a `src/modules/casting/repository.ts`: `createRound`, `openRound`, `createAndOpenRound`,
  `listOrganisationTasks` → `manage_rounds`; `addResidentToRound` → `manage_round_participation`;
  `updateHouseholdSettingsWithProcedureLock`, `forceChangeSettingWhileRoundOpen` →
  `manage_voting_procedure`.
  Literal swaps only, the checks stay where they are (moving them inside the transaction is audit #5,
  WP04). `src/app/(org)/rounds/new/page.tsx` and `actions.ts`, `src/app/(org)/organization/page.tsx`
  (`canOpenRound`): `close_round` → `manage_rounds`. Rewrite each comment that says „close_round".
  `grep -rn "close_round\|manage_settings" src` afterwards → only `REPLACED_PERMISSIONS`, the
  migration-history comments in `schema.ts`, and the demotion SQL.
- [x] 3.10b `assertAccountCanVote` (identity) becomes `assertAccountCanVoteTx(tx, context)`: the
  session-account check, then the caller's live membership read `FOR SHARE` in `tx` (reuse
  `readLiveMembershipTx`), refusing with `HouseholdAccountCannotVoteError` unless it holds `vote`.
  Delete the old non-`Tx` export (no caller remains); move `account-cannot-vote.test.ts` onto
  `castVote` (FR-1.7 tested on the real path) and update `authorization-matrix.test.ts`'s exemption
  entry. Rewrite its comment (FR-1.7: the household account holds no `vote`; a moderator without a
  resident profile neither).
- [x] 3.10c `src/modules/deliberation/repository.ts` (F4): `castVote` — keep the early profile and input
  checks, replace the out-of-transaction `assertAccountCanVote` with `assertAccountCanVoteTx(tx,
  context)` as the first statement inside the insert's `withSessionContext`, mapping
  `HouseholdAccountCannotVoteError` to `VoteError("not_eligible")` as before; `getScreeningPass` and
  `getAwaitingVoteCounts` — `assertHasPermissionTx(tx, context, "vote")` first inside their
  transaction (`getAwaitingVoteCounts` returns the empty map instead of throwing, matching its
  household-account branch). Each function's `profileId === null` early exit stays first, before any
  query (G-D15 asserts it). The `vote_guard` trigger and `0028` are untouched. Update
  `tests/integration/deliberation/cast-vote-invalid-input.test.ts` and `cast-vote.test.ts` (they mock
  or name `assertAccountCanVote`). Comments name `vote`
  and the matrix row.
- [x] 3.10d Lock order against the new in-transaction checks (pre-mortem M9): `castVote` and every
  identity mutator now take S(caller membership) first. `setMovedOut` and `removeMember` currently
  update the target's profile before its membership (X(profile) then X(membership)), which can
  deadlock with a vote by that target. Read the target membership `FOR UPDATE` at the start of both
  (it is already read, unlocked, near the top), so membership is always locked before profile.
  Write the order into a comment beside `revokeMembershipForProfileTx`: membership, then profile,
  then round/participation (0028's trigger).
- [x] 3.11 `grep -n "role" src/modules/identity/repository.ts`: every remaining hit is a write, a
  type, a selected column, a comment, or a marked state read. Paste the list into the report.

## 4. Reads and capability flags (design D4, D6)

- [x] 4.1 `getResidentList(context, accountId)`: refuse `accountId !== context.accountId`; inside its
  transaction, one `readLiveMembershipTx(tx, context, true)` (the existing helper; no new one); refuse unless it holds any of
  `manage_members`, `manage_join_codes`, `create_resident_profile`, `appoint_moderator`; return
  `{ members, canManageMembers, canManageJoinCodes, canCreateProfile, canAppointModerator,
  canIssueResetLink, leadWithJoinCode }` computed from that one set (D6). Remove `isAdmin`/`canAct`.
- [x] 4.2 `listJoinCodeIssuances`: same shape: one locked read inside the transaction; refuse without
  `manage_join_codes`; the reset-row filter keys on `issue_password_reset_link` from the same set.
  Rewrite the review-fix comment above it accordingly.
- [x] 4.3 `getNavigationAccess`: `membersList` = holds any of the four member-administration
  permissions; `organisation` = holds any key of `PERMISSIONS` outside `RESIDENT_PERMISSIONS`
  (retired names and unknown strings never count, D6). Comment cites change 5 as its replacement.
- [x] 4.4 `getHouseholdSettings`: call `assertHasPermission(context, context.accountId,
  "manage_voting_procedure")` **before** its `withSessionContext`, never inside the callback
  (`assertHasPermission` opens its own transaction; nesting throws `NestedSessionContextError`).

## 5. Screens

- [x] 5.1 `src/app/(org)/members/page.tsx`: destructure the new flags; `createResidentForm` ←
  `canCreateProfile`; the role toggle ← `canAppointModerator`; move-out, reactivate and remove ←
  `canManageMembers`; the join-link section and the per-profile invitation ← `canManageJoinCodes`;
  both reset-link blocks ← `canIssueResetLink`. The badge and the toggle direction keep
  `m.role`, each marked `{/* role-state-read: describes the listed member, not the caller */}`.
  Update the comments that cite `isAdmin` / `assertIsAdministration`.
- [x] 5.2 `src/app/(org)/settings/page.tsx`: drop the page-level gate; catch `PermissionDeniedError`
  from `getHouseholdSettings` and render the existing access message. Rewrite the O20 comment
  (`manage_voting_procedure`, not `household_admin`).
- [x] 5.3 `src/app/(org)/members/actions.ts`, `remove-member-form.tsx`,
  `src/app/(org)/organization/page.tsx`: comments that name the deleted gates now name the
  permission; no logic change.
- [x] 5.4 `tests/unit/identity/resident-list-empty-state.test.ts` (and any other render or unit test
  `tsc` flags, e.g. `tests/unit/casting/organization-round-button.test.ts`): move to the new flags.
  Add a render test `tests/unit/identity/members-page-capabilities.test.ts` of the members list
  markup for flag sets: household (all five), moderator (all but `canIssueResetLink`), and one set
  per single flag: each control appears exactly when its flag is set.
  If the page cannot be rendered without a session, extract the list body into a pure component in
  the same directory first, no behaviour change. **Break:** gate the profile form on
  `canAppointModerator` → the single-flag cases fail.

- [x] 5.5 Organisation-area check (design D9). First read the layout section of
  `node_modules/next/dist/docs/` and confirm that a layout is not re-rendered on navigation between
  sibling pages; quote it in the report (if it is re-rendered, say so and stop: D9 then belongs in
  `src/app/(org)/layout.tsx`). Add `src/app/(org)/organisation-access.ts` with
  `requireOrganisationAccess(current)` (reads `getNavigationAccess`, no own query) and a shared
  access-message component beside it (the existing members-page wording, back link to Start for a
  resident). Call it first in every `page.tsx` under `src/app/(org)/` **except `rounds/[id]/page.tsx`**:
  `organization`, `members`, `rooms`, `settings`, `rounds/new`, `rounds/[id]/applications/new`,
  `rounds/[id]/applications/[applicationId]`, `…/[applicationId]/edit` (`find src/app/\(org\) -name
  page.tsx` is the list; paste it into the report). `rounds/[id]` stays reachable for a
  participating resident: it renders the participant list FR-1.19 promises every participant, and it
  is already gated by participation in `getRoundForSession` / `getRoundParticipants` (pre-mortem H3;
  design D9). Page tests that mock identity and break on the new call (e.g.
  `tests/unit/casting/round-page-capture-link.test.ts` if it covers a guarded page) are updated in
  the same commit; list them. Each page's own narrower check stays. Every
  `page.tsx` keeps its `loading.tsx` (pending-feedback lint).
- [x] 5.6 `src/app/(org)/organization/page.tsx`: delete the `profileId === null ||` term; links by
  permission (rooms ← `manage_rooms`, members ← the members-list flag, settings ← `manage_voting_procedure`),
  read from one membership read (extend `getNavigationAccess` with `rooms` and `settings` flags
  rather than three `assertHasPermission` calls). Update `navigation-access` expectations.

## 6. The ninth lint (design D7)

- [x] 6.1 `scripts/lint/role-reads.ts` per D7 (patterns, the `role-state-read:` marker on the same
  or previous line with a non-empty reason, comments stripped before matching, markers read from the
  raw text, `src/modules/identity/schema.ts` exempt). Reuse an existing lint's walker and comment
  stripper rather than writing a seventh (audit finding #22). Output names file:line.
- [x] 6.2 `tests/unit/lint/role-reads.test.ts`, on the pattern of
  `tests/unit/lint/pending-feedback.test.ts`: fixtures for `m.role === "moderator"` (flagged),
  the same with a marker (passes), a marker without a reason (flagged), `eq(membership.role, …)`,
  SQL `role <> 'moderator'` in a template string (flagged), `toRole !== "member"` and
  `role: "member"` (not flagged), `role ===` inside a comment (not flagged). Plus one case running
  the lint over the real `src/` → zero findings. **Break:** put `isAdmin = membershipRow.role ===
  "household_admin"` back into a scratch copy of the fixture → flagged.
- [x] 6.3 `package.json` `verify`: add `tsx scripts/lint/role-reads.ts` after `pending-feedback.ts`.
  `.claude/rules/guardrail-lints.md`: a row for it; "eight" → "nine" there and in `CLAUDE.md`
  (both mentions in "Commands"). `tests/unit/lint/cleanup-inventory.test.ts` stays "the ninth
  check" in name only if the file says so; reword it to "the vitest-side check" if the count would
  now be wrong.

## 7. Tests (database; expected red against dev until group 9)

- [ ] 7.0 Every test that names `close_round` or `manage_settings` (`grep -rln close_round tests`: at least
  `moderator-permissions`, `founding-resident-permission`, `room-round-authorization`,
  `organisation-tasks`, `navigation-access`, `membership-role-integrity`, the constants test) moves to
  `manage_rounds` (or `manage_round_participation` where it adds participants), or to
  `manage_voting_procedure`; tests that grant either to a plain member lose that case (residents
  hold no organising permission). History tests of
  0024/0027 keep their pinned literals.
- [ ] 7.1 `tests/integration/policy/authorization-matrix.test.ts`: per identity **and casting** case,
  record the expectation for three callers beside the existing resident refusal: **moderator**
  (allowed everywhere except `issuePasswordResetLink` and the settings mutators) and the household
  account (allowed for identity, rooms and settings; refused for every round and application
  mutator). The resident column now covers casting too: a plain resident is refused `createRound`,
  `openRound`, `addResidentToRound`, `captureApplication`, `transitionApplication` (residents hold no
  organising permission, design D1). Replace `ResidentListActionDeniedError` with
  `PermissionDeniedError` and assert the denial's permission name. **Break:** give
  `issuePasswordResetLink` `manage_members` instead of `issue_password_reset_link` → the moderator
  column fails.
- [ ] 7.2 `tests/integration/policy/resident-list-access.test.ts`: the two calls that pass a foreign
  `accountId` with `hh.context` now use each caller's own context. Add the hardening case (design
  D4; not a visibility rule — who may see the list is unchanged): a call whose `accountId` argument
  is not the session's own account, e.g. a plain resident's session naming the moderator's account
  to borrow its rights → `PermissionDeniedError`, no rows.
  Assert the flags for household, moderator. **Break:** remove the mismatch refusal → the new case
  fails.
- [ ] 7.3 `tests/integration/policy/settings-page-admin-guard.test.ts` (now testing
  `getHouseholdSettings`): resident refused; moderator refused; a moderator granted
  `manage_voting_procedure` (household writes `permissions = permissions || 'manage_voting_procedure'`) succeeds;
  household succeeds. **Break:** check `issue_password_reset_link` instead of `manage_voting_procedure` → the
  granted-moderator case fails.
- [ ] 7.4 `tests/integration/policy/navigation-access.test.ts`: the "member with any permission"
  case goes (a plain resident holds no organising permission; its SQL-written transition state is
  7.7's); add "a moderator → organisation and membersList true", "the household → both true", "a
  plain resident → both false". **Break:** `membersList = organisation` → the plain-resident case
  still passes, so use `organisation = true` → the plain-resident case fails.
- [ ] 7.5 `tests/integration/policy/join-code-isolation.test.ts`, `password-reset-link.test.ts`,
  `member-role-appointment.test.ts`, `decidable-mutator-authorization-fixes.test.ts`,
  `resident-claim-flow.test.ts`, `member-removal-final.test.ts`, `organisation-tasks.test.ts`:
  swap the error class; keep every behaviour assertion. Add the audit's characterization gaps where
  missing: moderator **allowed** for `createResidentProfile` and for `setMemberRole` (appointing a
  member, demoting another moderator, demoting itself), `removeMember`, `reactivateMember`,
  `triggerSubjectAccessExport`; moderator refused by `issuePasswordResetLink`; a moderator and the
  household both refused to target the administering membership (`CannotChangeAdminRoleError`); the `setMemberRole` no-op
  writes no event; a moderator's `listJoinCodeIssuances` hides a reset row the household sees.
- [ ] 7.5a Voting (`tests/integration/policy/account-cannot-vote.test.ts` and F4's deliberation tests):
  household refused (unchanged); a moderator **without** a resident profile (the existing
  non-resident-moderator helper) refused `castVote` and given no deck; a resident and a resident
  moderator vote. Transition case, labelled as such: 0029's resident floor is still empty, so a live
  resident row without `vote` (what old-code joins write) is accepted; write one via
  `withSessionContext` as the household, then `castVote` → `not_eligible` (the contract migration makes the row itself
  impossible). **Break:** make `assertAccountCanVoteTx` test `isResident` instead of `vote` → the
  stripped-vote case votes and the test fails.
  Plus an in-flight case modelled on 7.6: in a held, uncommitted transaction, strip `vote` from the
  voter's membership by raw SQL as the household (legal until the contract migration), leaving the
  profile active and the participation intact; `castVote` waits, then is refused `not_eligible`.
  **Break:** call the `vote` check before the transaction (an unlocked read) → the vote is recorded.
  (A held *move-out* would not do: `vote_guard` step 4 locks the profile and refuses anyway, so that
  variant is an invariant guard, not a regression test.)
- [ ] 7.6 New `tests/integration/policy/member-administration-revocation.test.ts`, modelled on
  `application-capture.test.ts` 6.8: inside a held, uncommitted `withSessionContext` as the
  household, demote moderator M (the real `setMemberRole` statement shape: role and permissions);
  start M's `setMovedOut` of a member X outside that callback chain (avoid
  `NestedSessionContextError`); prove it is waiting (it has not resolved after the demotion's
  update); commit; assert `PermissionDeniedError` naming `manage_members`, X's profile still
  active, X's membership live, no `membership.revoked` event. **Break:** move `setMovedOut`'s check
  back before its transaction (`assertHasPermission`) → the move-out succeeds and the test fails.
- [ ] 7.7 `tests/integration/raw-sql/membership-role-integrity.test.ts`: new cases per the
  `identity/permissions` delta: a moderator written with `issue_password_reset_link` → refused; a
  plain member with any of the five administration values → refused; a plain member with
  `manage_round_participation` or `manage_rounds` → refused; a plain member with
  `create_application` → still accepted by the database (**transition** case, refused from the contract migration;
  label it so — design Risks names the window); the household with `close_round` or with
  `reverse_application_state` → refused (ceiling); the household holding the eight plus
  `manage_settings` → accepted (ceiling, transition); the existing case "the household set is exact:
  neither a missing manage_settings nor an extra close_round" (~:105-113) is **rewritten**: a missing
  `manage_settings` is now accepted (transition), a missing `manage_rooms` is refused (floor), the
  extra `close_round` stays refused; and the **expand** cases, accepted: a live
  household row holding only `manage_rooms` + `manage_settings`, a live moderator holding only the
  five earlier values (what old-code branches write; the spec's transition scenario), each then
  refused `manage_members`-gated actions through the repository. Assert the constraint name in each
  error. (A moderator without `manage_members` and a household without `issue_password_reset_link` being
  refused are the contract migration's cases, not this change's.) **Break:** drop `membership_administration_permissions`
  from schema.ts → argue instead (app_runtime cannot DROP a constraint; the CHECK cannot be
  disabled from the test): these are **invariant guards** run against the migrated catalog, and the
  constants test (1.4) carries the break.
- [ ] 7.7a New `tests/integration/policy/organisation-access.test.ts`: (a) a plain resident:
  `requireOrganisationAccess` false, and each `(org)` page's server component rendered with that
  session returns the access message (render the page function directly, as other page tests do;
  if none does, test the helper plus one page and say so); (b) a moderator: true; demote it, then
  the next call (a fresh request: new `getCurrentSession` context) returns false — no sign-in in
  between; (c) the household: true, and the overview offers rooms, members, settings and not
  opening a round; the moderator's overview offers rooms, members, opening a round and not
  settings. **Break:** cache `getNavigationAccess` at module level (not per request) → (b) fails.
- [ ] 7.8 New `tests/integration/raw-sql/role-permissions-backfill.test.ts`, modelled on
  `reverse-permission-backfill.test.ts` but **not constraint-free**: create the temp copy, seed it,
  add the pre-0029 CHECKs with 0024/0027's literals (the frozen copies), then run every `0029`
  statement in file order with the table name rewritten (the `ADD CONSTRAINT`s included). Extend the
  helper's `seed` with an `isResident` flag (for the non-resident moderator). Seed it with the pre-`0029` state of every writer: a live household (two
  values), a revoked former household? (none exist: skip and say why), a live moderator (five), a
  moderator with an extra grant, a revoked member (`[]`), a live member with a grant of `close_round` (must gain
  nothing: renames carry over only to roles the target allows), a household with the old two values
  (gains the eight, keeps `manage_settings` until the contract migration), a moderator individually
  granted `manage_settings` (gains `manage_voting_procedure`), a live resident with `[]` (gains `vote`), a revoked
  resident (gains nothing), a non-resident moderator (gains no `vote`), a member with no permissions. Assert every row's permissions after, exactly; run the file twice (re-run is
  a no-op); seed a member holding `manage_join_codes` and assert the precondition raises. Then, on the
  migrated temp copy with `0029`'s constraints added, replay what old code writes: insert a household
  row with the two old values and a moderator with the five → accepted; demote that old-code
  moderator with the old `EXCEPT` of the five → accepted; demote a **backfilled** moderator the
  same way → refused by `membership_administration_permissions` (design D2's one expected
  refusal). **Breaks:** (a) move step 3 after step 4 (drop the old CHECK after the backfill) → the
  run fails on the temp copy carrying the old exact household CHECK; (b) drop the `role =
  'moderator'` filter of step 6 → the member gains values and the exact assertion fails; (c) make
  the household floor the eight-value set → the old-code household insert is refused.

## 8. Docs (German text below is for the human to approve)

- [x] 8.0 `docs/03-PRD.md` §4.0.1 Rechtematrix (precedence 3; human decision 2026-10-01, recorded
  in the commit message too):
  - row „`ResidentProfile` anlegen (aus Verwaltungskontext)" → „`ResidentProfile` anlegen (z. B.
    für einen persönlichen Beitrittslink)", Moderator ❌ → ✅;
  - row „Moderator ernennen / Berechtigung vergeben" split into „Moderator ernennen / zurückstufen"
    | ✅ | ✅ | ❌ | ❌ | and „Berechtigung einzeln vergeben" | ✅ | ❌ | ❌ | ❌ |;
  - a note under the matrix: „**Geändert 2026-10-01 (menschliche Entscheidung):** Die Moderation
    legt `ResidentProfile`s an und ernennt oder stuft Moderator:innen zurück — beides gehört zur
    Organisation des Castings (ein Profil für den persönlichen Beitrittslink, die Last der
    Moderation teilen). Passwort-Link und Haushalts-Einstellungen bleiben beim Haushalts-Account.";
  - **the resident column** (human decision 2026-10-01, „Bewohnende stimmen ab und nehmen am
    Casting teil — sonst nichts"): every resident ⬜ → ❌ („`CastingRound` anlegen / schließen /
    wiedereröffnen", „`Application` anlegen", „`Application.status` ändern (vorwärts)", „Fremde
    `AvailabilityWindow` pflegen", „`Appointment` bestätigen"); in the Dimension table the three
    rows „Kann Status ändern / Runde schließen / Termine bestätigen" → Bewohnender „nein"; the AC
    „Eine Berechtigung (Bewerber anlegen, Status ändern, Runde schließen, Termine bestätigen) ist
    einzeln vergebbar, ohne dass das Profil Moderator wird" struck through (`~~…~~`) with „*Geändert
    2026-10-01: einzeln vergebbar nur an die Moderation; Bewohnende organisieren das Casting
    nicht.*"; §4.0.1's opening sentence („plus einzeln vergebbaren Berechtigungen") gets „— nur an
    die Moderation";
  - the note under the matrix gains a second sentence: „Bewohnende stimmen ab und nehmen am Casting
    teil; Runden, Teilnehmende und Bewerbungen organisiert die Moderation. Einzeln vergebbar (⬜)
    sind Rechte nur noch an die Moderation.";
  - a Versionshistorie line for the same change;
  - check the Wechsel row „Moderator scheidet aus" and §4.0.1's last-moderator AC still read true
    (the household account can still do both) and leave them.
- [x] 8.0s `docs/02-SRD.md` (precedence 2 — a scope line; the human decision is quoted verbatim in the
  commit): S-04 „`Membership` mit orthogonalen `is_resident` / `role` plus einzeln vergebbare
  Berechtigungen (Bewerber anlegen, Status ändern, Runde schließen, Termine bestätigen)" →
  „… plus Berechtigungen, die einzeln nur an die Moderation vergeben werden können; Bewohnende
  stimmen ab und nehmen am Casting teil (geändert 2026-10-01, menschliche Entscheidung)"; the §3
  sentence at „plus einzeln vergebbaren Berechtigungen" likewise. Add an SRD Versionshistorie line.
  Check `docs/01`/`08` and `docs/COVERAGE.md` for an E-04/S-04 restatement that now contradicts and
  list each in the report (amend citations, not sources).
- [x] 8.0a `docs/backlog/requirements/F1-requirements.md`: FR-1.3 → "The system shall allow the
  household account **and a moderator** to create resident profiles. *(Amended 2026-10-01, human
  decision: profile creation is part of running a casting.)*"; EC-1.7 gains "*(Amended
  2026-10-01: a moderator may do the same; administration keeps the fallback when no moderator is
  left.)*"; FR-1.8 „plus individually grantable permissions (create applicant, change status, close
  round, confirm appointments)" → „plus permissions grantable individually to a moderator only;
  residents vote and take part *(amended 2026-10-01)*". Search the packet once more for "administration-only" claims about appointing and
  amend them the same way, listing each in the report.
- [x] 8.1 `docs/domain/identity.md` §2.1:
  - the list „Vergebbare Werte in `permissions`": `close_round` → `manage_rounds`, `manage_settings` →
    `manage_voting_procedure` (with „*(seit 2026-10-01; `manage_settings` war zu breit: alle
    gebauten Einstellungen sind das Abstimmungsverfahren. Haushalts-Einstellungen wie Name,
    Kontaktadresse oder Freigabe der Datenschutzseite bekommen ein eigenes Recht, wenn sie gebaut
    werden.)*"); add
    `manage_join_codes` · `create_resident_profile` · `appoint_moderator` ·
    `manage_round_participation` · `issue_password_reset_link` · `vote` (`export_subject_access` is
    already there); and one sentence: „`vote` ist das Rechtebündel der Bewohnenden: Wer ein
    Bewohner-Profil hat, darf abstimmen — die Moderation nur, wenn sie zugleich bewohnt
    (`03-PRD.md` §4.0.1, „✅ wenn `is_resident`"); ob in einer Runde, entscheidet weiterhin die
    `RoundParticipation`.";
  - the line after it becomes: „Wer ein Recht überhaupt halten darf, steht je Recht fest: nur die
    Moderation — `manage_rounds`, `manage_round_participation`, `create_application`,
    `change_application_state`, `reverse_application_state`; nur der Haushalt —
    `issue_password_reset_link`; nur Bewohnende — `vote`; Haushalt und Moderation —
    `manage_voting_procedure`, `manage_rooms`, `manage_join_codes`, `create_resident_profile`,
    `appoint_moderator`, `manage_members`, `export_subject_access`. Die Datenbank verweigert jedes
    Recht jeder anderen Mitgliedschaft. Einzeln vergebbar (⬜) ist nur ein Recht, das die
    Rechtematrix der Moderation mit ⬜ gibt (heute `manage_voting_procedure`)."
  - the box „`close_round` ist die zweite Rolle-Vorbelegung": append „*(Seit 2026-10-01 heißt das
    Recht `manage_rounds`: es trägt Anlegen, Öffnen, Schließen und Wiedereröffnen einer Runde, wie
    die Zeile der Rechtematrix. `RoundParticipation` hinzufügen / entfernen ist ein eigenes Recht,
    `manage_round_participation`, weil es eine eigene Zeile der Rechtematrix ist und so für sich
    verhandelbar bleibt.)*"
  - a new box after the `reverse_application_state` paragraph:
    „**Ein Recht je Zeile der Rechtematrix, keine Rollenprüfung (menschliche Entscheidungen,
    2026-09-28/29 und 2026-10-01).** Jede gebaute Handlung prüft genau ein Recht, nie die Rolle,
    und jedes Recht entspricht einer Zeile der Rechtematrix (`03-PRD.md` §4.0.1). So bleibt
    verhandelbar, welche Rolle welches Recht trägt: Eine Verschiebung ändert die Matrix, das
    Rechtebündel und eine Migration, aber keine Prüfung im Code. Kein Vorlagensystem im Sinne von
    S-04 — jedes Bündel ist eine ✅-Spalte der Matrix."
  - the `permissions` field row „**einzeln vergebbar**" → „**einzeln vergebbar nur an die
    Moderation** (⬜)"; in the box on `create_application`/`change_application_state`, „Beide Rechte
    bleiben außerdem **einzeln vergebbar**, ohne dass das Profil Moderator wird (die Rechtematrix:
    Bewohnender ⬜)" → „*(Geändert 2026-10-01: nicht mehr an Bewohnende vergebbar — Bewohnende
    stimmen ab und nehmen am Casting teil.)*";
  - the `ResidentProfile` passage that says the Verwaltung creates a profile (around „ein Profil
    anlegen und direkt zum Moderator ernennen"): add „— seit 2026-10-01 auch die Moderation";
  - in the O-16 box (§2.1, `Account`): „(`Membership.is_resident = false`, `manage_members`)" →
    „(`Membership.is_resident = false`, `issue_password_reset_link`)".
- [x] 8.1b `docs/domain/zustandsmaschinen.md` (round table, „Recht" column), `docs/screens/rahmenwerk.md`
  (the permissions example list) and the F1 packet's §8 note: `close_round` → `manage_rounds`. The
  frozen `docs/04-Domaenenmodell.md` and `docs/07-Screen-Inventar.md` are **not** touched (Rule 4);
  they keep the old name as snapshots.
- [x] 8.1a `docs/screens/O-organisation.md` O16 (and the „Moderator ernennen" line near O20): where
  profile creation or appointing is described as the Verwaltung's alone, add the moderator, in the
  same words as 8.0. List each edit in the report.
- [x] 8.2 `docs/screens/O-organisation.md` O20, row **Zugang**: „Nur mit `manage_voting_procedure`
  (Haushalts-Account; einer Moderation nur als einzeln vergebenes Recht, ⬜), unabhängig von
  `acting_profile_id` (§4.2)". Also `domain/zustandsmaschinen.md`'s round row „`close_round` bzw.
  `manage_settings`" → „`manage_rounds`" (opening a round is round management; the procedure is
  only snapshotted).
- [x] 8.3 `docs/SPEC-INDEX.md`: new row „**Rechte und Rollen-Rechtebündel**" → authoritative
  **`03-PRD.md` §4.0.1** (Rechtematrix); also `domain/identity.md` §2.1 (Rechtenamen, Bündel),
  `backlog/requirements/F1-requirements.md` FR-1.3, FR-1.8, FR-1.27, EC-1.7.
- [x] 8.4 `docs/review-log.md` §Offene-Punkte-Register: closed rows (role checks → stored
  permissions, F3 change 2b, 2026-10-01; moderator creates profiles and appoints/demotes, matrix
  amended 2026-10-01); open rows: (a) „`manage_rooms`
  ist für Bewohnende noch einzeln vergebbar (ebenso `create_application` und
  `change_application_state`), die Rechtematrix gibt ❌" — owner: change
  `role-permissions-contract`, which enforces their holders; (b) „Datenauskunft der Moderation *mit
  Einsicht*" — owner: the real export (G-D6, v0.2); (c) „Rechtebündel noch nicht exakt erzwungen
  (Expand/Contract)": die Untergrenzen der Haushalts- und Moderations-CHECKs auf die neuen Rechte
  folgen mit der Contract-Migration, sobald alle offenen Zweige `main` mit F3 change 2b
  übernommen haben — owner: change `role-permissions-contract`, before v0.1.; (d) „Rechtezuordnung je Rolle bleibt diskutierbar (menschliche Entscheidung, 2026-10-01)":
  Haushalts-Einstellungen einschließlich Abstimmungsverfahren und Quorum bleiben vorerst beim
  Haushalts-Account; ob das Abstimmungsverfahren als Rundeneinstellung zur Moderation wandert, ist
  offen. Eine Verschiebung braucht die Entscheidung in `03-PRD.md` §4.0.1, die Bündel-Definition
  und eine Migration, keine Prüfung im Code — owner: human, no deadline.
- [x] 8.5 `node tools/check-refs.ts` → 0 failures. No frozen file touched (Rule 4); no pointer from
  `docs/` into `openspec/` (Rule 7).

## 9. Apply 0029 to dev, as late as possible

- [ ] 9.0 Prerequisites, all done first: groups 1–8 complete, lints/`tsc`/unit tests green, and the
  orchestrator's local `/code-review high` findings fixed. After 0029 only verify, the browser
  walkthrough (it needs the backfill: Demo-WG Alex gains `manage_members` only through it), archive,
  push and PR remain.
- [ ] 9.1 Stop and tell the human, before applying, what `0029` does to branches without this change
  (any open WP branch): (1) no old-code **write** is refused on a test path, except an old-code
  demotion of a backfilled moderator (Demo-WG Alex); (2) but old-code **tests that assert a refusal
  0029 relaxes** fail on those branches' pre-push runs against dev, at least
  `membership-role-integrity.test.ts` "the household set is exact" (a missing `manage_settings` is
  now accepted), until they merge `main` with this change. Therefore apply 0029, verify, push and
  merge back-to-back, and tell the WP owners to merge `main` straight after. Wait for the go.
- [ ] 9.2 Apply `drizzle/0029_role_permissions.sql` to `flatmate-io-dev` (Supabase MCP
  `apply_migration`, never production). Check as the owner through the MCP (never `app_runtime`,
  which RLS hides rows from):
  - `pg_get_constraintdef` of the seven touched constraints shows the D2 literals: household floor
    `{manage_rooms}`, ceiling the eight + `manage_settings`; moderator floor the four; moderator-only
    three values; household-only one; administration six; resident-only `{vote}`; the resident set
    CHECK unchanged (`@> '{}'`);
  - live admin rows lacking any of the eight = 0 (they may also hold `manage_settings`);
  - live moderators lacking any of the six backfilled values or `manage_rounds` = 0;
  - live moderators holding `close_round` but not `manage_rounds` = 0; live household rows or
    moderators holding `manage_settings` but not `manage_voting_procedure` = 0;
  - live resident memberships lacking `vote` = 0; rows without `is_resident` holding `vote` = 0;
  - rows outside the two roles holding an administration value = 0; non-admins holding a
    household-only value = 0.
  If any check fails, stop and report. Never infer the statement simply has not run.

## 10. Verify and report

- [ ] 10.1 `npm run verify` → green. Report real totals and any flaky timeout by name, with a re-run
  of that file alone. Then push straight away (pre-push runs verify again).
- [ ] 10.2 `npx tsx scripts/lint/role-reads.ts` output, and `grep -rn "ResidentListActionDeniedError\|assertIsAdministration" src tests`
  → nothing.
- [ ] 10.3 Report: every file touched; every break run and its failure message, plus the ones
  argued; the 3.11 list; anything not done, stated plainly. Stop before the browser walkthrough
  (household account, Alex as moderator, Sam as resident on the Demo-WG): it is done with the
  human.

## 11. Handover for the contract step (no code in this change)

- [ ] 11.1 In the report, write the handover for change `role-permissions-contract`, for the
  orchestrator to put into the F3 plan: trigger = every branch open at this merge (F4's
  `feat/screening-pass`, each running Cursor WP branch) has merged `main`; content = a re-runnable
  migration that locks `membership`, backfills the household and moderator sets again (rows that
  old code created in the window), then sets the household CHECK to `@> HOUSEHOLD_PERMISSIONS AND
  <@ HOUSEHOLD_PERMISSIONS`, the moderator CHECK to `@> MODERATOR_PERMISSIONS` and the resident
  CHECK to `@> RESIDENT_PERMISSIONS` (`vote`); deletes
  the floors and the frozen old sets; strips every `REPLACED_PERMISSIONS` key (`close_round`, `manage_settings`) from every row,
  narrows the household ceiling back to the exact eight, and deletes `REPLACED_PERMISSIONS`; drops `checkFrom` from `manage_rooms` (administration CHECK) and from `create_application` /
  `change_application_state` (moderator-only CHECK); strips every organising permission still held by a plain
  member (count and report first); optionally adds the „plain resident ⊆ resident set" CHECK
  (design D2); moves the constants test back to
  the live sets; adds the raw-SQL refusals deferred from 7.7 (a moderator without `manage_members`, a
  household without `issue_password_reset_link`, a member holding `manage_settings` or `manage_rooms`,
  a live resident without `vote`, any row holding `close_round`, a plain member holding `create_application` or
  `change_application_state`); and syncs `openspec/specs/identity/permissions` (drop the
  transition paragraph and scenario).
