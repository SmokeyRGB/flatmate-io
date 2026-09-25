## Why

`docs/GUARDRAILS.md` **G-D15** requires that a session with `app_profile_id() IS NULL` gets no
value derived from `Application`, *„Über die Policy-Schicht **und** direkt gegen die Datenbank unter
der Anwendungsrolle"*. Only the policy-layer half exists. The `application` table's one RLS policy,
`application_household_isolation` (`drizzle/0000`, `0001`), is keyed on `app.household_id` alone, so
raw SQL as `app_runtime` inside a household-account session can run `SELECT count(*) FROM
application`. That count is the number ADR-014 names as enough to defeat V-1 through the shared
household password: *„genau diese eine Zahl reicht, um V-1 über den geteilten Zugang auszuhebeln"*.
The manifest still lists G-D15 as `implemented`, because the existing raw-SQL test
(`tests/integration/raw-sql/round-visibility-household-account.test.ts`) only checks that
`casting_round` has no cached aggregate column. It never queries `application`.

Found 2026-09-24 while planning `start-screen` (its design.md, Decision 9). It has to be fixed now:
F3 is the first slice that reads applications on a screen, and without this fix the only thing
keeping the household account away from them is repository code.

## What Changes

- **New RESTRICTIVE RLS policy on `application`**, `FOR ALL`: a row is visible or writable only when
  the session carries a resident profile. The predicate is written as `nullif(current_setting(
  'app.profile_id', true), '') IS NOT NULL`, the same expression as `docs/domain/invarianten.md`
  §5.5's `app_profile_id()`. The `nullif` matters: on a pooled connection that has run a resident
  transaction before, the unset setting reads `''`, not `NULL`. `tests/integration/raw-sql/
  pool-reuse.test.ts` already accepts both values.
- **The same restriction on `activity_event` rows with `subject_type = 'application'`**, `FOR
  SELECT` only. `application.state_changed` events carry `fromState`/`toState` for each
  application, so a household-account session could count applications and see their states from
  the audit log. The brief did not name this path. It is included because it is the same leak by a
  sibling route (design Decision 3; human decision 2026-09-24).
- **`round_participation` is deliberately left alone** (design Decision 2). It holds no data derived
  from `Application`, and the household account writes it itself when it opens a round, and through
  the `auto_join_open_rounds` trigger. A restrictive policy would break both.
- **Policy layer:** `getApplication` returns `null` and `transitionApplication` throws a named
  `ProfileRequiredError` for a profile-less session, before the query runs. A refusal then carries its
  own error, instead of *"Application not found"* reached because RLS hid the row.
- **Tests, both sides (G-C7):** new policy-layer and raw-SQL G-D15 tests that seed applications and
  application events, then assert the **count** is zero in a household-account session. This
  includes the `''`-valued setting, reached deterministically. Both files are added to G-D15's
  `testFiles` in `test/guarded.manifest.json`.
- **Teardown fix-ups:** three existing teardown sites delete `application` rows under a
  profile-less context. After this change those deletes match zero rows and return no error, so the
  rows would be orphaned. The sites are `cleanupHousehold` in `tests/helpers/identity.ts`, which
  `makeCleanup`, the global sweep and two tests all go through, and the `afterEach` of two guarded
  files (see Impact). Only teardown changes. No assertion changes.
- **Record the finding** in `docs/review-log.md` §Offene-Punkte-Register, together with the human
  decision on retention (2026-09-24). After a concluded round's retention period expires, its
  applications are deleted automatically unless an extension was requested. That deletion runs on a
  system path, never in a household-account session. The household account is only told that the
  round's retention expires and that the applications will then be deleted, never how many (design
  Decision 5).

No **BREAKING** change to any route: no route reads `application` today.

## Capabilities

### New Capabilities
- `casting/household-account-visibility`: what a household-account session can and cannot see of a
  round and its applications. The already-built policy-layer behaviour (`getRoundForSession`,
  `listRoundsForSession`, `getRoundParticipants`) is recorded lazily, together with the new
  database-level enforcement on `application` and on application audit events. Sources: G-D15,
  ADR-014.

### Modified Capabilities
None. No capability under `openspec/specs/` covers casting yet.

## Impact

- **Guardrails touched:** **G-C** (the visibility invariant itself; G-C7's two-sided testing), **G-D15**
  (strengthened, never weakened: tests only added), **G-C8** (relies on `SET LOCAL` only in
  `src/db/session-context.ts`, unchanged). G-L: not touched.
- **Guarded files edited, teardown only, approved by the human 2026-09-24:**
  `tests/unit/audit/backward-transition.test.ts` (G-D3) and `tests/unit/audit/payload-allowlist.test.ts`
  (G-D7, G-D8). Each `afterEach` switches its delete context from `profileId: null` to a synthetic
  profile. No `it` block, assertion or seeded value changes.
- **Code:** `src/modules/casting/schema.ts`, `src/modules/audit/schema.ts`,
  `src/modules/casting/repository.ts`, `tests/helpers/identity.ts` (cleanup CTE context),
  one new migration `drizzle/0018_*.sql` plus its snapshot and journal.
- **Not affected, contrary to the brief's expectation:** `scripts/seed-demo-household.ts` writes no
  applications. `tests/integration/policy/household-scoping.test.ts` and its raw-SQL twin already
  insert with a resident `profileId`. No `SECURITY DEFINER` function reads `application`
  (`drizzle/0005`, `0013`, `0014`, `0015` checked).
- **Assumptions recorded, not resolved:** "resident profile present" means `app.profile_id` is set.
  It does not check that the profile exists or is active: G-D15 is stated on `app_profile_id() IS
  NULL`, and the session's profile comes from `session.acting_profile_id`, which is immutable (G-D14).
  Checking existence would be a different invariant (design Decision 1).
