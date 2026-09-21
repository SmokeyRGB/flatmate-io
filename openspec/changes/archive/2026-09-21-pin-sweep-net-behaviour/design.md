# Design

## Context

See `proposal.md` — Why, including the measured ordering table. Three facts shape the approach:

- **The property is observable without knowing how Vitest orders hooks.** If the per-file teardown
  ran first, it cleaned the household and deregistered it, so the sweep that follows drains an empty
  set. If the sweep ran first, it finds the household and cleans one. The count the sweep reports is
  therefore a direct readout of the ordering, in terms of the behaviour that matters.
- **`sweepAbandonedHouseholds()` currently returns `void`.** It already computes the list it cleans;
  reporting the size costs nothing.
- **Module state is per test file.** Vitest isolates by default, so a counter in
  `tests/helpers/identity.ts` is scoped to the file observing it. No cross-file interference, and
  parallel workers cannot see each other's counts.

## Goals / Non-Goals

**Goals:**

- The suite fails if the sweep ever becomes the primary cleanup path instead of the net.
- The assertion holds regardless of *why* ordering changed — a Vitest default, a change to how
  `setupFiles` hooks attach, or someone reordering `setupFiles`.
- Comments state the real stake, so the next reader protects the right thing.

**Non-Goals:**

- Pinning `sequence.hooks` or any other Vitest internal, in a test or in `vitest.config.ts`.
  Setting it explicitly would freeze a global affecting every hook in the suite to protect one
  property that is better asserted directly.
- Changing the sweep's behaviour, the per-file hooks, or what `cleanup()` deletes. This change is
  about what the suite *asserts*, not what it does.

## Decisions

### D1 — Assert the behaviour, not the mechanism

The replacement assertion is: after a test that registered a household and cleaned it up normally,
the sweep cleaned **zero** households.

```
  normal test ends
        |
        v
  per-file afterEach --> hh.cleanup() --> deletes rows, deregisters
        |
        v
  setup.ts afterEach --> sweep drains {} --> cleaned 0   <== asserted
                                            ^
                                            |
              under inversion this would be 1, and the assertion fails
```

*Alternative — marker plumbing (the review's first option)*: have `tests/setup.ts` push a marker
into a shared array, have a test file's hook push its own, assert the sequence. It works, but the
markers exist only to be observed, and it still pins ordering rather than the property ordering
protects.

*Alternative — narrow the comments (the review's second option)*: keeps a passing test that pins a
Vitest internal nothing depends on for correctness. Rejected as a test with no stake; if inversion
is only a diagnostics regression, then the thing to detect is the diagnostics regression, which is
exactly what D1 detects.

### D2 — `sweepAbandonedHouseholds` returns the count; the helper remembers the last one

The function returns `Promise<number>`. The helper also records that number in module state and
exposes a reader, because the assertion has to run in a *later* test than the sweep it observes —
the sweep for test N runs after test N ends, so only test N+1 can read it. The return value alone
cannot bridge that gap, since `tests/setup.ts` is what calls the sweep, not the test.

Keep the recorded value to exactly what the assertion needs: the count from the most recent sweep.
Not a log, not a history, not the household ids.

*Alternative — export the in-flight set for tests to inspect*: rejected. It exposes mutable internal
state that a test could corrupt, to answer a question the count already answers.

### D3 — The assertion lives with the sweep's other test, not in `tests/unit/lint/`

`tests/integration/policy/sweep-abandoned-household.test.ts` already exercises the sweep, and this
is a second property of the same mechanism. Putting both in one file keeps the sweep's contract in
one place and means the new assertion sits in a file that genuinely registers a household — which it
must, since the property is about a household being cleaned by the right hook.

`tests/unit/lint/` is for checks over the repo's own source (`check-refs`, `guarded-tests`,
`session-context`); a hook-ordering test never belonged there.

*Alternative — a third file*: rejected, no reason to spread one mechanism across three files.

### D4 — Delete `tests/unit/lint/hook-ordering.test.ts` outright

Not narrowed, not skipped, not left as a weaker assertion. Once D1 asserts the property, the proxy
has nothing left to add: it would keep pinning a Vitest default that, as `proposal.md` shows, is
neither necessary nor sufficient for the guarantee. G-G2 forbids leaving a disabled test behind, so
removal is the only honest option.

The G-G1 reasoning for deleting a passing test is in `proposal.md` — Impact, and must be restated in
the commit message so the deletion is defensible from the history alone.

## Risks / Trade-offs

- **The assertion silently becomes vacuous** if the test it follows stops registering a household —
  it would then assert 0 against a sweep that had nothing to do either way → The test that precedes
  it registers a household as its whole purpose, and both live in the same file where that is
  evident. `tasks.md` requires verifying the assertion actually fails under inversion, which a
  vacuous test could not do.
- **A leaked household from an earlier test in the same file would make the count non-zero** and
  fail the assertion spuriously → That is a true positive, not a false one: it means a per-file hook
  failed to clean up, which is exactly what the assertion is for. The other tests in this file clean
  up normally.
- **Deleting a test is the shape of a G-G1 violation** even when it is not one → Mitigated by
  recording the reasoning in the proposal and the commit message, and by the replacement landing in
  the same commit. A reviewer seeing the deletion alone would be right to object; seeing both, the
  net assertion count does not fall.

## Migration Plan

Single commit, tests and test helpers only. `npm run verify` is the gate. Rollback is a straight
revert; the sweep and all per-file teardown are untouched, so reverting restores exactly today's
behaviour.
