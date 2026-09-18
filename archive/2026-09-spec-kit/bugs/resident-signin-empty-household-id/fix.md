# Bug Fix: Empty householdId on resident sign-in crashes with unhandled Error

- **Slug**: resident-signin-empty-household-id
- **Fixed**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added a guard in `signIn`'s resident branch that rejects a blank `householdId`/`displayName` with a `SignInError` before it reaches `withSessionContext`'s `assertUuid`, and added native `required` validation (plus removed `noValidate`) to the sign-in form so empty submissions are caught client-side too.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/identity/auth.ts` | modified | Added emptiness check at the top of `signIn`'s resident branch, throwing `SignInError("Household and name are required")` |
| `src/app/(auth)/sign-in/sign-in-form.tsx` | modified | Removed `noValidate`; added `required` to `email`, `householdId`, `displayName`, `password` inputs |
| `tests/unit/identity/resident-sign-in-validation.test.ts` | added | Pins the new `SignInError` guard for blank/whitespace `householdId` and blank `displayName` |

## Diff Highlights

```ts
// src/modules/identity/auth.ts, signIn's resident branch
} else {
  // Blank fields reach here unvalidated from the resident sign-in form (no `required`,
  // `noValidate`) — reject before householdId hits withSessionContext's assertUuid, whose plain
  // Error isn't a SignInError and would otherwise surface as an unhandled crash.
  if (!input.householdId.trim() || !input.displayName.trim()) {
    throw new SignInError("Household and name are required");
  }
  ...
```

## Tests Added or Updated

- `tests/unit/identity/resident-sign-in-validation.test.ts::signIn resident-mode input validation` — empty householdId, whitespace-only householdId, and empty displayName all reject with `SignInError` (no DB/network call needed, since the guard fires before any I/O).

## Local Verification

- `npx vitest run tests/unit/identity/resident-sign-in-validation.test.ts tests/unit/identity/derived-email.test.ts` → 2 files, 6 tests passed.
- `npx vitest run tests/unit` → 18 files, 49 tests passed (no regressions).
- `npx eslint` on the three changed files → clean, no output.

## Deviations from Assessment

None — implemented as proposed. Did not touch `signInAction`'s catch block (already forwards `SignInError.message` as the inline form error) or add integration/RLS tests, since the assessment's "Tests to add or update" scope was the `signIn` guard itself and it requires no database access.

## Follow-ups

- No existing test file previously covered `src/modules/identity/auth.ts`'s `signIn`; the new `resident-sign-in-validation.test.ts` is the first. Future auth.ts changes should extend it rather than creating another file.
