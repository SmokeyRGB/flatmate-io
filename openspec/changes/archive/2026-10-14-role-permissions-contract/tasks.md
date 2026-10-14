# Tasks

> **Order matters (design D5).** `0037` reaches `flatmate-io-dev` only in group 7, after the PR's CI
> `verify` (fresh stack built from `drizzle/`, 0037 included) and every review round are green, and
> the merge follows at once. Until then dev still **accepts** the states this change forbids, so
> every new refusal test fails against dev, and that is expected. As you go, run only
> `npx tsc --noEmit`, `npm run lint`, the lint scripts (`node scripts/lint/<name>.ts`), the pure unit
> tests (`tests/unit/**`) and the scratch-table replay tests
> (`tests/integration/raw-sql/role-permissions-*.test.ts`), which build their own table and do not
> depend on dev's constraints.
>
> **Hard floor:** G-C only tightens here. No G-D guarded test is touched (none of the files below
> is in `test/guarded.manifest.json`); if one turns out to be, stop and report. Never weaken an
> assertion to make a test pass. A case that cannot exist any more is replaced as design D4 says,
> and the replacement is named.
>
> **Deliberate breaks** are local and never touch dev (memory: DB breaks by assertion). For a
> replay test, edit the migration text it reads, see it fail, revert. For a refusal test the proof
> is the assertion's shape: SQLSTATE `23514` plus the exact `constraint_name`, on a fixture where
> that constraint is the only one violated or the first by name (Postgres reports the first
> failing CHECK in name order, design D4). Cases with several guards are **invariant guards** and
> say so in their comment; they get no prescribed break.

## 1. Preconditions

- [x] 1.1 Paste into the report: `git branch --no-merged origin/main` (expect empty), `gh pr list`
  (expect none), `git worktree list`. If a branch is unmerged, stop and report: the trigger is no
  longer met. No files.

## 2. Declaration (`src/modules/identity/schema.ts`)

- [x] 2.1 Delete `checkFrom` from the three `PERMISSIONS` entries and from the entry type;
  `permissionsHeldOnlyBy` loses its `checkFrom` filter and its comment. Delete
  `REPLACED_PERMISSIONS`, `RETIRED_PERMISSIONS`, `HOUSEHOLD_PERMISSIONS_AT_0024`,
  `MODERATOR_PERMISSIONS_AT_0027`, `MODERATOR_ONLY_PERMISSIONS_AT_0027`,
  `RESIDENT_PERMISSIONS_AT_0024`, `intersection`, the three `…_UNTIL_CONTRACT` constants and the
  "Expand/contract" comment block. Grep `src/ tests/ scripts/` for each deleted name and list every
  hit in the report (tests are fixed in groups 4–5).
- [x] 2.2 Rewrite the three set CHECKs on the live sets: household
  `revoked_at IS NOT NULL OR role <> 'household_admin' OR (permissions @> H AND permissions <@ H)`;
  moderator `… OR permissions @> M`; resident
  `revoked_at IS NOT NULL OR NOT is_resident OR permissions @> RESIDENT_PERMISSIONS`. Every comment
  names `drizzle/0037`; no "until the contract migration" wording is left in the file.
- [x] 2.3 Add `membership_declared_permissions`:
  `permissions <@ ${permissionArrayLiteral(Object.keys(PERMISSIONS))}`, with a comment (design D2:
  why this CHECK and not "plain resident ⊆ resident set"). Export a constant only if a test needs
  it, never a function (`data-inventory.ts` refuses exported functions in `schema.ts`).

## 3. Migration `drizzle/0037_role_permissions_contract.sql`

- [x] 3.1 `npx drizzle-kit generate --name role_permissions_contract`. Check that it produced
  `0037`, journal idx 37 and a snapshot, with only DROP/ADD CONSTRAINT statements for `membership`.
  Any other statement means schema drift: stop and report. Files: `drizzle/0037_*.sql`,
  `drizzle/meta/_journal.json`, `drizzle/meta/0037_snapshot.json`.
- [x] 3.2 Hand-write above the generated statements, per design D1 steps 1–5:
  - the `LOCK TABLE`;
  - the report `DO` block (five `RAISE NOTICE` counts a–e, before any change);
  - the `manage_settings → manage_voting_procedure` carry-over for live moderators (copy of 0029's);
  - the three backfills (household eight, moderator eleven, live `is_resident` `vote`), each
    `WHERE NOT permissions @> …`, sorted `DISTINCT`;
  - the strip of undeclared names from every row (`WHERE NOT permissions <@ declared`);
  - the reduction of live `role = 'member'` rows to `permissions ∩ RESIDENT_PERMISSIONS`.

  Then make every constraint statement `DROP CONSTRAINT IF EXISTS` + `ADD` (re-runnable), with the
  six constraints of design D1 step 6. **Every table reference is the quoted `"membership"`**,
  inside the `DO` block too (design D3: the replay test redirects only the quoted name). The header
  comment follows 0029's style: purpose, re-runnability, the order argued per statement, the
  rollback note. Literals equal the `schema.ts` constants (checked in 5.1).
- [x] 3.3 `node scripts/lint/migration-shape.ts` passes; the file has no `$1` placeholder.

## 4. Tests that build a now-illegal state (design D4)

Each task: rewrite, then run the file where it does not need dev's new constraints. The report
lists each case with its shape (P/C/D/U/F), what covers a removed case now, and for each prescribed
break that it was seen failing.

- [x] 4.1 **(P + C)** `tests/integration/policy/account-cannot-vote.test.ts`:
  - `stripVote` callers use the real `setMovedOut`. These are invariant guards; label them.
  - The in-flight test keeps a raw held `UPDATE`, now `revoked_at = now(), role = 'member',
    permissions = '{}'`. Its comment says the row is constructed, which production state it stands
    for, and why `setMovedOut` cannot be held there (`vote_guard` would refuse anyway, ~99–101).
    Assert `not_eligible`.
  - Break for the in-flight test: move `castVote`'s membership check before its transaction → a
    vote is recorded.
- [x] 4.2 **(P)** `tests/integration/deliberation/withdraw-vote.test.ts` (h),
  `awaiting-vote-counts.test.ts` and `candidate-detail.test.ts` (each `grantPermissions(…, [])`)
  call `setMovedOut`, assert today's code (`not_eligible` / empty map / the detail's refusal), and
  are labelled invariant guards. In `ranking.test.ts` the stripped case (~613) is deleted, naming
  the revoked case (~612–627) as its cover. Delete `grantPermissions` from `tests/helpers/pipeline.ts`
  if nothing calls it any more.
- [x] 4.3 **(D)** Remove the granted-member cases and name the 4.6 refusal that replaces each:
  - `application-capture.test.ts` 6.5 loses its success half (the plain-member refusal and
    "writes nothing" stay);
  - `organisation-application-visibility.test.ts` "a member granted only change_application_state";
  - `application-transition-guard.test.ts` (b), (c), and (i)'s granted-member half ((i)'s moderator
    half stays);
  - `member-create-and-invite.test.ts` "a caller without manage_join_codes".
- [x] 4.4 **(U)** A unit test (e.g. `tests/unit/casting/transition-rules.test.ts`, or the existing
  `transitions.ts` unit test if one exists) asserts that every backward edge of the rule table in
  `src/modules/casting/transitions.ts` `requires` `reverse_application_state`, and every forward
  edge does not. Break: drop it from one backward edge → fails.
- [x] 4.5 **(F)** Fixture fixes:
  - `tests/integration/raw-sql/membership-uniqueness.test.ts` ~48 and
    `tests/integration/raw-sql/password-reset-link.test.ts` ~205–215: live resident fixture
    `'{vote}'`, still expecting `23505`;
  - `tests/integration/raw-sql/membership-resident-pairing.test.ts` ~58: fixture `'{vote}'`, and the
    test asserts `constraint_name = membership_resident_pairing`;
  - `tests/integration/policy/casting-lock-order.test.ts` C6 (~368–371): the held demotion writes
    `CASE WHEN is_resident THEN ARRAY['vote'] ELSE '{}' END`, as
    `member-administration-revocation.test.ts` ~44–48 does.
- [x] 4.6 **Refusals** in `tests/integration/raw-sql/membership-role-integrity.test.ts`, each a direct
  `UPDATE` as `app_runtime` asserting SQLSTATE `23514` and the exact `constraint_name`, using the
  fixture list in design D4 (nine cases, incl. household + `reverse_application_state` for the
  ceiling). Convert or remove every "transition:"/"expand:" case in the file (~107–154, ~181–200,
  ~286–300, ~327–350 today); a removed case names its replacement. A case whose constraint is not
  first by name for its fixture is moved to a fixture where it is, or labelled an invariant guard.
- [x] 4.7 Dead branches, defence in depth (design D4): fix the comments at
  `src/modules/identity/repository.ts` ~446 and the castVote comment near
  `src/modules/deliberation/repository.ts` ~730 (no "stripped `vote`"; name
  `membership_resident_holds_role_permissions`); add a one-line comment at
  `src/app/(org)/members/actions.ts` ~55 saying the branch is unreachable while the matrix gives
  both permissions to the same roles. Add a pure unit case: `membershipHoldsPermission` on a row
  without `vote` → false (wherever its unit tests live, or a new
  `tests/unit/identity/membership-holds-permission.test.ts`). No behaviour change.
- [x] 4.8 `grep -rn "close_round\|manage_settings\|checkFrom\|UNTIL_CONTRACT\|_AT_002" src tests scripts`
  → only the history tests (5.1, 5.2, 5.3) and comments describing history may remain. Also grep
  `tests/` once more for `permissions:` / `set({ permissions` / `array_remove(permissions` /
  `'{}'` writes on the real `membership` table that 4.1–4.6 did not cover, and report each with its
  verdict (legal after 0037 or fixed).

## 5. Declaration and history tests

- [x] 5.1 `tests/unit/identity/role-permissions-constants.test.ts`:
  - live-constraint assertions on the live sets (household exact `[H, H]`, moderator `[M]`,
    resident `[vote]`, administration seven, moderator-only five, declared fourteen);
  - the frozen 0024/0027/0029 literals become local constants of the test;
  - a new case checks 0037's backfill/strip literals against the constants, that 0037 has no `$1`,
    and that every non-comment line naming the table uses the quoted `"membership"`.

  Break: drop `manage_rooms` from 0037's administration literal → fails.
- [x] 5.2 `tests/integration/raw-sql/role-permissions-backfill.test.ts`: frozen sets as local
  literals instead of the deleted imports (`:6-13`). Behaviour unchanged.
  (`reverse-permission-backfill.test.ts` imports nothing deleted: no change.)
- [x] 5.3 New `tests/integration/raw-sql/role-permissions-contract.test.ts`, following
  `role-permissions-backfill.test.ts`'s scratch-table pattern:
  - on a scratch table with 0029's constraints, seed the pre-contract shapes (design D3), then run
    0037's statements read from the file;
  - assert every row exactly afterwards: household = eight; moderator = eleven, plus
    `manage_voting_procedure` where it held `manage_settings`, plus `vote` if resident; plain
    member = `{vote}`; revoked = `{}`; nothing holds a retired name;
  - assert that a second run changes nothing (re-runnability).

  Break: delete the plain-member reduction from a local copy → the member keeps `manage_rooms`.
- [x] 5.4 `tests/unit/identity/permission-declarations.test.ts`: remove the 0029 carry-over test and
  the `RETIRED_PERMISSIONS` assertions; add "the four holder groups partition the declared
  permissions" (the exported group constants' sizes sum to `Object.keys(PERMISSIONS).length` and
  are pairwise disjoint). Break: move one entry's holders to `["moderator", "resident"]` locally →
  fails.

## 6. Local gate, PR (no dev migration yet)

- [x] 6.1 Run `npx tsc --noEmit`, `npm run lint`, every `scripts/lint/*.ts`, `npx vitest run
  tests/unit` and the replay tests of 5.2/5.3. All green.
- [x] 6.2 `/code-review high`, fix, then the orchestrator commits and pushes and opens the PR. The
  pre-push hook runs against dev without 0037, so the refusal tests fail there. Push with
  `--no-verify` **only after the human agrees in chat**; the PR body states it, with CI's
  fresh-stack `verify` as the gate (design D5).
- [ ] 6.3 CI `verify` (fresh stack, 0037 applied from `drizzle/`) green; every review round done.

## 7. Apply to dev and merge (human hand-off)

- [ ] 7.1 Repeat 1.1. From here to the merge, nobody pushes to `main`.
- [ ] 7.2 **Human:** apply `drizzle/0037_role_permissions_contract.sql` to `flatmate-io-dev` as
  owner (SQL editor, or the Supabase MCP on the human's go) and paste the NOTICE counts. Expected
  on 2026-10-14's data: (c) = 1, everything else 0.
- [ ] 7.3 **Applier checks the database**, never infers it: read-only queries showing (a) all six
  constraint definitions as written in 0037 (`pg_get_constraintdef`) and (b) 0 rows violating the
  report's five counts. If anything differs, stop and report.
- [ ] 7.4 `npm run verify`, alone on dev (no parallel session). Report the file and test counts.
  Rerun a failure alone once before calling it real.
- [ ] 7.5 Merge at once.

## 8. Specs, register, plan

- [x] 8.1 `docs/review-log.md` §Offene-Punkte-Register: close the two rows (*„`manage_rooms` ist für
  Bewohnende noch einzeln vergebbar …"* and *„Rechtebündel noch nicht exakt erzwungen
  (Expand/Contract)"*) in the register's own closing style, in German, naming `drizzle/0037`. No
  pointer into `openspec/` (Rule 7). Run `node tools/check-refs.ts`. Do this before 6.2 so the PR
  carries it.
- [x] 8.2 `/opsx:archive` syncs the delta into `openspec/specs/identity/permissions/spec.md`. In the
  same commit, delete the scenario "Until the contract step, a set missing the new values is
  accepted but grants nothing new" from the synced main spec. OpenSpec refuses to drop it inside a
  MODIFIED block, so the delta carries it with a "window closed" body. Check that no other
  "contract step" wording describes a still-open transition. Do this before 6.2 as well.
- [ ] 8.3 Report for the orchestrator: what changed, every test rewritten and its shape, every
  invariant-guard label, every deliberate break seen failing, the NOTICE counts.
