# Design

## Context

See `proposal.md` — Why. Three facts constrain the approach:

- **Every cleanup is two independent operations against two different systems.**
  `TestHousehold.cleanup()` runs one `withSessionContext` transaction (a single data-modifying-CTE
  `delete`, `tests/helpers/identity.ts:52-70`) and then one Supabase Auth admin `deleteUser`.
  `deleteTestAccount(id)` is the Auth call alone. Neither takes part in the other's transaction.
- **Nothing links the units.** The schema has zero foreign keys between these tables, stated in
  `tests/helpers/identity.ts:38-40` and already relied upon by the CTE delete, whose comment notes
  "with no FKs between these tables their order does not matter". Each cleanup is scoped to its own
  `household_id` or its own Auth user id.
- **The hook shape is uniform.** All 38 cleanup hooks are `zero or more deleteTestAccount(id)`
  followed by `one or two hh.cleanup()`, then resetting the module-scoped bindings to `undefined`.
  27 of them run more than one cleanup; the other 11 are a single `hh.cleanup()`. Two files
  (`register-session-setup-not-atomic.test.ts`, `claim-session-setup-not-atomic.test.ts`) prefix an
  unrelated `process.env.SESSION_TOKEN_HASH_SECRET` restore.

Concurrency is not new here: Vitest already runs these files in parallel workers, each with its own
postgres-js client (default pool of 10), so two concurrent transactions inside one hook stays well
inside the existing envelope.

## Goals / Non-Goals

**Goals:**

- No cleanup is skipped because an earlier one failed.
- A cleanup failure is still visible — the hook fails, with every failure attached.
- One helper, so the change is one line per file rather than a `try`/`catch` ladder pasted 27
  times.

**Non-Goals:**

- Retrying a failed cleanup, or any sweep of rows earlier runs already orphaned. Both are separate
  concerns; this change stops new orphans, it does not clean up old ones.
- Touching `testTimeout`, any assertion, any test title, or `test/guarded.manifest.json`.
- Changing what `cleanup()` itself deletes.

## Decisions

### D1 — `cleanupAll` takes started promises, not thunks

```ts
export async function cleanupAll(...tasks: Array<Promise<unknown> | undefined>): Promise<void>
```

Call sites read as one line:

```ts
await cleanupAll(...accountIds.map(deleteTestAccount), hhA?.cleanup(), hhB?.cleanup());
```

`undefined` entries are dropped, so `hhA?.cleanup()` on an unassigned binding is a no-op and the
existing `if (hhA)` guards disappear with it.

*Alternative — thunks (`Array<() => Promise<unknown>>`)*: rejected. It would let the helper choose
sequential execution later, but every call site pays `() =>` noise now for an option D2 declines to
take, and `accountIds.map(deleteTestAccount)` would become
`accountIds.map((id) => () => deleteTestAccount(id))`.

The one hazard of taking started promises is an unhandled rejection between construction and the
`await`. `Promise.allSettled` attaches handlers to all of them in the same synchronous turn as the
call, so there is no window in which a rejection goes unobserved.

### D2 — Run them concurrently

`Promise.allSettled` over all tasks. The units are independent (see Context), so concurrency is
safe, and it also drops the hook's wall time from the sum of its cleanups to the slowest one —
which directly relieves the pressure D3 addresses.

*Alternative — sequential with an error accumulator*: also correct, and marginally gentler on the
connection pool. Rejected because it keeps the hook's duration additive right where the budget is
the problem, and the pool has headroom (Context).

### D3 — `hookTimeout: 60000`, matching `testTimeout`

The number is chosen to restore the budget teardown had before it moved into a hook, not tuned to
an observed failure. Matching `testTimeout` also removes the trap entirely: no future reader has to
notice that two budgets exist and that only one of them was set.

*Alternative — a smaller explicit value such as 30000*: rejected. Any number below `testTimeout`
re-creates the same silent asymmetry in a smaller form, and there is no evidence that would justify
picking one.

The comment recording this sits next to the existing `testTimeout` comment and must state the
default it overrides (Vitest 5's 10000ms) and why, so this does not read as a bare threshold bump —
see the G-G1 note in `proposal.md`.

### D4 — `AggregateError`, thrown only when something rejected

`Promise.allSettled` never rejects, so the helper inspects the results and throws
`new AggregateError(reasons, "test cleanup failed")` if any are `rejected`. All reasons are carried,
not just the first.

*Alternative — `Promise.all`*: rejected outright; it rejects on the first failure, which is the
defect being fixed (the other tasks would still run, but their failures would be lost and, worse,
become unhandled rejections).

*Alternative — rethrow only the first reason*: rejected. Two households failing for two different
reasons is exactly the diagnostic this change exists to preserve.

### D5 — Ordering inside the hook is preserved where it is not a cleanup

The `process.env.SESSION_TOKEN_HASH_SECRET` restore in the two `*-not-atomic` tests stays a plain
statement before the `cleanupAll` call. It is not a cleanup task, it must not be concurrent with
anything, and it must run whether or not cleanup succeeds — so it keeps its current position at the
top of the hook.

### D6 — Hooks with exactly one cleanup are left alone

11 hooks are nothing but `if (hh) await hh.cleanup(); hh = undefined;`. There is no second task for
a failure to suppress and no second reason to aggregate, so `cleanupAll(hh?.cleanup())` would be
the same behaviour in different words. They are excluded, and they still get the D3 fix, which is
set once in the shared config.

This is also what keeps all four guarded files (G-D14, G-D15) out of the diff entirely — every one
of them has a single-cleanup hook. A guarded test not touched is strictly better than a guarded
test touched and argued to be equivalent.

*Alternative — rewrite all 38 for one uniform shape*: rejected. It trades 11 files of churn, four
of them guarded, for stylistic consistency. The resulting inconsistency is legible on its own
terms: `cleanupAll` appears exactly where more than one thing must be cleaned up.

## Risks / Trade-offs

- **A concurrent cleanup exposes a latent ordering dependency between two households** → The units
  are FK-free and `household_id`-scoped (Context), and the CTE delete already asserts order
  independence within one household. If this proves wrong, the failure is loud (the hook fails with
  an `AggregateError`), not silent, and D1's signature makes reverting to sequential a change inside
  the helper only.
- **A hook now fails where it previously passed**, because a cleanup error that was formerly masked
  by an earlier abort now surfaces → This is the intended behaviour, not a regression. If it fires
  on the first run it has found a real pre-existing cleanup bug, and that bug is reported, not
  silenced by weakening the helper.
- **The two shapes drift**, e.g. a single-cleanup hook later gains a second cleanup and keeps the
  sequential form → The reviewer's cue is the same as the rule: more than one cleanup means
  `cleanupAll`. Not mechanically enforced, and not worth a lint for 38 call sites.
- **`hookTimeout: 60000` lengthens the worst case of a genuinely hung cleanup from 10s to 60s** →
  Accepted, and identical to the trade-off already accepted for `testTimeout`: a bounded hang is
  preferable to a threshold that fails on CI variance rather than on a defect.

## Migration Plan

Single commit, tests only. `npm run verify` is the gate — eslint, the four lints under
`scripts/lint/`, `tools/check-refs.ts`, and the full Vitest suite against `flatmate-io-dev`.
Rollback is a straight revert; nothing here is stateful and no migration or production code is
involved.
