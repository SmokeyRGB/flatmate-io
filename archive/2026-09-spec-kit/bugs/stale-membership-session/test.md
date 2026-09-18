# Bug Verification: moved-out resident's existing session keeps resident-only access

- **Slug**: stale-membership-session
- **Tested**: 2026-09-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

With the fix reverted, the added regression tests reproduce the exact original symptom (a moved-out
resident's pre-existing session still resolves via `resolveSessionContext`); with the fix applied,
both tests pass and the full identity/policy/RLS regression suite (59 tests) stays green.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (pre-fix, sanity check) | `git stash push -- src/modules/identity/repository.ts` then `npx vitest run tests/unit/identity/moved-out-session-revocation.test.ts` | fail (as expected) | Both new tests failed against the pre-fix code — `resolveSessionContext` returned a live context (`profileId` set) for a session belonging to an account already moved out / removed, instead of `null`. Confirms the tests actually exercise the reported bug, not a tautology. |
| Fix restored | `git stash pop` | pass | `git diff src/modules/identity/repository.ts` confirmed the session-revocation hunk is back in `revokeMembershipForProfile`. |
| Reproduction (post-fix) | `npx vitest run tests/unit/identity/moved-out-session-revocation.test.ts` | pass | Both tests pass: `resolveSessionContext` returns `null` immediately after `setMovedOut`/`removeMember`, and stays `null` after `reactivateMember` (no stale-session revival). |
| Regression suite | `npx vitest run tests/unit/identity tests/integration/policy tests/integration/raw-sql` | pass | 39 test files, 59 tests, all passed — includes the RLS-bypass ("raw-sql") mirror suite and every other identity/casting policy test touching `membership`/`session`. |
| Type-check | `npx tsc --noEmit -p .` | pass | No errors reported against `src/modules/identity/repository.ts` or the new test file. |
| Lint | `npx eslint src/modules/identity/repository.ts tests/unit/identity/moved-out-session-revocation.test.ts` | pass | No output (clean). |

## Output Excerpts

Pre-fix failure (proves the bug reproduces without the fix):
```
AssertionError: expected { …(3) } to be null
+ Received:
{ "accountId": "...", "householdId": "...", "profileId": "..." }
```

Post-fix:
```
Test Files  1 passed (1)
     Tests  2 passed (2)
```

Full regression suite:
```
Test Files  39 passed (39)
     Tests  59 passed (59)
```

## Residual Risks

- The two open items already flagged in `fix.md`'s **Follow-ups** remain: (1) whether the session
  revocation on move-out should emit its own audit event, and (2) the assessment's defense-in-depth
  alternative (re-checking `residentProfile.status`/`membership.revokedAt` inside
  `resolveSessionContext` itself) was not implemented. Neither was required by the chosen
  remediation, but both are worth tracking if a future code path can revoke access without going
  through `revokeMembershipForProfile`.
- Verification ran against the project's configured local/dev Supabase instance (via
  `.env.local`), not a separate staging environment — this matches how the rest of this test suite
  already runs, so no new environment gap was introduced by this check.

## Recommendation

Close the bug — verified end-to-end: the regression tests reproduce the original symptom against
the pre-fix code, pass against the fix, and the full identity/policy/RLS-bypass suite plus
type-check/lint stay clean.
