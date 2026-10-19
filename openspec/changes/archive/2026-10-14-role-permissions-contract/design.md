# Design

## Context

2b (`openspec/changes/archive/2026-10-03-role-permissions`, design D2) split its membership CHECKs
expand/contract because `flatmate-io-dev` is shared. `drizzle/0029` (expand) is live. Its D2 table
names what the contract step tightens, and its task 11.1 is the handover this change works from.

State on 2026-10-14:
- `git branch --no-merged origin/main` is empty, and `gh pr list` shows no open pull request.
- Dev (read-only count, 71 memberships): 0 rows hold `close_round`/`manage_settings`; 0 live plain
  members hold an organising permission; 0 household or moderator rows are short of their set;
  **1 live resident lacks `vote`** (a test leftover of `stripVote`-style fixtures).
- Every writer in `src/` stores the live sets: `auth.ts` (registration `HOUSEHOLD_PERMISSIONS`,
  claim/join `RESIDENT_PERMISSIONS`, founding link `appointedPermissions(RESIDENT_PERMISSIONS)`),
  `repository.ts` (appointment, demotion, removal `[]`, reactivation `RESIDENT_PERMISSIONS`). No
  SQL function writes `membership.permissions`. **No `src/` code changes are needed beyond
  `schema.ts`.**
- The expand-era scaffolding lives in `schema.ts` (`checkFrom`, `REPLACED_PERMISSIONS`,
  `RETIRED_PERMISSIONS`, `…_AT_0024`, `…_AT_0027`, `…_UNTIL_CONTRACT`) and three tests
  (`role-permissions-constants`, `permission-declarations`, `raw-sql/role-permissions-backfill`).
- About a dozen tests on `main` build states the contract makes illegal (D4).

## Goals / Non-Goals

**Goals:** the exact sets and the full holder rule in the database; retired names gone for good;
the scaffolding deleted; every test still meaningful.

**Non-Goals:** any permission change, new permission or matrix move; `application-deletion`'s
`delete_application` (change 4 adds it on the finished pattern); production (stays at `0012`).

## Decisions

### D1 — Migration `0037_role_permissions_contract.sql`, one file, re-runnable

Generated with `drizzle-kit generate` from the new `schema.ts` (so journal and snapshot match),
then the data statements are hand-written above the generated CHECK statements. Order, argued
against the constraints live at each statement:

1. `LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE` (as 0024/0027/0029).
2. **Report** with one `DO` block: `RAISE NOTICE` the counts of (a) rows holding a retired name,
   (b) live plain members holding anything but `vote`, (c) live residents without `vote`,
   (d) live household/moderator rows short of their set, (e) rows holding any undeclared name. Nothing aborts: the handover says strip,
   counted and reported, not refuse.
3. **Rename carry-over again**, the 0029 statement for `manage_settings → manage_voting_procedure`
   on live moderators (a row old code wrote in the window). `close_round → manage_rounds` needs no
   statement: step 4 gives every live moderator `manage_rounds`.
4. **Backfills** (sorted `DISTINCT` unions, each `WHERE NOT permissions @> …`): household the
   eight; moderator the full eleven; live `is_resident` rows `vote`. Live at each: 0029's CHECKs.
   Unions only add values each group may hold, inside the household ceiling, so none refuses.
5. **Strips**: every name that is not declared, from every row (`permissions ∩ declared`, which
   removes `close_round` and `manage_settings` and any test leftover); live `role = 'member'` rows reduced to `permissions ∩ {vote}`. Removing a value violates
   no 0029 CHECK: the floors hold only values that are not stripped (household `manage_rooms`;
   moderator rows are not role `member`), and the household ceiling still contains
   `manage_settings`, which is only removed.
6. **Constraints**, each `DROP CONSTRAINT IF EXISTS` then `ADD`, with the literals of `schema.ts`:
   household exact (`@> H AND <@ H`); moderator `@> M` (all eleven); resident
   `revoked_at IS NOT NULL OR NOT is_resident OR permissions @> {vote}`; moderator-only +
   `create_application`, `change_application_state`; administration + `manage_rooms`; new
   `membership_declared_permissions` (`permissions <@` the fourteen declared names). Valid by 4–5.

On an empty table (CI's fresh stack runs `0000…0037` in order) every statement is a no-op but the
constraints. No `SECURITY DEFINER`, no `DROP COLUMN`: the agent harness does not refuse it, but
dev is shared, so it is applied by the owner path only on the human's go (D5).

`scripts/lint/migration-shape.ts` rules after `0017` hold: no enum value, no column, no function.

### D2 — `schema.ts` loses the scaffolding; one new CHECK; derivation must cover every permission

- Delete `checkFrom` (field and type), `REPLACED_PERMISSIONS`, `RETIRED_PERMISSIONS`, the frozen
  `…_AT_0024`/`…_AT_0027` sets, `intersection` and the three `…_UNTIL_CONTRACT` bounds.
  `permissionsHeldOnlyBy` drops its `checkFrom` filter.
- The household, moderator and resident CHECKs read the live sets.
- Add `membership_declared_permissions`, built from `Object.keys(PERMISSIONS)`.
- **Why the declared-names CHECK and not the handover's optional "plain resident ⊆ resident set"
  CHECK.** The latter catches only plain members. Retired names would otherwise stay storable on a
  moderator (its CHECK has no ceiling: the ⬜ grant `manage_voting_procedure` is legal there), and a
  name that grants nothing is still a lie in the data. With the declared-names CHECK plus full holder
  coverage (next bullet), a plain member can hold `vote` and nothing else, so the optional CHECK
  would be redundant.
- **Holder coverage.** `permissionsHeldOnlyBy` builds four groups by exact holder list. A future
  entry with an unforeseen holder combination (say `["moderator", "resident"]`) would fall into no
  group and get no CHECK. A unit test in `permission-declarations.test.ts` asserts that the four
  groups partition `Object.keys(PERMISSIONS)`.
- **`REPLACED_PERMISSIONS` is deleted, not emptied** (handover 11.1). The next rename brings the
  record back with its own expand/contract pair, and the archived 2b change shows how. Keeping an
  empty record plus its 0029-bound test would be scaffolding for a rename nobody has planned.
- The history constants move into the tests that replay old migrations (D3); `src/` keeps none.

### D3 — Constants and history tests

- `role-permissions-constants.test.ts`: the live-constraint assertions compare against the live
  sets (household exact, moderator full, resident `vote`, the six-then-seven administration group,
  the five-value moderator-only group, the declared names). The history pins for 0024/0027/0029
  keep working on frozen literals declared **in the test** (it already declares
  `MODERATOR_PERMISSIONS_AT_0024` that way). A new assertion reads 0037's backfills and strips
  against the constants, like the 0029 one.
- `raw-sql/role-permissions-backfill.test.ts` replays 0024/0027/0029 on a scratch table and
  imports the frozen sets from `schema.ts` today (`:6-13`); it gets the literals locally.
  `reverse-permission-backfill.test.ts` imports nothing from `schema.ts` and is unchanged. Both
  stay: CI rebuilds from `drizzle/`, so those files still run.
- A new `raw-sql/role-permissions-contract.test.ts` replays 0037's data statements on the same kind
  of scratch table (the existing `replaceAll('"membership"', TABLE)` pattern), seeded with the
  pre-contract shapes (old-code household `{manage_rooms, manage_settings}`, a moderator with the
  five old values plus `manage_settings`, a plain member with `close_round`, `manage_rooms`,
  `create_application`, a live resident with `{}`, a revoked row), and asserts every row
  afterwards, then that the constraints validate, then that a second run changes nothing. **That
  pattern only redirects the quoted name**, so 0037 quotes every reference as `"membership"`
  (task 3.2) and the constants test asserts that no unquoted `membership` occurs outside comments
  (task 5.1). Otherwise an unquoted statement would hit the real table, scoped by RLS to an empty
  household, and pass silently.
- `permission-declarations.test.ts`: drop the 0029 carry-over test and every `RETIRED_PERMISSIONS`
  use; add the partition test (D2).

### D4 — Each test that builds an illegal state is replaced, and says what covers it now

Rule: never delete a case without naming what covers it now. Pre-mortem finding: the first draft
called a hand-written revocation "the real path". It is not one: `setMovedOut`/`removeMember` also
end the sessions (`revokeMembershipForProfileTx`, `identity/repository.ts` ~925–950) and move
`resident_profile.status`. So the shapes are:

- **(P) Production path.** A test whose point is "a resident who lost the right is refused" calls
  the real `setMovedOut` (or `removeMember`). The error codes do not change: a revoked membership
  and a live one lacking `vote` both end in `readLiveMembershipTx` → null → `not_eligible` (or an
  empty map for the awaiting counts). These cases are refused by more than one guard
  (`vote_guard`'s `status = 'active'`, `drizzle/0028_vote.sql` ~148, and the participation reads
  as well). So they are **invariant guards**, labelled as such in their comment, with no
  prescribed break. Applies to `withdraw-vote` (h), `awaiting-vote-counts`, `candidate-detail`.
  `ranking.test.ts`'s stripped case is deleted: its revoked case (~612–627) already covers it,
  and the deletion names that case.
- **(C) Constructed state, labelled.** `account-cannot-vote`'s in-flight test needs a
  membership-only `UPDATE` to stay a regression test for the lock (its own comment ~99–101 says a
  held move-out is refused by `vote_guard` anyway). It keeps a raw `UPDATE`, now
  `revoked_at = now(), role = 'member', permissions = '{}'` (legal under every CHECK), and its
  comment says plainly that this row is constructed, which production state it stands for, and
  why the real path cannot be used. `stripVote` in the same file becomes `setMovedOut` (shape P).
- **(D) Database refusal.** "A plain member granted X succeeds" is now impossible. The success half
  goes; the refusal half (plain member, no grant) stays; and `membership-role-integrity.test.ts`
  gains the refusal (below). Applies to `application-capture` 6.5,
  `organisation-application-visibility` ("granted only change_application_state"),
  `application-transition-guard` (b), (c), and (i)'s granted-member half (pre-mortem: the guard
  checks `change_application_state` before the rule's `requires`,
  `casting/repository.ts:519`, so a plain member never reaches the backward rule, and (c)/(i)
  would collapse into (a)), and `member-create-and-invite` ("a caller without
  `manage_join_codes`"). (i)'s moderator half stays.
- **(U) Unit test on the declaration.** The rule "a backward move needs `reverse_application_state`"
  is now unrepresentable in data (every holder of the forward right holds the backward one), so it
  is proven on the rule table: a unit test asserts that every backward edge in
  `casting/transitions.ts` `requires` `reverse_application_state`. Break: drop it from one edge.
- **(F) Fixture fix only.** Three tests are refused by the new resident CHECK before they reach what
  they test. **Postgres checks CHECK constraints before it inserts index entries**, so:
  - `membership-uniqueness.test.ts` ~48 and `password-reset-link.test.ts` ~205–215 insert a live
    resident with `'{}'` and expect `23505`. They now get `23514`. Fixture → `'{vote}'`.
  - `membership-resident-pairing.test.ts` ~58 would still pass for the wrong reason (the resident
    CHECK refuses too). Fixture → `'{vote}'`, and the test asserts `constraint_name =
    membership_resident_pairing`.
  - `casting-lock-order.test.ts` C6 (~368–371) demotes a resident moderator to `'{}'`. Use
    `setMemberRole`'s shape (`CASE WHEN is_resident THEN ARRAY['vote'] ELSE '{}' END`), as
    `member-administration-revocation.test.ts` ~44–48 already does. The assertion is unchanged.

**Dead branches, kept as defence in depth and said so.** After 0037 two code branches cannot be
reached with legal data:
- `assertAccountCanVoteTx`'s `!membershipHoldsPermission(row, "vote")`
  (`identity/repository.ts` ~449). Every vote path refuses `profileId === null` first, and a live
  row with a profile always holds `vote`. Its comments (~446, and the castVote comment near
  `deliberation/repository.ts` ~730) drop "a stripped `vote`" and name
  `membership_resident_holds_role_permissions` as the database's half. Proof of the check itself:
  a pure unit case on `membershipHoldsPermission` (a row without `vote` → false).
- `members/actions.ts` ~55 (`holdsPermission(manage_join_codes)`): every holder of
  `create_resident_profile` now holds `manage_join_codes`. Kept: the matrix stays debatable
  (moving one of the two would revive it). Its comment says so.

**The refusals 2b deferred (its 7.7)** land in `membership-role-integrity.test.ts`, each asserting
SQLSTATE `23514` and the exact `constraint_name`. **Postgres reports the first failing CHECK in
name order**, so a refusal counts as proof of a constraint only when that constraint is the
**only** one the fixture violates, or the first by name among those it violates. Dropping it then
changes the result. Fixtures:
- moderator without `manage_members` → `membership_moderator_holds_role_permissions`;
- household without `issue_password_reset_link` → `membership_household_admin_holds_role_permissions`
  (floor);
- household + `reverse_application_state` → `membership_household_admin_holds_role_permissions`
  (ceiling: `household_admin…` sorts before `moderator_only…`);
- plain member + `manage_rooms`, plain member + `manage_voting_procedure` →
  `membership_administration_permissions`;
- plain member + `create_application`, + `change_application_state` →
  `membership_moderator_only_permissions`;
- live resident member with `'{}'` → `membership_resident_holds_role_permissions`;
- moderator + `close_round`, plain member + `close_round` → `membership_declared_permissions`.
  On a household row `declared…` sorts first too; there is no undeclared name only the household
  ceiling refuses, and the test says so.

The expand-era "transition:"/"expand:" cases in that file become refusals or are removed with
their replacement named. `membership-role-integrity.test.ts` ~76–81 (profile on the household row)
keeps `membership_admin_has_no_profile`, which sorts first.

### D5 — Applying to dev: last, after review, then merge at once

Pre-mortem finding: applying `0037` before the PR review opens a window of several Copilot rounds.
During it every push to `main` (CI `verify-hosted`) and every other checkout's pre-push `verify`
runs `main`'s old tests against the new CHECKs and fails. The PR's own CI `verify` job builds a
fresh database from `drizzle/`, `0037` included, so the PR can be reviewed and proven green
**without** dev. Order:

1. Open the PR; CI `verify` (fresh stack, 0037 applied) and every review round finish green.
2. Re-check `git branch --no-merged origin/main`, `gh pr list`, `git worktree list`. No push to
   `main` from here to the merge.
3. The human applies `0037` to dev (SQL editor, or the Supabase MCP on their go) and pastes the
   NOTICE counts. Expected today: (c) = 1, everything else 0.
4. Read-only check of the constraint definitions; `npm run verify` alone on dev.
5. Merge at once.

The local pre-push hook runs `verify` against dev, which still lacks 0037 before step 3, so the
pushes in step 1 fail the refusal tests. Push with `--no-verify` there, as CLAUDE.md allows, with
CI's fresh-stack `verify` as the gate. The PR body says so.

## Risks / Trade-offs

- **A stale worktree or a Cursor session runs old tests on dev after 0037** → its grants are
  refused loudly (a failed test, never a silent privilege). Mitigation: D5 step 2; the human may
  clean up merged worktrees first.
- **Test leftovers on dev with odd permission strings** → stripped by step 5 like the retired
  names, and counted first by step 2 (e). The count on 2026-10-14 found none.
- **Invariant guards instead of regression tests** (D4 P). Accepted: those refusals have several
  guards, and the labelled constructed case (C) keeps the lock regression.
- **Rollback** (a note, not a script): drop the new CHECK, re-add 0029's six. The data changes
  (backfills, strips) are not reverted. They only removed rights the matrix forbids and added rights
  the sets require.
