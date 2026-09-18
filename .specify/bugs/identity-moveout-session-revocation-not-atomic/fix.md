# Bug Fix: Move-out and session/membership revocation not atomic

- **Slug**: identity-moveout-session-revocation-not-atomic
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`transitionResidentProfileStatus` and `revokeMembershipForProfile` each opened their own
`withSessionContext` (own transaction/commit). `setMovedOut` and `removeMember` called both back
to back, so a failure between the two calls could leave a `moved_out` profile with its Membership
and pre-existing Session still valid, violating V-3. Both functions were split into
`...Tx(tx, ...)` helpers (no `withSessionContext` of their own) — the same idiom
`casting/repository.ts`'s `createAndOpenRound` already uses — and `setMovedOut`/`removeMember` now
open exactly one transaction each, running the lookup, the status transition, and the
membership/session revocation (plus both audit writes) against the same `tx`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/identity/repository.ts` | modified | Added local `Tx` type alias (matches `casting/repository.ts`); split `transitionResidentProfileStatus` into `transitionResidentProfileStatusTx(tx, ...)` + a thin public wrapper; split `revokeMembershipForProfile` into `revokeMembershipForProfileTx(tx, context, ...)` (old private function removed, no external callers); rewrote `removeMember` and `setMovedOut` to run their lookup + both `...Tx` helpers under one shared `withSessionContext` call |

No test files were changed — the existing `tests/unit/identity/moved-out-session-revocation.test.ts`
already exercises the observable behavior (V-3: a pre-existing session stops resolving after
`setMovedOut`/`removeMember`) and continues to pass; it does not need new assertions to validate
this specific fix (see Tests Added or Updated below for why no new test was added).

## Diff Highlights

```ts
// Before: two independent commits
await transitionResidentProfileStatus(context, target.residentProfileId!, "moved_out", actor);
await revokeMembershipForProfile(context, target.residentProfileId!, "membership.revoked", actor);

// After: one transaction
await withSessionContext(context, async (tx) => {
  const [row] = await tx.select().from(membership).where(eq(membership.accountId, targetAccountId));
  if (!row) throw new Error(`Membership not found for account ${targetAccountId}`);
  if (!row.residentProfileId) throw new Error("Cannot set moved_out on an account with no resident profile");

  await transitionResidentProfileStatusTx(tx, row.residentProfileId, "moved_out", actor);
  await revokeMembershipForProfileTx(tx, context, row.residentProfileId, "membership.revoked", actor);
});
```

`removeMember` follows the same shape, additionally folding its display-name-confirmation lookup
into the same transaction (previously a separate up-front `withSessionContext` read).

## Tests Added or Updated

- None added. The assessment's suggested test (force `revokeMembershipForProfileTx` to throw
  after the status update and assert the status rolls back) would require injecting a failure
  inside the transaction, which none of this module's existing tests do (they all exercise real
  DB behavior end-to-end via `tests/helpers/identity.ts`, no mocking seam exists for "throw
  mid-transaction"). Given the ponytail-lazy bar and that the existing integration test
  (`moved-out-session-revocation.test.ts`) already pins the *end-to-end* V-3 behavior this fix
  preserves, a synthetic-failure regression test was judged not worth the added test-harness
  complexity for this change. Flagged as a follow-up below instead of adding new test
  infrastructure speculatively.

## Local Verification

- `npx tsc --noEmit -p .` → clean, no type errors.
- `npx vitest run tests/unit/identity` → 11 test files, 27 tests, all passed (includes
  `moved-out-session-revocation.test.ts`, `resident-profile-transitions.test.ts`).
- `npx vitest run tests/integration/policy/identity-household-scoping.test.ts tests/integration/raw-sql/identity-household-scoping.test.ts tests/integration/policy/household-account-identity.test.ts` → 3 test files, 3 tests, all passed.
- `npx tsx scripts/lint/session-context.ts` → "Session-context lint: OK" (confirms no new
  raw `SET`/`SET LOCAL` call was introduced outside `db/session-context.ts`).

## Deviations from Assessment

None. The fix matches the assessment's preferred remediation exactly, including folding
`removeMember`'s up-front lookup into the same transaction as suggested in the assessment's
"Preferred" section.

## Follow-ups

- Consider adding a fault-injection test (e.g. a test-only hook to make the session-revocation
  update throw) if this transaction-boundary class of bug recurs elsewhere, to lock in atomicity
  more directly than the current end-to-end assertion does.
