# Proposal

## Why

Review of PR #9 (`pullrequestreview-5248741824`) found a teardown window that
`move-test-teardown-to-aftereach` and `harden-aftereach-cleanup` both leave open:

> "`afterEach` cannot reliably clean up a test that times out while `registerTestHousehold()` is
> still pending: the hook observes `hh` as undefined, finishes, and the abandoned test can later
> resolve and assign the household with no subsequent hook to remove it."

The mechanism is confirmed. Every affected test is written as `hh = await registerTestHousehold();`
— the module-scoped binding is assigned only once the promise resolves. If the test's 60s budget
expires while that call is still in flight, Vitest fails the test and runs `afterEach`, which reads
`hh` as `undefined` and cleans nothing. JavaScript cannot cancel the outstanding call, so the
registration completes afterwards: a real Household, HouseholdSettings, Account, Membership and a
real Supabase Auth user, assigned into a variable that no hook will look at again. For the last
test in a file there is no later hook at all; for any earlier test the stale assignment races with
the next test's own, and whichever loses is orphaned.

This is narrower than the defects already fixed — it needs `registerHousehold()` alone to exceed
60s, not merely the test as a whole — but it is the same failure the two previous changes were
written to end, and this project has the history to justify closing it:
`tests/helpers/identity.ts` records 1.9k rooms and 1.5k rounds accumulated unnoticed, and
`tests/setup.ts` records ~15k `activity_event` rows written into the production project in two days,
rows that FR-0.13 makes append-only and therefore permanent.

## What Changes

- `registerTestHousehold()` registers its own in-flight promise in a module-level set **before**
  awaiting anything, and `cleanup()` removes itself from that set and becomes idempotent.
- `tests/setup.ts` gains a global `afterEach` that settles and cleans whatever is still in that
  set. Because Vitest defaults `sequence.hooks` to `"stack"`
  (`node_modules/vitest/dist/chunks/index.DzobfTyw.js:14599`), a hook registered from `setupFiles`
  runs **after** each file's own `afterEach` — so this is a net beneath the existing per-file
  teardown, not a replacement for it.
- No test file changes. No change to what `cleanup()` deletes.

**What this does not claim.** It shrinks the window rather than eliminating it. A registration that
outlasts both the 60s test budget *and* the 60s hook budget still escapes, because the sweeping
hook is itself subject to `hookTimeout`. Nothing short of cancellation closes that last sliver, and
the Supabase and postgres clients offer none. The change is worth making because it converts "any
hang during registration leaks" into "only a hang longer than both budgets leaks", and because the
same net catches a household that a test forgets to clean up for any other reason.

**Why not the shape the review suggests.** The review proposes tracking the in-flight registration
at the call sites ("coordinate setup and teardown"). That would put bookkeeping in 38 test files to
solve a problem the helper already has the information to solve, and it would still race, because
the call site cannot observe a promise it has not yet been handed. The helper creates the
household, so the helper tracks it — once.

## Capabilities

No spec-level behaviour changes: this changes when and by whom test teardown runs, not what the
system under test does. `skip_specs: true` is set in this change's `.openspec.yaml`, as in the two
changes it follows.

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- **Affected code**: `tests/helpers/identity.ts` and `tests/setup.ts`. Two files, no test file
  touched, no `src/` change.
- **Guardrails touched**:
  - **G-D** — no guarded test file is in the diff, and `test/guarded.manifest.json` is not edited.
    The new hook applies to every test file including the four guarded ones, but through
    `setupFiles`, without editing them.
  - **G-G1** — no assertion, expectation, test title or threshold changes. `testTimeout` and
    `hookTimeout` both stay at 60000.
  - **G-G3** — no check is disabled or relaxed; `npm run verify` is unchanged.
  - **G-B1** — unchanged: the sweep reuses each household's own `cleanup()` and its existing
    `SessionContext`. No new test data, and no new email or identifier convention.
  - **G-C2** — relevant and deliberately respected. A sweep that searched the database for leftover
    rows would need a role that bypasses RLS, and `.env.example` permits only `app_runtime`
    ("Connect as app_runtime, never postgres — G-C2"). This design needs no such role and no new
    credential: it holds each household's own `SessionContext` in memory and deletes through the
    policy layer exactly as `cleanup()` already does.
- **Dependencies**: none. Uses `afterEach` from Vitest, already used throughout the suite.
- **Assumption**: a hook registered in a `setupFiles` module runs after the hooks a test file
  registers, under Vitest's default `"stack"` ordering. Verified against the resolved default in
  the installed Vitest 5.0.1, and `tasks.md` includes a test that pins the behaviour so a future
  Vitest upgrade cannot silently invert it.
