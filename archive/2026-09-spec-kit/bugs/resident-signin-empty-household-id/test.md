# Bug Verification: Empty householdId on resident sign-in crashes with unhandled Error

- **Slug**: resident-signin-empty-household-id
- **Tested**: 2026-09-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original crash (`assertUuid` throwing a plain `Error` that escapes `signInAction`'s `catch`) no longer reproduces: `signIn` now rejects a blank resident `householdId`/`displayName` with a `SignInError` before `withSessionContext` is ever called. Full unit suite, lint, and typecheck are all clean; no regressions found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Ad-hoc test calling `signIn({kind:"resident", householdId:"", ...})` directly, asserting the caught error is `SignInError` and its message does not match `/is not a valid UUID/` | pass | Confirms `assertUuid`'s raw `Error` path is no longer reached; script removed after running, not committed |
| New/updated tests | `npx vitest run tests/unit/identity/resident-sign-in-validation.test.ts` | pass | 3/3 tests (empty householdId, whitespace-only householdId, empty displayName) |
| Regression suite | `npx vitest run tests/unit` | pass | 18 files / 49 tests, no regressions in identity/casting/audit unit tests |
| Lint | `npx eslint src/modules/identity/auth.ts "src/app/(auth)/sign-in/sign-in-form.tsx" tests/unit/identity/resident-sign-in-validation.test.ts` | pass | No output/warnings |
| Typecheck | `npx tsc --noEmit` | pass | No output — whole project compiles |
| Integration/RLS suite | `tests/integration/**` | skipped | Hits real Supabase/Postgres; not required by the fix (guard fires before any DB call) and not run without explicit consent to exercise live services |
| Manual browser check | Loading `/sign-in`, submitting resident tab blank | not-run | No dev server/browser session available in this pass; native `required` attributes and the `SignInError` path are covered by the automated checks above instead |

## Output Excerpts

```
RUN  v5.0.1 ...
Test Files  1 passed (1)
     Tests  1 passed (1)   # ad-hoc reproduction check

Test Files  1 passed (1)
     Tests  3 passed (3)   # resident-sign-in-validation.test.ts

Test Files  18 passed (18)
     Tests  49 passed (49) # tests/unit
```
eslint and `tsc --noEmit`: no output (clean).

## Residual Risks

- The UI-level `required` attributes and the removal of `noValidate` were not exercised in an actual browser session (no dev server run in this pass) — behavior relies on standard HTML form validation semantics, which is low risk but unconfirmed visually.
- Integration/RLS tests for the sign-in path were not run (network/DB dependent); the fix's guard is a pure, pre-I/O check so this is not expected to interact with RLS policy, but it wasn't independently re-confirmed here.

## Recommendation

Close the bug — verified via direct reproduction of the original crash path (now blocked by the new `SignInError` guard), the fix's own tests, the full unit regression suite, lint, and typecheck all passing. A follow-up manual browser check of the resident tab's blank-submit UX would be a nice-to-have but isn't blocking given the automated coverage.
