# Tasks

Scope: `tests/helpers/identity.ts` and `tests/setup.ts`, plus one new test file. No existing test
file is edited, no `src/` change, no `test/guarded.manifest.json` change, and neither `testTimeout`
nor `hookTimeout` moves.

## 1. Track in-flight registrations in the helper

- [x] 1.1 In `tests/helpers/identity.ts`, add a module-level `Set<Promise<TestHousehold>>` and have
      `registerTestHousehold()` add its own promise to it **synchronously, before any await**
      (`design.md` D1). This means splitting the current body: keep the existing async logic in an
      inner function, and make `registerTestHousehold` a non-async function that starts it, records
      the promise, and returns it. Attach a no-op `.catch()` to the recorded promise so a failed
      registration can never surface as an unhandled rejection. Verify: `npx tsc --noEmit` passes
      and `registerTestHousehold()` still returns `Promise<TestHousehold>` with an unchanged public
      shape (all existing call sites compile untouched).
- [x] 1.2 In the same file, make `cleanup()` deregister and idempotent (`design.md` D2): a
      `cleaned` flag that makes a second call a no-op, and removal of this household's entry from
      the set. Comment why both are needed — without deregistration the sweep would call
      `auth.admin.deleteUser` on an already-deleted user and fail every well-behaved test's
      teardown. Verify: `npm run lint` and `npx tsc --noEmit` pass.
- [x] 1.3 In the same file, export `sweepAbandonedHouseholds(): Promise<void>` — drain the set,
      `Promise.allSettled` the drained promises, and hand each fulfilled value's `cleanup()` to the
      existing `cleanupAll` (`design.md` D4). A rejected registration contributes no task. Give the
      `AggregateError` path a message that names the sweep, so a failure is not misread as the
      current test's own teardown failing. Verify: `npx tsc --noEmit` passes.

## 2. Install the safety net

- [x] 2.1 In `tests/setup.ts`, register a global `afterEach` that awaits
      `sweepAbandonedHouseholds()`. Comment that it sits *beneath* each file's own `afterEach`
      because Vitest resolves `sequence.hooks` to `"stack"`
      (`node_modules/vitest/dist/chunks/index.DzobfTyw.js:14599`), and that it is a net for
      abandoned registrations, not a replacement for per-file teardown (`design.md` D3). Verify:
      `npx vitest run tests/unit/casting/room-rename.test.ts` passes and its household is still
      cleaned by the file's own hook, not the sweep.

## 3. Pin the assumption

- [x] 3.1 Add `tests/unit/lint/hook-ordering.test.ts` (alongside the existing `tests/unit/lint/`
      tests) asserting that an `afterEach` registered before another runs after it — the `"stack"`
      ordering `design.md` D5 depends on. Keep it a pure in-memory test: register two `afterEach`
      hooks that push to an array and assert the order in a later test. It must touch no database
      and add no household. Verify: `npx vitest run tests/unit/lint/hook-ordering.test.ts` passes,
      and that it fails if `sequence.hooks: "list"` is set temporarily in `vitest.config.ts` (revert
      that experiment — do not commit it).

## 4. Prove the window is actually closed

- [x] 4.1 Add a test that reproduces the reported scenario without relying on a real 60s timeout:
      in a dedicated file, call `registerTestHousehold()` **without awaiting it**, let the test end,
      and assert in a following test that the household is gone — i.e. that the sweep cleaned a
      household whose registration resolved after its test had finished. Query for it through the
      household's own `SessionContext` once the promise resolves, and assert zero rows. This is the
      regression test for the whole change; without it nothing proves the net fires. Verify: the
      new test passes, and fails if the `afterEach` from task 2.1 is commented out.
- [x] 4.2 Confirm the sweep does not double-clean: run a file that cleans up normally
      (`npx vitest run tests/integration/policy/round-household-scoping.test.ts`) and confirm it
      passes with no `AggregateError` — that is task 1.2's deregistration working.

## 5. Gate

- [x] 5.1 Confirm `git diff --name-only` lists only `tests/helpers/identity.ts`, `tests/setup.ts`
      and the new test files — no existing test file, no `src/`, no `vitest.config.ts`, no
      `test/guarded.manifest.json`.
- [x] 5.2 Run `npm run verify` and confirm it passes.
- [x] 5.3 After the suite, confirm the run left no rows behind in `flatmate-io-dev`: all tenant
      tables and `auth.users` back to their pre-run counts. Query with a role not subject to RLS —
      reading through the policy layer with no session context raises
      `invalid input syntax for type uuid: ""` from a constant-folded policy predicate and tells
      you nothing about row counts (this cost a full investigation on the previous change). If any
      row remains, that is a finding to report, not something to paper over.
