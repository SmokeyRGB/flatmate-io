# Bug Verification: Orphan draft rounds left behind when open fails

- **Slug**: rounds-new-orphan-draft-atomicity
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The added integration tests reproduce the exact assessment scenario (create+open with an
EC-1.1/EC-1.3 precondition failure) against a real database, through `createAndOpenRound`, and
confirm zero `casting_round` rows and zero `casting_round.created` ActivityEvents remain
afterward — the orphan-draft symptom is gone. The full atomicity-adjacent suite and the module's
lint/type-check pass with no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx vitest run tests/integration/policy/round-open-atomicity-orphan-draft.test.ts` | pass | Both failure-path cases (EC-1.1, EC-1.3) assert zero leftover `casting_round` rows / events against the live test DB; the happy-path case confirms exactly one round is produced when preconditions pass. |
| New / updated tests | `npx vitest run tests/integration/policy/round-open-atomicity-orphan-draft.test.ts` | pass | 3/3 passed. |
| Regression suite | `npx vitest run tests/integration/policy/round-open-atomicity.test.ts tests/unit/casting/round-open-preconditions.test.ts` | pass | 8/8 passed — includes AC-1.8/AC-1.9/AC-1.10/EC-1.9 (concurrent-open) atomicity guarantees, unaffected by the refactor. |
| Broader module suite | `npx vitest run tests/unit/casting tests/integration/policy/round-household-scoping.test.ts tests/integration/policy/round-visibility-household-account.test.ts tests/integration/policy/room-round-authorization.test.ts tests/integration/raw-sql/round-household-scoping.test.ts tests/integration/raw-sql/round-visibility-household-account.test.ts` | pass | 28/28 passed, including `[GUARDED]` G-D15 visibility tests. |
| Type-check | `npx tsc --noEmit` | pass | No errors. |
| Lint | `npx eslint src/modules/casting/repository.ts "src/app/(org)/rounds/new/actions.ts" tests/integration/policy/round-open-atomicity-orphan-draft.test.ts` | pass | No errors. |
| Project guardrail scripts | `npx tsx scripts/lint/guarded-tests.ts`, `npx tsx scripts/lint/import-boundary.ts` | pass | "Guarded-test check: OK", "Import-boundary lint: OK". |

## Output Excerpts

```
✓ tests/integration/policy/round-open-atomicity-orphan-draft.test.ts (3 tests)
Test Files  1 passed (1)
     Tests  3 passed (3)
```

```
Test Files  2 passed (2)
     Tests  8 passed (8)
```

## Residual Risks

- Verification exercised the repository layer (`createAndOpenRound`) directly against a live
  Supabase test DB, not the Next.js server action / form submission end-to-end (no browser/e2e
  harness exists in this repo for that route); the action is a thin wrapper with no logic of its
  own beyond calling `createAndOpenRound` and mapping the error, so the repository-level test
  covers the actual root cause.
- Did not add a test for a non-`RoundOpenPreconditionError` failure mid-transaction (e.g. a raw
  DB error), though the same transactional rollback mechanism applies uniformly regardless of
  error type — this matches how the pre-existing AC-1.10 test also only exercises the
  `RoundOpenPreconditionError` path.

## Recommendation

Close the bug — verified end-to-end at the repository layer with a passing regression suite,
clean lint/type-check, and no weakened guardrail checks.
