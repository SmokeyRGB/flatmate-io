# Proposal

## Why

The archived change `move-test-teardown-to-aftereach` relocated household teardown from a
`finally` inside each `it()` into a module-scoped `afterEach`. Copilot's review of PR #9 found two
defects that relocation introduced, both of which orphan rows in the `flatmate-io-dev` Supabase
project — the exact failure the move was meant to end.

1. **The hook now runs on a 10s budget, not 60s.** `vitest.config.ts` sets `testTimeout: 60000`
   but never sets `hookTimeout`, and Vitest 5 defaults it to 10000ms
   (`node_modules/vitest/dist/chunks/index.DzobfTyw.js:14671`:
   `resolved.hookTimeout ??= resolved.browser.enabled ? 3e4 : 1e4;`). While teardown lived in the
   test body it spent the test's own 60s budget; in `afterEach` it gets 10s. That same config
   file's comment records that in CI "individual tests legitimately run 12-19s against the
   eu-west-1 project" — so a single household's cleanup (one DB round trip plus one Supabase Auth
   `deleteUser`) can plausibly exceed the hook budget on its own, and a hook that registers two
   households does so routinely. The hook is then aborted mid-teardown and the rows it had not yet
   reached are orphaned.

2. **Sequential cleanup lets one failure suppress the rest.** Of the 38 `afterEach` hooks that
   clean up, 27 run more than one cleanup, in sequence:
   `if (hhA) await hhA.cleanup(); if (hhB) await hhB.cleanup();`, often preceded by
   `for (const id of accountIds) await deleteTestAccount(id);`. A rejection anywhere in such a chain
   exits the hook and every later cleanup never runs. `tests/helpers/identity.ts:38-41` names this
   precise failure mode as the cause of the existing damage: "deleting the household alone orphaned
   the casting rows silently — which is how the production project accumulated 1.9k rooms and 1.5k
   rounds before anyone noticed."

## What Changes

- Set an explicit `hookTimeout` in `vitest.config.ts`, with a comment recording why (the same shape
  as the existing `testTimeout` comment).
- Add `cleanupAll(...tasks)` to `tests/helpers/identity.ts`: it `Promise.allSettled`s the
  non-`undefined` tasks handed to it and throws an `AggregateError` if any rejected, so every
  cleanup is attempted and no failure is swallowed.
- Rewrite the cleanup portion of the **27** hooks that run more than one cleanup into a single
  `cleanupAll(...)` call. No test body, assertion, or title changes.
- Leave the 11 hooks whose entire teardown is one `if (hh) await hh.cleanup();` untouched — a lone
  cleanup has nothing to suppress and nothing to aggregate, so rewriting it would be diff without
  a defect behind it (`design.md` D6).

**Not a G-G1 violation, stated explicitly.** G-G1 forbids "Zeitüberschreitungen hochsetzen, um
eine Instabilität zu verdecken". This raises no threshold that was ever deliberately chosen: the
10s hook budget was never a decision, it is Vitest's default that the previous change walked into
unnoticed when it moved work into a hook for the first time. The change restores the budget that
teardown already had on 2026-09-17 and that `testTimeout` still documents. It does not touch
`testTimeout`, and it hides no flake — a cleanup that genuinely hangs still fails the hook.

## Capabilities

No spec-level behaviour changes — this only changes how test teardown is scheduled and how its
failures are reported, not what the system under test does. `skip_specs: true` is set in this
change's `.openspec.yaml`, matching the precedent of the change whose defects it fixes.

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- **Affected code**: `vitest.config.ts`, `tests/helpers/identity.ts`, and 27 test files under
  `tests/integration/policy/`, `tests/integration/raw-sql/`, `tests/unit/casting/` and
  `tests/unit/identity/` (full list in `tasks.md`).
- **Guardrails touched**:
  - **G-G1** — addressed above: no threshold is weakened, and no test expectation changes.
  - **G-G3** — no CI check is disabled, relaxed, or removed; `npm run verify` and its four
    hand-written lints under `scripts/lint/` are untouched.
  - **G-D** — **no guarded test file is in the diff.** All four files backing a guarded invariant
    (`tests/integration/policy/household-account-identity.test.ts` and
    `tests/integration/raw-sql/session-immutable-profile.test.ts` for G-D14;
    `tests/integration/{policy,raw-sql}/round-visibility-household-account.test.ts` for G-D15) have
    single-cleanup hooks and therefore fall in the group D6 leaves alone. `hookTimeout` still helps
    them — it is set once, in the shared config. `test/guarded.manifest.json` is not edited, and
    nothing in it is marked `implemented` that is not already.
  - **G-C7** — the two-sided policy/raw-SQL pairing is unaffected; no test is added or removed on
    either side.
- **Dependencies**: none. `Promise.allSettled` and `AggregateError` are ES2021 built-ins, typed by
  the project's existing `"lib": ["dom", "dom.iterable", "esnext"]` and present as runtime globals
  on every Node version this project supports.
- **Assumption**: cleaning up two households concurrently is safe. The tables carry `household_id`
  as a bare uuid with **no** foreign keys between them (stated in `tests/helpers/identity.ts:38-40`
  and relied on by its existing single-statement CTE delete), each cleanup runs in its own
  transaction scoped to its own `household_id`, and the Supabase Auth users are distinct. Recorded
  here because it is the premise the parallel shape depends on.
