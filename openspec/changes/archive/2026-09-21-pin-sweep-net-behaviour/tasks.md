# Tasks

Scope: `tests/helpers/identity.ts`, `tests/setup.ts`,
`tests/integration/policy/sweep-abandoned-household.test.ts`, and the deletion of
`tests/unit/lint/hook-ordering.test.ts`. No `src/` change, no `vitest.config.ts` change, no
`test/guarded.manifest.json` change, and no change to what `cleanup()` deletes or to any per-file
`afterEach`.

## 1. Report what the sweep cleaned

- [x] 1.1 In `tests/helpers/identity.ts`, change `sweepAbandonedHouseholds()` to return
      `Promise<number>` — the number of households it actually cleaned (the count of fulfilled
      registrations it handed to `cleanupAll`, not the size of the drained set, which also counts
      rejected registrations that created nothing). Leave the `AggregateError` wrapping as it is.
      Verify: `npx tsc --noEmit` passes.
- [x] 1.2 In the same file, record that count in module state and export a reader for it
      (`design.md` D2) — the most recent sweep's count only, no history and no household ids.
      Comment that the reader exists because the sweep for test N runs after test N ends, so only
      test N+1 can observe it. Record the count on every sweep including a sweep that throws, so a
      failing cleanup does not leave a stale number behind. Verify: `npm run lint` and
      `npx tsc --noEmit` pass.

## 2. Assert the property

- [x] 2.1 In `tests/integration/policy/sweep-abandoned-household.test.ts`, add a pair of tests
      (`design.md` D1/D3): the first registers a household and cleans it up the normal way, through
      the file's own `afterEach`; the second asserts the last sweep cleaned **zero** households.
      Name it for the property, not the mechanism — it asserts that the sweep is a net beneath
      per-file teardown, not the primary cleanup path. Comment that a non-zero count means either
      the sweep now runs before per-file teardown, or a per-file hook failed to clean up — both
      worth failing on.
- [x] 2.2 Prove the assertion is not vacuous: temporarily force the inversion by running with
      `npx vitest run tests/integration/policy/sweep-abandoned-household.test.ts --sequence.hooks=list`
      and confirm the new assertion **fails** (the sweep reports 1). This works because the file's
      hook is registered at module scope, where `list` puts the setup hook first — verified while
      exploring this change. Revert to the default and confirm it passes again. Do not commit any
      config change.
- [x] 2.3 Confirm the existing abandoned-registration test in the same file still passes unchanged —
      the two properties must both hold, and 2.1 must not have disturbed the in-flight set the
      other test depends on. Verify:
      `npx vitest run tests/integration/policy/sweep-abandoned-household.test.ts`.

## 3. Correct the comments

- [x] 3.1 In `tests/setup.ts`, fix the overstated consequence. The current comment implies inversion
      would break cleanup; it would not, because `cleanup()` deregisters and is idempotent. State
      the real stake: the per-file teardowns would silently become dead no-ops and cleanup failures
      would be attributed to the sweep rather than the test that caused them. Point at the
      assertion from 2.1 as the thing that now detects it, rather than asserting the ordering as an
      unverified fact.
- [x] 3.2 Check whether `openspec/changes/archive/2026-09-21-sweep-inflight-test-households/design.md`
      D5 states the same overstated consequence. If it does, leave it untouched and say so in the
      report — an archived change is a frozen record of what was decided then, not a living
      document, and correcting it would falsify the history this project deliberately keeps. The
      correction belongs in this change's artifacts, which is where it already is.

## 4. Remove the proxy test

- [x] 4.1 Delete `tests/unit/lint/hook-ordering.test.ts` (`design.md` D4). Delete it outright — do
      not skip it, comment it out, or leave a narrowed version (G-G2). Verify: the file is gone and
      `npx vitest run tests/unit/lint` passes with the remaining lint tests.
- [x] 4.2 The commit message must carry the G-G1 reasoning for deleting a passing test: it is
      replaced in the same commit by a strictly stronger assertion about the property that matters,
      nothing red became green, and the net assertion count does not fall. A reviewer seeing the
      deletion alone would be right to object, so the history has to answer them.

## 5. Gate

- [x] 5.1 Confirm `git diff --name-only` (plus the deletion) lists only the four files in the scope
      note — no `src/`, no `vitest.config.ts`, no `test/guarded.manifest.json`, no per-file
      `afterEach` touched.
- [x] 5.2 Run `npm run verify` and confirm it passes.
- [x] 5.3 After the suite, confirm the run left no rows behind in `flatmate-io-dev`: all tenant
      tables and `auth.users` back to their pre-run counts. Query with a role not subject to RLS —
      reading through the policy layer with no session context raises
      `invalid input syntax for type uuid: ""` from a constant-folded policy predicate and tells you
      nothing about row counts. If any row remains, that is a finding to report, not something to
      paper over.
