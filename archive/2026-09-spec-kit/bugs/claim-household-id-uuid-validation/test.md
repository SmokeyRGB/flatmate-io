# Bug Verification: claim action crashes on non-UUID householdId

- **Slug**: claim-household-id-uuid-validation
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Post-fix, `claimResidentProfileAction` with a non-empty, non-UUID `householdId` returns a
`ClaimFormState.error` ("That household link looks invalid.") instead of throwing an unhandled
`Error`; the added regression test exercises this directly against the real action (not a mock of
the guard), and the full unit suite plus lint are clean.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | New test: `claimResidentProfileAction({error:null}, FormData{householdId:"not-a-uuid", displayName:"Jonas", password:"..."})` | pass | Returns `{ error: "That household link looks invalid." }`; does not throw, does not reach `findPreparedResidentProfile`/DB |
| New / updated tests | `npx vitest run tests/unit/identity/claim-resident-profile-validation.test.ts` | pass | 1 file, 2 tests passed |
| Regression suite | `npx vitest run tests/unit` | pass | 22 files, 62 tests passed — no regressions |
| Lint | `npx eslint "src/app/(auth)/claim/actions.ts" "tests/unit/identity/claim-resident-profile-validation.test.ts"` | pass | Clean, no output |

## Output Excerpts

```
 Test Files  1 passed (1)
      Tests  2 passed (2)
```
```
 Test Files  22 passed (22)
      Tests  62 passed (62)
```

## Residual Risks

- No integration/e2e test exercises the actual `/claim` HTTP form submission path (only the
  server-action function directly, via mocked `server-only`/`next/headers`/`next/navigation`) —
  consistent with this repo's existing pattern for `signIn` (`resident-sign-in-validation.test.ts`)
  and adequate here since the guard fires before any I/O.
- The sibling gap in `signIn`'s resident branch (`src/modules/identity/auth.ts:245`, non-blank but
  malformed `householdId` still reaches `assertUuid` unguarded) remains open — tracked as a
  follow-up in `fix.md`, intentionally out of scope for this bug per the task's file boundary.

## Recommendation

Close the bug — verified end-to-end within the stated scope (`src/app/(auth)/claim/actions.ts`).
Consider filing the noted `signIn` follow-up as its own bug slug.
