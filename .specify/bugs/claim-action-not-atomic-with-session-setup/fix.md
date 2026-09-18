# Bug Fix: Claim action not atomic with session setup

- **Slug**: claim-action-not-atomic-with-session-setup
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added a compensating-cleanup function (`undoClaimResidentProfile`) that reverts exactly what
`claimResidentProfile` committed — deletes the just-created Supabase Auth user and the
`Membership`/`Account` rows, and reverts `ResidentProfile.status` back to `prepared` — and wired
`claimResidentProfileAction` to call it whenever the post-claim `signIn`/`setSessionCookie` step
fails for any reason (not just `SignInError`), so a retry finds the profile claimable again
instead of stuck.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/identity/auth.ts` | added | New exported `undoClaimResidentProfile(context, residentProfileId, accountId)`: one `withSessionContext` transaction deleting `Membership`/`Account` and reverting `ResidentProfile.status`/`movedInOn`, plus a best-effort `supabaseAdmin().auth.admin.deleteUser(accountId)` (swallowed on failure, per assessment's risk note) |
| `src/app/(auth)/claim/actions.ts` | modified | Wrapped `signIn`/`setSessionCookie` in an inner `try/catch`; on any failure (including a plain `Error`, e.g. `hashSessionToken`'s missing-secret case, previously uncaught) calls `undoClaimResidentProfile` and returns a form error instead of leaving committed state or letting the error propagate unhandled |
| `tests/unit/identity/claim-session-setup-not-atomic.test.ts` | added | End-to-end test through the real server action: forces `signIn` to fail (unsets `SESSION_TOKEN_HASH_SECRET`), asserts the profile is rolled back to `prepared` with no orphaned `Membership`, then retries successfully and asserts the profile ends `active` with exactly one `Membership`/`Account` |

## Diff Highlights

```ts
// src/app/(auth)/claim/actions.ts
const claimed = await claimResidentProfile(context, profile.id, password);

try {
  const result = await signIn({ kind: "resident", householdId, displayName, password });
  await setSessionCookie(result.session.id, result.context.householdId);
} catch (sessionErr) {
  await undoClaimResidentProfile(context, profile.id, claimed.accountId);
  if (sessionErr instanceof SignInError) {
    return { error: sessionErr.message };
  }
  return { error: "Something went wrong completing sign-in. Please try again." };
}
```

## Tests Added or Updated

- `tests/unit/identity/claim-session-setup-not-atomic.test.ts::"reverts the claim and lets a retry succeed"` — pins both halves of the fix: (1) a failed `signIn` rolls the profile back to `prepared` with no orphaned `Membership`, (2) a subsequent claim for the same profile/display name succeeds and produces exactly one `Membership`/`Account`.

## Local Verification

- `npx tsc --noEmit -p .` → clean, no type errors.
- `npx vitest run tests/unit/identity/claim-session-setup-not-atomic.test.ts` → 1 file, 1 test, passed.
- `npx vitest run tests/unit/identity` → 12 test files, 28 tests, all passed (includes the pre-existing `claim-resident-profile-validation.test.ts` and `session-token-hash.test.ts`, confirming no regressions).

## Deviations from Assessment

None. Followed the assessment's preferred remediation (compensating cleanup, not reordering,
since `signIn` inherently requires the Auth user `claimResidentProfile` creates to already exist).

## Follow-ups

- The compensating `deleteUser` call is best-effort per the assessment's own risk note: if it
  fails, a retry's `createUser` call will get "already registered" from Supabase Auth (since
  `deriveResidentEmail` is deterministic) instead of succeeding cleanly. This degrades to a
  visible, non-crashing error rather than a silent success, which was judged acceptable — revisit
  if this proves to happen often in practice (e.g. add a scheduled reconciliation job).
