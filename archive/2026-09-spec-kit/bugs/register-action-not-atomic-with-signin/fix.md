# Bug Fix: Register action not atomic with sign-in

- **Slug**: register-action-not-atomic-with-signin
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added `undoRegisterHousehold`, mirroring the already-applied/verified `undoClaimResidentProfile`
fix: it reverts exactly what `registerHousehold` committed (deletes `Membership`, `Account`,
`HouseholdSettings`, `Household` rows for that specific id, plus a best-effort Supabase Auth user
delete), and wired `registerHouseholdAction` to call it whenever the post-registration
`signIn`/`setSessionCookie` step fails for any reason, so a retry with the same email doesn't hit
Supabase Auth's "already registered" error.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/identity/auth.ts` | added | New exported `undoRegisterHousehold(context, householdId, accountId)`: one `withSessionContext` transaction deleting `Membership`/`Account`/`HouseholdSettings`/`Household`, plus a best-effort `supabaseAdmin().auth.admin.deleteUser(accountId)` (swallowed on failure, same trade-off as the claim-flow fix) |
| `src/app/(auth)/register/actions.ts` | modified | Wrapped `signIn`/`setSessionCookie` in an inner `try/catch`; on any failure (including a plain `Error`, e.g. `hashSessionToken`'s missing-secret case, previously uncaught) calls `undoRegisterHousehold` and returns a graceful form error instead of leaving committed state or letting the error propagate unhandled |
| `tests/unit/identity/register-session-setup-not-atomic.test.ts` | added | Direct auth.ts-level test: forces `signIn` to fail after `registerHousehold` succeeds, asserts all four row types are gone after `undoRegisterHousehold`, then retries `registerHousehold` with the same email and confirms it succeeds and `signIn` now works |

## Diff Highlights

```ts
// src/app/(auth)/register/actions.ts
const registered = await registerHousehold(email, password);

try {
  const result = await signIn({ kind: "household", email, password });
  await setSessionCookie(result.session.id, result.context.householdId);
} catch (sessionErr) {
  await undoRegisterHousehold(registered.context, registered.context.householdId, registered.context.accountId);
  if (sessionErr instanceof SignInError) {
    return { error: sessionErr.message, fieldError: null };
  }
  return { error: "Something went wrong completing sign-in. Please try again.", fieldError: null };
}
```

## Tests Added or Updated

- `tests/unit/identity/register-session-setup-not-atomic.test.ts::"reverts the registration and lets a retry with the same email succeed"` — pins both halves: (1) a failed `signIn` rolls back `Household`/`HouseholdSettings`/`Account`/`Membership` for that id, (2) `registerHousehold` with the same email succeeds afterward and `signIn` works against the new household.

## Local Verification

- `npx tsc --noEmit -p .` → clean, no type errors.
- `npx vitest run tests/unit/identity/register-session-setup-not-atomic.test.ts` → 1 file, 1 test, passed.
- `npx vitest run` (full suite) → 60 test files, 123 tests, all passed (up from 59/122 pre-fix — the new test file; no regressions).

## Deviations from Assessment

None. This test exercises `registerHousehold`/`signIn`/`undoRegisterHousehold` directly rather
than through the Next.js server action wrapper (unlike the claim-flow fix's test, which mocked
`next/headers`/`next/navigation` to drive the action end-to-end). Reason: unlike the claim flow,
where `residentProfile.id` is a stable pre-existing anchor the test can look up independently of
the action, a fresh registration's household/account ids are generated entirely inside the action
with no way to recover them afterward without adding new plumbing the assessment didn't call for.
Testing at the `auth.ts` function level (the same level `moved-out-session-revocation.test.ts` and
`session-token-hash.test.ts` already test at) still exercises the exact functions the action's fix
relies on and satisfies the assessment's named test cases (forced failure → cleanup verified →
retry succeeds).

## Follow-ups

- Same as the claim-flow fix: the compensating `deleteUser` call is best-effort — if it fails, a
  retry gets "already registered" from Supabase Auth (a visible, non-crashing error) rather than a
  silent success. Revisit if this proves to happen often in practice.
- Optional: a follow-up test could drive `registerHouseholdAction` itself end-to-end (mocking
  `next/headers`/`next/navigation` like the claim-flow test) if the action's own error-message
  wiring (as opposed to the underlying cleanup function) ever needs its own regression coverage.
