# Bug Fix: moved-out resident's existing session keeps resident-only access

- **Slug**: stale-membership-session
- **Fixed**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`revokeMembershipForProfile` now revokes every unrevoked `Session` row for the target account in
the same transaction as the `Membership` revocation, so a resident's pre-existing session stops
resolving the moment they are moved out or removed — matching V-3's "revokes access immediately".

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/identity/repository.ts` | modified | `revokeMembershipForProfile` now also runs `tx.update(session).set({ revokedAt: new Date() }).where(and(eq(session.accountId, target.accountId), isNull(session.revokedAt)))`, inside the same `withSessionContext` block as the `membership` update. Updated the function's leading comment to mention Session alongside Membership. No new imports needed (`and`/`isNull`/`session` were already imported). |
| `tests/unit/identity/moved-out-session-revocation.test.ts` | added | Two tests: (1) `setMovedOut` invalidates a pre-existing session immediately, and `reactivateMember` does not revive it; (2) the hard removal tier (`removeMember`) also revokes the session. |

## Diff Highlights

```ts
await tx.update(membership).set({ revokedAt: new Date() }).where(eq(membership.id, target.id));

// V-3: a pre-existing session must stop working immediately, not just at its next
// resolveSessionContext-independent check — revoking the Membership alone leaves any session
// already issued for this account still resolving (session.revokedAt is a separate column).
await tx
  .update(session)
  .set({ revokedAt: new Date() })
  .where(and(eq(session.accountId, target.accountId), isNull(session.revokedAt)));
```

## Tests Added or Updated

- `tests/unit/identity/moved-out-session-revocation.test.ts::"stops resolving once setMovedOut runs, and is not revived by reactivateMember"` — signs a resident in, captures the real session id, calls `setMovedOut`, asserts `resolveSessionContext` now returns `null`, then asserts `reactivateMember` does not restore that same stale session.
- `tests/unit/identity/moved-out-session-revocation.test.ts::"also revokes the session on the hard removal tier (removeMember)"` — same check for `removeMember`, since it shares `revokeMembershipForProfile`.

## Local Verification

- Commands run:
  - `npx vitest run tests/unit/identity/moved-out-session-revocation.test.ts tests/unit/identity/current-household-members.test.ts tests/integration/policy/session-household-scoping.test.ts` → 3 files, 4 tests, all passed.
  - `npx vitest run tests/unit/identity tests/integration/policy tests/integration/raw-sql` → 39 files, 59 tests, all passed (no regressions in the wider identity/policy/RLS-bypass suite from touching the shared choke point).
- Manual checks: none beyond the automated tests above.

## Deviations from Assessment

None — the fix matches the assessment's **Preferred** remediation exactly (bulk-revoke by
`accountId` inside `revokeMembershipForProfile`), and `reactivateMember` was left untouched as the
assessment's **Risks & Considerations** required.

## Follow-ups

- The assessment's **Open Question** (whether session revocation on move-out should emit its own
  audit event, e.g. `session.revoked_on_moveout`) is still open — not addressed here since it
  wasn't part of the preferred remediation and touches audit-log scope (P-4) that deserves its own
  decision.
- The assessment's alternative (re-checking `residentProfile.status`/`membership.revokedAt` inside
  `resolveSessionContext` on every request, for defense in depth) was not implemented — worth
  revisiting only if a future code path can revoke access without going through
  `revokeMembershipForProfile`.
