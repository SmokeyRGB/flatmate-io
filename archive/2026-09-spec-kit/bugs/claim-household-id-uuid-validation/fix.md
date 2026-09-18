# Bug Fix: claim action crashes on non-UUID householdId

- **Slug**: claim-household-id-uuid-validation
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added a UUID-format guard in `claimResidentProfileAction` that returns
`ClaimFormState.error` for a non-empty, non-UUID `householdId` before `findPreparedResidentProfile`
reaches `withSessionContext`'s `assertUuid`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/app/(auth)/claim/actions.ts` | modified | Added `isUuid(householdId)` check (returns `{ error: "That household link looks invalid." }`) right after the existing non-emptiness check |
| `tests/unit/identity/claim-resident-profile-validation.test.ts` | added | Pins the new guard for a non-UUID `householdId`, plus a regression check on the existing empty-fields error |

## Diff Highlights

```ts
// src/app/(auth)/claim/actions.ts
import { isUuid, type SessionContext } from "@/db/session-context";
...
if (!householdId || !displayName || !password) {
  return { error: "Household, name, and password are all required." };
}

// householdId reaches findPreparedResidentProfile -> withSessionContext's assertUuid below,
// whose plain (non-ClaimError) Error would otherwise escape this action's catch block uncaught
// for a non-empty, non-UUID value — fail closed here instead (isUuid is exported from
// session-context.ts for exactly this: untrusted input reaching a session-context boundary).
if (!isUuid(householdId)) {
  return { error: "That household link looks invalid." };
}
```

## Tests Added or Updated

- `tests/unit/identity/claim-resident-profile-validation.test.ts::claimResidentProfileAction householdId validation > rejects a non-UUID householdId without throwing` — a non-empty, non-UUID `householdId` returns a `ClaimFormState.error` instead of throwing/crashing.
- `tests/unit/identity/claim-resident-profile-validation.test.ts::... > still requires the non-emptiness fields first` — regression check that the pre-existing empty-fields message is unchanged.

## Local Verification

- `npx vitest run tests/unit/identity/claim-resident-profile-validation.test.ts` → 1 file, 2 tests passed.
- `npx vitest run tests/unit` → 22 files, 62 tests passed (no regressions).
- `npx eslint "src/app/(auth)/claim/actions.ts" "tests/unit/identity/claim-resident-profile-validation.test.ts"` → clean, no output.

## Deviations from Assessment

The assessment's **Preferred** remediation proposed a local regex literal in `actions.ts`
(duplicating `UUID_RE`), on the assumption that `src/db/session-context.ts` had no exported UUID
validator. On re-reading `session-context.ts` while implementing, it turned out an `isUuid(value)`
helper is already exported there (added by a sibling fix, commit `78a62ce`'s family, for exactly
this "untrusted input reaching a session-context boundary" case — see its own comment: "Exported
so callers that receive untrusted input ... can check shape themselves ... instead of letting
assertUuid's plain Error surface as a crash"). Reused that existing export instead of duplicating
the regex — smaller diff, no drift risk between two copies of the same pattern, and it's already
the established idiom (`session-cookie.ts`'s `getCurrentSession` uses it the same way). This is
still entirely within `src/app/(auth)/claim/actions.ts` (one added import) — no expansion of file
scope beyond what the assessment listed.

## Follow-ups

- `signIn`'s resident branch (`src/modules/identity/auth.ts:245`) still guards only against a
  blank `householdId`/`displayName`, not a non-blank-but-malformed one — the identical crash shape
  remains reachable via `/sign-in`. Flagged in the assessment's Open Questions; left untouched here
  per the task's file-scope boundary. Same one-line fix (`isUuid` is already exported and already
  imported in that file's sibling `session-cookie.ts`) would close it.
