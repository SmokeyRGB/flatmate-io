# Bug Verification: Register action not atomic with sign-in

- **Slug**: register-action-not-atomic-with-signin
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original reproduction (unset `SESSION_TOKEN_HASH_SECRET` forces `signIn` to throw after
`registerHousehold` has already committed) was re-run directly against `registerHousehold`/
`signIn`/`undoRegisterHousehold`. Pre-fix, the household/account/membership rows would remain
committed with no way to sign in and no way to re-register the same email. Post-fix,
`undoRegisterHousehold` removes all four row types and a retry with the same email succeeds. Full
regression suite passes with no new failures.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | New test `tests/unit/identity/register-session-setup-not-atomic.test.ts`, exercising `registerHousehold` → forced `signIn` failure → `undoRegisterHousehold` → retry | pass | Confirms: (1) `signIn` throws as expected when `SESSION_TOKEN_HASH_SECRET` is unset, (2) all of `Household`/`HouseholdSettings`/`Account`/`Membership` are gone after cleanup, (3) `registerHousehold` with the same email succeeds afterward and the new household's `signIn` works |
| New / updated tests | `npx vitest run tests/unit/identity/register-session-setup-not-atomic.test.ts` | pass | 1 file, 1 test |
| Identity unit suite | `npx vitest run tests/unit/identity` (implicitly covered by full run below) | pass | included in the 60/123 full-suite run |
| Full regression suite | `npx vitest run` | pass | 60 files, 123 tests (up from 59/122 before this fix's test was added) |
| Type-check | `npx tsc --noEmit -p .` | pass | No type errors |

## Output Excerpts

```
 Test Files  60 passed (60)
      Tests  123 passed (123)
```

## Residual Risks

- Same residual risk as the sibling claim-flow fix: the compensating `deleteUser` call is
  best-effort — if it fails, a retry gets Supabase Auth's "already registered" on `createUser`
  rather than a clean success. Not independently forced (would require making the Supabase Admin
  API itself fail).
- Per `fix.md`'s Deviations from Assessment, this test exercises the underlying `auth.ts`
  functions directly rather than driving `registerHouseholdAction` end-to-end through mocked
  `next/headers`/`next/navigation` (unlike the claim-flow test) — the action's own try/catch
  wiring (which calls these exact functions) was verified by code review and type-check, not by a
  full action-level test, since there's no way to recover the action-generated household/account
  ids afterward without adding new plumbing.

## Recommendation

Close the bug — verified via a direct reproduction of the reported failure mode (forced `signIn`
failure post-registration), confirming both the rollback and the successful retry, plus a clean
full regression suite (123/123) and type-check.
