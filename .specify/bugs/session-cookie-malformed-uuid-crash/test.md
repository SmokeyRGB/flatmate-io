# Bug Verification: Malformed session cookie crashes with 500 instead of signing out

- **Slug**: session-cookie-malformed-uuid-crash
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The reproduction scenario (a `flatmate_session` cookie with a non-UUID segment, e.g.
`sessionId.not-a-uuid`) no longer reaches `withSessionContext`'s `assertUuid`; `getCurrentSession()`
now returns `null` for both a malformed household segment and a malformed session-id segment,
confirmed via a mocked-cookie unit test that also asserts `resolveSessionContext` (and therefore
`assertUuid`) is never invoked for malformed input. No regressions found in eslint, `tsc`, or the
related lint/unit tests.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | New test: mock `next/headers` cookie = `${validUuid}.not-a-uuid` (and the reverse), call `getCurrentSession()` | pass | Resolves to `null`; `resolveSessionContext` not called — confirms `assertUuid` is never reached |
| Regression: valid cookie still works | Same test file, well-formed cookie + mocked `resolveSessionContext` | pass | Non-null session returned, called with the correct parsed ids |
| New / updated tests | `npx vitest run tests/unit/identity/session-cookie-malformed-uuid.test.ts` | pass | 3/3 passed |
| Related existing tests | `npx vitest run tests/unit/lint/session-context.test.ts tests/unit/identity/resident-sign-in-validation.test.ts` | pass | 12/12 passed total across the three files (no regression in the sibling `assertUuid`-adjacent fix for `signIn`) |
| Lint | `npx eslint src/db/session-context.ts src/modules/identity/session-cookie.ts tests/unit/identity/session-cookie-malformed-uuid.test.ts` | pass | No errors or warnings (fixed one unused-arg warning during verification) |
| Type-check | `npx tsc --noEmit -p .` | pass | No errors |
| Project's own session-context lint | `npx tsx scripts/lint/session-context.ts` | pass | "Session-context lint: OK" — confirms the new `isUuid` export didn't introduce a stray `SET`/`SET LOCAL` usage outside the guarded file |

## Output Excerpts

```
Test Files  3 passed (3)
     Tests  12 passed (12)
```
```
Session-context lint: OK
```

## Residual Risks

- Did not run the full `npm run verify` / integration suite (`tests/integration/**`), since those
  require a live Supabase/Postgres connection per `vitest.config.ts`'s own comments — out of scope
  for a targeted, network-free fix to a pure parsing/validation code path, and not one of the
  files those integration tests exercise.
- Coverage is via a mocked-cookie unit test, not an actual HTTP round-trip through a route/page
  that calls `getCurrentSession()` — this exercises the exact function and code path named in the
  Copilot finding, but doesn't independently prove every caller of `getCurrentSession()` degrades
  gracefully (they all go through this one function, so this is expected to be sufficient).

## Recommendation

Close the bug — verified. The fix is narrowly scoped to `session-cookie.ts` (plus the small,
reusable `isUuid` export in `session-context.ts`), matches the codebase's existing precedent for
this exact failure mode (`auth.ts`'s pre-`assertUuid` validation for `signIn`), is covered by a new
regression test, and introduces no lint/type/regression issues in the surrounding suite.
