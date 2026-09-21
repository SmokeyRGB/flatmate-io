# Design

## Context

See `proposal.md` — Why. Four facts shape the approach:

- **The binding is assigned after the await, so the hook cannot see an in-flight registration.**
  `hh = await registerTestHousehold()` — there is no point before resolution at which the test file
  holds anything cleanable. Any fix that lives in the test file is fixing the wrong layer.
- **The helper holds everything cleanup needs.** `TestHousehold.cleanup()` closes over the
  household's `SessionContext` and deletes through the policy layer. Nothing has to query for
  leftovers, which matters because `.env.example` allows only the `app_runtime` role (G-C2) and
  that role cannot read another tenant's rows to find them.
- **`setupFiles` hooks run last on the way out.** Vitest resolves `sequence.hooks` to `"stack"`
  (`node_modules/vitest/dist/chunks/index.DzobfTyw.js:14599`), which runs `afterEach` hooks in
  reverse registration order. `tests/setup.ts` is evaluated before the test file, so its hook is
  registered first and therefore runs last — beneath the per-file teardown rather than ahead of it.
- **The sweep is itself inside a hook.** It cannot exceed `hookTimeout` (60s), so it bounds the
  leak rather than removing it. This is a property of the environment, not of the design.

## Goals / Non-Goals

**Goals:**

- A household whose registration resolves after its test was abandoned is still cleaned up.
- The net catches a household left behind for any reason, not only this one.
- Zero changes to test files; the 38 existing `afterEach` hooks keep working unchanged.

**Non-Goals:**

- Eliminating the window. A registration outlasting both the test and hook budgets still escapes
  (`proposal.md`). Do not add a second timeout, a retry, or an unbounded wait to chase it.
- Sweeping rows orphaned by earlier runs, or searching the database for leftovers. Both need a
  role `.env.example` does not permit (G-C2).
- Covering resident Auth accounts created by `claimResidentProfile` and pushed into an
  `accountIds` array. They have the same shape of window, but the account's *rows* live under a
  household that this sweep does clean; only the Auth user itself could leak. Left alone
  deliberately — see Risks.

## Decisions

### D1 — Track the promise, not the result

`registerTestHousehold()` adds its own in-flight promise to a module-level `Set` synchronously,
before anything is awaited, and the sweep settles those promises rather than reading a resolved
value. This is the whole point: at the moment the hook runs, the promise is the only thing that
exists.

*Alternative — register the `TestHousehold` on resolve*: rejected, it closes nothing. The abandoned
registration resolves after the hooks have run, so a set populated on resolve is empty exactly when
it is read.

*Alternative — an `AbortSignal` / cancellation*: rejected. Neither `@supabase/supabase-js`'s admin
client nor `postgres` exposes cancellation that would unwind a half-written registration, and a
partially-aborted registration is a worse leak than a completed one.

### D2 — `cleanup()` deregisters itself and becomes idempotent

`cleanup()` removes its entry from the set and returns early if it has already run. Both are needed
and for different reasons: deregistration keeps the sweep from re-cleaning a household the test
already handled, and idempotence makes a double call harmless if the two ever interleave.

Without this the sweep would call `auth.admin.deleteUser` on an already-deleted user, which
rejects, which `cleanupAll` correctly turns into an `AggregateError` — a failing hook on every
well-behaved test. The DB half would be harmless (the `delete` matches no rows); the Auth half
would not.

*Alternative — let the sweep swallow errors*: rejected outright. A sweep that ignores failures is
how the original problem stayed invisible; the diagnostic is the point.

### D3 — The sweep is a global `afterEach` in `tests/setup.ts`

Per-test, not per-file. `afterEach` is the earliest point at which the abandoned test is definitely
over, and it keeps at most one leaked household in flight at a time.

*Alternative — `afterAll`*: rejected. It runs once per file, so within a file an early leak would
sit until the end; and for a single-test file it is no earlier than `afterEach` anyway.

*Alternative — Vitest `globalTeardown`*: rejected. It runs in the main process, not the worker, so
the worker's module-level set is not visible to it. It would need a database sweep, which needs a
role G-C2 forbids.

### D4 — The sweep reuses `cleanupAll`

The sweep settles the pending promises, maps each fulfilled one to `value.cleanup()`, and hands
them to the existing `cleanupAll`. Same aggregation, same failure reporting, no second cleanup
path to keep in step with the first. A rejected registration needs nothing cleaned — it never
created a household — so it contributes no task.

### D5 — A test pins the hook ordering

`sequence.hooks: "stack"` is a Vitest default this design depends on; a future upgrade could change
it and the net would silently move above the per-file teardown instead of below it, making the
sweep fight the tests it protects. `tasks.md` adds a small unit test asserting the observed order.
This is cheap, and the alternative — setting `sequence.hooks` explicitly in `vitest.config.ts` —
pins a global that affects every hook in the suite to protect one.

## Risks / Trade-offs

- **The sweep cleans a household a still-running test legitimately owns** → Not reachable.
  `afterEach` runs only after the test has ended, and a household still owned by a live test has
  not been abandoned. The only way to reach it would be a test that deliberately keeps a household
  across tests, which no test does (every binding is reset to `undefined` in its own hook).
- **The sweeping hook is itself abandoned at `hookTimeout`** → Accepted and documented; this is the
  residual window named in the proposal. It is strictly smaller than today's.
- **Resident Auth users created via `claimResidentProfile` keep the same window** → Accepted. Their
  DB rows are swept with the household; only the Auth user itself can leak, and only under the same
  double-timeout. Extending the registry to cover them is a larger change to
  `claimResidentProfile`'s own call sites and is not justified by the remaining exposure. Recorded
  here so it is a known gap rather than an oversight.
- **A leaked household's cleanup now runs inside an unrelated test's teardown**, so a failure is
  reported against a test that did nothing wrong → Mitigated by the `AggregateError` message naming
  the sweep, so the report is legible rather than misleading.

## Migration Plan

Single commit, tests and test setup only. `npm run verify` is the gate. Rollback is a straight
revert: the per-file hooks are untouched and keep working exactly as they do today, so reverting
restores the current behaviour rather than a broken intermediate.
