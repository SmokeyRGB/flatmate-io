# Proposal

## Why

`tests/unit/lint/hook-ordering.test.ts`, added in 3a7b333, does not test what its title and
comments claim. Review of PR #9 put it plainly:

> "This regression test only registers and observes two `afterEach` hooks in the same test file. It
> never includes the `tests/setup.ts` sweep hook or a per-file teardown marker, so it cannot detect
> the failure the surrounding comments claim to guard against (the global sweep running before file
> teardown due to setup/suite ordering). Either make the test exercise both hooks' relative order or
> narrow the comments/title to the local hook-ordering fact it actually verifies."

Investigation confirms the finding and turns up a second defect the review did not name.

**The claim is true; the test is a proxy for it.** Run against the installed Vitest 5.0.1, a hook
registered in a `setupFiles` module does run after a hook registered in a test file — for both
top-level and `describe`-scoped registration. But forcing `sequence.hooks: "list"` shows the
guarantee rests on two different mechanisms:

```
                          stack (default)     list (forced)
  hook registered at a test file's module scope
  -> lands in the same suite as the setup file's hook
     setup file  (registered 1st)   runs 2nd  |  runs 1st   <-- INVERTS
     test file   (registered 2nd)   runs 1st  |  runs 2nd

  hook registered inside describe() in a test file
  -> nested suite; inner runs before outer regardless
     test file   (inner)            runs 1st  |  runs 1st   <-- holds
     setup file  (root)             runs 2nd  |  runs 2nd
```

The existing test registers two hooks in one `describe` and asserts the second runs first. That
would indeed fail if `sequence.hooks` flipped, so it is not worthless — but it measures
within-suite reversal, which the table shows is a different property from setup-file-vs-test-file
ordering. A future Vitest that changed how `setupFiles` hooks attach would break the real guarantee
while this test kept passing.

**The stated consequence is also wrong.** Both the test's comment and `tests/setup.ts` say an
inverted order would mean "the global sweep would silently move above per-file teardown instead of
below it", which reads as breakage. It is not: `cleanup()` deregisters and is idempotent, so a
sweep running first would clean the household and every per-file `hh.cleanup()` would be a harmless
no-op. Nothing leaks. The real cost of inversion is that the ~36 module-scope per-file teardowns
become dead no-ops, and every cleanup failure is attributed to the sweep instead of to the test that
caused it — a diagnostics regression, not a correctness one. Stating a stake higher than the real
one is its own defect: it invites the next reader to protect the wrong thing.

## What Changes

- Replace `tests/unit/lint/hook-ordering.test.ts` with a behavioural assertion in the suite that
  actually depends on the property: **after a normal, well-behaved test, the sweep finds nothing to
  clean.** That is the invariant worth holding — the sweep is a net, not the primary cleanup path —
  and it fails under inversion, because a sweep running first would have cleaned the household.
- Expose the minimum needed to observe it: `sweepAbandonedHouseholds()` reports how many households
  it cleaned, and the helper exposes the last sweep's count for a test to read.
- Correct the overstated comments in `tests/setup.ts` and in the surviving test to name the real
  stake (dead per-file hooks and misattributed failures), not a leak.

**Why not either option the review offers.** "Make the test exercise both hooks' relative order"
still pins a Vitest mechanism, just a more elaborate one, and would need marker plumbing whose only
purpose is to be observed. "Narrow the comments to the local fact" keeps a test that pins a Vitest
internal nothing depends on for correctness — a test with no stake. Asserting the behaviour
directly is smaller than the first and more useful than the second, and it needs no knowledge of
how Vitest orders anything.

## Capabilities

No spec-level behaviour changes: this corrects a test and two comments about test infrastructure.
`skip_specs: true` is set in this change's `.openspec.yaml`, as in the three changes it follows.

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- **Affected code**: `tests/helpers/identity.ts` (report the sweep count), `tests/setup.ts`
  (comment), `tests/unit/lint/hook-ordering.test.ts` (deleted), and one test file gaining the
  behavioural assertion. No `src/` change, no `vitest.config.ts` change.
- **Guardrails touched**:
  - **G-G1** — worth stating precisely, because this change deletes a test. G-G1 forbids weakening a
    test to get CI green. This test is not weakened to pass: it passes today and would pass after
    this change too. It is replaced by an assertion that is strictly stronger about the property
    anyone cares about, in the same commit, with the reasoning recorded here. No assertion count is
    reduced overall, and nothing that was red becomes green.
  - **G-D** — no guarded file in the diff; `test/guarded.manifest.json` is not edited.
  - **G-G3** — no check disabled or relaxed.
  - **G-G2** — no test is skipped, commented out, or isolated; the old test is removed outright
    rather than left disabled.
- **Dependencies**: none.
- **Assumption**: none that this change introduces. It removes one — the whole point is that the
  suite stops depending on a documented Vitest ordering default and asserts the behaviour instead.
