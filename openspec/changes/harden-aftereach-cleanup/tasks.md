# Tasks

Scope note: only the `afterEach` hook changes in each test file below. No `it()` body, assertion,
test title, import of a test subject, or `test/guarded.manifest.json` entry is touched. Each file's
existing `import { ... } from ".../helpers/identity"` gains `cleanupAll` (the relative path depth
varies by directory — reuse the one already in that file).

## 1. Config and helper

- [x] 1.1 In `vitest.config.ts`, add `hookTimeout: 60000` next to `testTimeout`, with a comment
      stating that Vitest 5 defaults it to 10000ms
      (`node_modules/vitest/dist/chunks/index.DzobfTyw.js:14671`), that teardown moved into
      `afterEach` on 2026-09-18 and so silently fell from the 60s test budget to that default, and
      that CI operations against eu-west-1 legitimately run 12-19s. Verify: `npx tsc --noEmit`
      passes and `npx vitest run tests/unit/audit/payload-allowlist.test.ts` still runs.
- [x] 1.2 In `tests/helpers/identity.ts`, export
      `cleanupAll(...tasks: Array<Promise<unknown> | undefined>): Promise<void>` — filter out
      `undefined`, `await Promise.allSettled(...)`, and if any result is `rejected` throw
      `new AggregateError(reasons, "test cleanup failed")`. Document in one comment why it takes
      started promises rather than thunks (`design.md` D1) and why concurrency is safe here (no FKs
      between the tables, each cleanup scoped to its own `household_id`, distinct Auth users).
      Verify: `npm run lint` and `npx tsc --noEmit` pass.

## 2. Two households, no resident accounts (9 files)

Each hook becomes `await cleanupAll(hhA?.cleanup(), hhB?.cleanup());` followed by the existing
`hhA = undefined; hhB = undefined;`.

- [x] 2.1 `tests/integration/policy/household-and-settings-scoping.test.ts`
- [x] 2.2 `tests/integration/policy/identity-household-scoping.test.ts`
- [x] 2.3 `tests/integration/policy/room-household-scoping.test.ts`
- [x] 2.4 `tests/integration/policy/session-household-scoping.test.ts`
- [x] 2.5 `tests/integration/raw-sql/household-and-settings-scoping.test.ts`
- [x] 2.6 `tests/integration/raw-sql/identity-household-scoping.test.ts`
- [x] 2.7 `tests/integration/raw-sql/room-household-scoping.test.ts`
- [x] 2.8 `tests/integration/raw-sql/round-household-scoping.test.ts`
- [x] 2.9 `tests/integration/raw-sql/session-household-scoping.test.ts`
- [x] 2.10 Verify the group: `npx vitest run tests/integration/policy/household-and-settings-scoping.test.ts tests/integration/raw-sql/session-household-scoping.test.ts`
      passes.

## 3. Two households plus a resident-account list (1 file)

Hook becomes `await cleanupAll(...accountIds.map(deleteTestAccount), hhA?.cleanup(), hhB?.cleanup());`
followed by the existing `accountIds.length = 0; hhA = undefined; hhB = undefined;`.

- [x] 3.1 `tests/integration/policy/round-household-scoping.test.ts`, then verify with
      `npx vitest run tests/integration/policy/round-household-scoping.test.ts`.

## 4. One household plus a resident-account list (11 files)

Hook becomes `await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());` followed by
the existing `accountIds.length = 0; hh = undefined;`. Passing `deleteTestAccount` straight to
`map` is safe — it takes a single `string`, so `map`'s index and array arguments are ignored.

- [x] 4.1 `tests/integration/policy/procedure-lock.test.ts`
- [x] 4.2 `tests/integration/policy/resident-list-access.test.ts`
- [x] 4.3 `tests/integration/policy/resident-list-audit.test.ts`
- [x] 4.4 `tests/integration/policy/room-round-authorization.test.ts`
- [x] 4.5 `tests/integration/policy/round-open-atomicity.test.ts`
- [x] 4.6 `tests/integration/policy/round-open-atomicity-orphan-draft.test.ts`
- [x] 4.7 `tests/unit/casting/quorum-denominator.test.ts`
- [x] 4.8 `tests/unit/casting/round-open-preconditions.test.ts`
- [x] 4.9 `tests/unit/casting/round-participant-list.test.ts`
- [x] 4.10 `tests/unit/identity/current-household-members.test.ts`
- [x] 4.11 `tests/unit/identity/moved-out-session-revocation.test.ts`
- [x] 4.12 Verify the group: `npx vitest run tests/unit/casting tests/unit/identity/current-household-members.test.ts tests/unit/identity/moved-out-session-revocation.test.ts`
      passes.

## 5. One household plus individually named account ids (4 files)

All named ids and the household go into the same `cleanupAll` call; no `deleteTestAccount` is left
awaited on its own line. Keep the existing resets to `undefined` that follow.

- [x] 5.1 `tests/integration/policy/founding-resident-permission.test.ts` (`firstAccountId`,
      `secondAccountId`)
- [x] 5.2 `tests/integration/policy/member-role-appointment.test.ts` (`accountId`,
      `memberAccountId`)
- [x] 5.3 `tests/integration/policy/resident-claim-flow.test.ts` (`residentAccountId`,
      `claimedAccountId`)
- [x] 5.4 `tests/integration/policy/settings-page-admin-guard.test.ts` (`memberAccountId`)
- [x] 5.5 Verify the group: `npx vitest run tests/integration/policy/founding-resident-permission.test.ts tests/integration/policy/member-role-appointment.test.ts tests/integration/policy/resident-claim-flow.test.ts tests/integration/policy/settings-page-admin-guard.test.ts`
      passes.

## 6. The two hooks that also restore an env var (2 files)

The `process.env.SESSION_TOKEN_HASH_SECRET` restore stays exactly where it is, as the first
statement of the hook — it is not a cleanup task and must not become concurrent with one
(`design.md` D5). Only the cleanup statements after it change.

- [x] 6.1 `tests/unit/identity/claim-session-setup-not-atomic.test.ts` — env restore, then
      `await cleanupAll(...accountIds.map(deleteTestAccount), hh?.cleanup());`, then the resets.
- [x] 6.2 `tests/unit/identity/register-session-setup-not-atomic.test.ts` — env restore, then
      `await cleanupAll(...accountIds.map(deleteTestAccount));`, then `accountIds.length = 0;`.
      This file has no `hh`; its household rows are deleted inline at the end of the `it()` body,
      which is out of scope here.
- [x] 6.3 Verify: `npx vitest run tests/unit/identity/claim-session-setup-not-atomic.test.ts tests/unit/identity/register-session-setup-not-atomic.test.ts`
      passes, and confirm by reading the diff that both hooks still restore the env var before
      anything else.

## 7. Gate

- [x] 7.1 Confirm `git diff --stat` lists nothing beyond the 27 test files above, `vitest.config.ts`
      and `tests/helpers/identity.ts` — in particular that the 11 single-cleanup hooks
      (`design.md` D6) are untouched, including the four guarded files
      `tests/integration/policy/household-account-identity.test.ts`,
      `tests/integration/raw-sql/session-immutable-profile.test.ts` and
      `tests/integration/{policy,raw-sql}/round-visibility-household-account.test.ts`.
- [x] 7.2 Confirm `git diff` shows no change to any `it(`/`describe(` title, any `expect(`, or
      `test/guarded.manifest.json`.
- [x] 7.3 Run `npm run verify` — eslint, the four lints under `scripts/lint/`, `tools/check-refs.ts`
      and the full Vitest suite against `flatmate-io-dev` — and confirm it passes.
- [x] 7.4 After the suite, confirm the run left no rows behind in `flatmate-io-dev`: the counts in
      `household`, `household_settings`, `account`, `membership`, `session`, `room` and
      `casting_round` should match their pre-run values. If any row remains, that is a finding to
      report, not something to paper over.

      Verified clean. All ten tenant tables (`household`, `household_settings`, `account`,
      `membership`, `session`, `resident_profile`, `room`, `casting_round`, `round_participation`,
      `application`) return 0, as does `auth.users` — so no orphaned Auth user either.

      The check has to bypass RLS to be meaningful. Counting as `app_runtime` through the pooler
      raises `invalid input syntax for type uuid: ""` from
      `household_settings_is_own_household`'s `current_setting('app.household_id', true)::uuid`:
      Postgres folds that constant at plan time, so it throws whether or not the table has rows,
      and `current_setting(..., true)` yields `''` rather than `NULL` on a pooled connection where
      the GUC was set and reset earlier. That error says nothing about row counts — it is not
      evidence of an orphan, and a future run of this check should query with a role that is not
      subject to the policy rather than try to read through it.
