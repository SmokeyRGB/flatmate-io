# Bug Verification: resident sign-in crashes on malformed householdId

- **Slug**: auth-signin-malformed-household-id
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`signIn({ kind: "resident", householdId: "not-a-uuid", ... })` now throws `SignInError` instead of
the plain `Error` `assertUuid` used to throw, confirmed by an automated regression test. Lint,
type-check, and the full unit test suite are clean — no regressions from the change.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx vitest run tests/unit/identity/resident-sign-in-validation.test.ts` | pass | `rejects a non-blank, malformed householdId` throws `SignInError`, not the plain `Error` `assertUuid` used to throw — the original symptom no longer reproduces. |
| New / updated tests | `npx vitest run tests/unit/identity/resident-sign-in-validation.test.ts` | pass | 1 file, 4 tests, all pass. |
| Regression suite | `npx vitest run tests/unit` | pass | 22 files, 66 tests, all pass — no other unit test broke. |
| Lint | `npx eslint src/modules/identity/auth.ts tests/unit/identity/resident-sign-in-validation.test.ts` | pass | No output/errors. |
| Type-check | `npx tsc --noEmit` | pass | No output/errors. |
| Integration suite (`tests/integration/**`) | — | skipped | Requires a live Postgres instance with RLS policies applied; not run in this environment, and the fix is a pure input-validation change upstream of any DB call, so no integration coverage is needed to lock it in. |

## Output Excerpts

```
Test Files  1 passed (1)
      Tests  4 passed (4)
```
```
Test Files  22 passed (22)
      Tests  66 passed (66)
```

## Residual Risks

- Integration/E2E coverage of the actual `signInAction` form-submission path was not exercised
  (would require a running Next.js server + Supabase project); the unit-level fix is upstream of
  the DB call the original crash came from, so this is judged low risk.
- No change was needed in `signInAction` itself — it already only catches `SignInError`, and now
  correctly receives one for this input class.

## Recommendation

Close the bug — verified via the added regression test, full unit suite, lint, and type-check, all
passing. No source files outside `src/modules/identity/auth.ts` needed changes.
