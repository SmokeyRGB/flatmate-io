# Bug Verification: Claim action not atomic with session setup

- **Slug**: claim-action-not-atomic-with-session-setup
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original reproduction (unset `SESSION_TOKEN_HASH_SECRET` forces `signIn` to throw a plain
`Error` after `claimResidentProfile` has already committed) was re-run end-to-end against the real
server action and real DB/Supabase Auth. Pre-fix, this crashed unhandled and left the profile
permanently unclaimed (`findPreparedResidentProfile` would never match it again). Post-fix, the
action returns a graceful form error, the profile is rolled back to `prepared`, and a retry
succeeds. Full regression suite passes with no new failures.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | New test `tests/unit/identity/claim-session-setup-not-atomic.test.ts`, exercising `claimResidentProfileAction` directly with `SESSION_TOKEN_HASH_SECRET` unset | pass | Confirms: (1) the action returns `{ error: <truthy> }` instead of throwing unhandled, (2) `ResidentProfile.status` reverts to `prepared`, (3) no orphaned `Membership` row remains |
| New / updated tests | `npx vitest run tests/unit/identity/claim-session-setup-not-atomic.test.ts` | pass | 1 file, 1 test |
| Identity unit suite | `npx vitest run tests/unit/identity` | pass | 12 files, 28 tests (up from 11/27 pre-fix — the new test file) |
| Full regression suite | `npx vitest run` | pass | 59 files, 122 tests |
| Type-check | `npx tsc --noEmit -p .` | pass | No type errors |

## Output Excerpts

```
 Test Files  59 passed (59)
      Tests  122 passed (122)
```

## Residual Risks

- The compensating `deleteUser` call is best-effort (per `fix.md`'s Follow-ups): if it fails, a
  retry gets Supabase Auth's "already registered" error on `createUser` rather than a clean
  success. This was not independently forced/tested (would require making the Supabase Admin API
  itself fail, which is out of scope for a local test run against the live test project) — the DB
  half of the rollback (the half that actually gates a retry via `findPreparedResidentProfile`) is
  what's directly verified.
- `setSessionCookie` failing specifically (as opposed to `signIn` failing) was not separately
  forced — the fix's `try/catch` wraps both calls identically, and the `hashSessionToken` failure
  used here exercises the same catch/cleanup path a `setSessionCookie` failure would.

## Recommendation

Close the bug — verified via a direct end-to-end reproduction of the reported failure mode (forced
`signIn` failure post-claim), confirming both the rollback and the successful retry, plus a clean
full regression suite (122/122) and type-check.
