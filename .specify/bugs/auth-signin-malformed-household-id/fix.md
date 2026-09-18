# Bug Fix: resident sign-in crashes on malformed householdId

- **Slug**: auth-signin-malformed-household-id
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Extended `signIn`'s resident-mode guard in `src/modules/identity/auth.ts` to also reject a
non-blank but non-UUID-shaped `householdId` with a `SignInError`, using the existing shared
`isUuid` helper from `src/db/session-context.ts` — mirroring the pattern already used in
`claim/actions.ts` and `session-cookie.ts` for the same bug class.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/identity/auth.ts` | modified | Import `isUuid`; add a shape check after the existing blank-field guard in the resident branch of `signIn`, throwing `SignInError("Invalid household")` before `withSessionContext` is called. |
| `tests/unit/identity/resident-sign-in-validation.test.ts` | modified | Added a regression test for a non-blank, malformed `householdId`; fixed the pre-existing "rejects an empty displayName" case to use a well-formed `householdId` so it isolates the field under test. |

## Diff Highlights

```ts
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
...
    if (!input.householdId.trim() || !input.displayName.trim()) {
      throw new SignInError("Household and name are required");
    }
    // A non-blank but non-UUID-shaped householdId (e.g. "not-a-uuid") would otherwise still reach
    // withSessionContext's assertUuid below and throw a plain Error there instead — same isUuid
    // shape check the claim action and cookie parser already use for this exact input.
    if (!isUuid(input.householdId)) {
      throw new SignInError("Invalid household");
    }
```

## Tests Added or Updated

- `tests/unit/identity/resident-sign-in-validation.test.ts::rejects a non-blank, malformed householdId` — pins down that `signIn({ kind: "resident", householdId: "not-a-uuid", ... })` throws `SignInError`, not a plain `Error`.
- `tests/unit/identity/resident-sign-in-validation.test.ts::rejects an empty displayName` — updated to use a well-formed `householdId` (`aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`) instead of `"some-id"`, so the test isolates the blank-`displayName` guard rather than incidentally also tripping the new shape check.

## Local Verification

- `npx vitest run tests/unit/identity/resident-sign-in-validation.test.ts` → 1 file, 4 tests, all passed.
- `npx vitest run tests/unit` → 22 files, 66 tests, all passed (no regressions elsewhere).

## Deviations from Assessment

None. Applied exactly as proposed in `assessment.md`'s **Preferred** remediation, scoped to the one file it named.

## Follow-ups

- None required. `signInAction` (`src/app/(auth)/sign-in/actions.ts`) already catches `SignInError` and returns it inline, so no change was needed there — confirmed by reading the file during this fix.
