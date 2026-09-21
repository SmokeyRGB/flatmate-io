# Bug Assessment: moved-out resident's existing session keeps resident-only access

- **Slug**: stale-membership-session
- **Created**: 2026-09-17
- **Source**: pasted text (inline code-review comment on `src/modules/identity/repository.ts:488-491`)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> `getCurrentHouseholdMembers` treats any non-null profile ID as an active resident, but
> `moved_out` only revokes the membership; existing sessions remain valid because
> `resolveSessionContext` checks only session expiry/revocation. A resident who was moved out can
> therefore continue using this resident-only view (and other session-backed routes). Revalidate
> the acting membership/profile state when resolving the session or at this boundary so revocation
> takes effect immediately as required by V-3.

## Symptom

A resident whose `ResidentProfile.status` is set to `moved_out` (via `setMovedOut` or
`removeMember`) keeps working access to every resident-only, session-backed route — including
`getCurrentHouseholdMembers` — for as long as their pre-existing session cookie remains
unexpired/unrevoked. Expected: per `V-3` (`docs/domain/invarianten.md` §5.3), a move-out revokes
access immediately, with no window in which a removed resident can still act.

## Reproduction

1. Resident A signs in, holds a valid session (`session.actingProfileId` = A's `ResidentProfile.id`, `session.revokedAt` = null).
2. Administration calls `setMovedOut` (or `removeMember`) on A. This calls
   `transitionResidentProfileStatus(..., "moved_out", ...)` and `revokeMembershipForProfile`
   ([repository.ts:442-443](src/modules/identity/repository.ts#L442-L443)), which sets
   `membership.revokedAt` but never touches `session`.
3. Resident A's browser still holds their original session cookie. The next request calls
   `resolveSessionContext` ([repository.ts:242-262](src/modules/identity/repository.ts#L242-L262)), which only checks
   `session.revokedAt` / `session.expiresAt` — both still clear/future — and returns
   `profileId: row.actingProfileId`, i.e. A's now-`moved_out` profile.
4. Any resident-only route that only checks `context.profileId !== null` — e.g.
   `getCurrentHouseholdMembers` ([repository.ts:488-491](src/modules/identity/repository.ts#L488-L491)) or
   `assertHasResidentProfile` ([repository.ts:569-573](src/modules/identity/repository.ts#L569-L573)) — still
   grants A access, because neither re-checks `residentProfile.status` or `membership.revokedAt`.

## Suspected Code Paths

- `src/modules/identity/repository.ts:242-262` (`resolveSessionContext`) — the session-bootstrap read that decides `context.profileId`; checks only `session.revokedAt`/`expiresAt`, never the linked `membership.revokedAt` or `residentProfile.status`.
- `src/modules/identity/repository.ts:348-373` (`revokeMembershipForProfile`) — the single choke point both removal tiers (`setMovedOut` line 442-443, `removeMember` line 421-422) already route through to revoke the `Membership`; it has the target's `accountId` in hand (via the `membership` row it just loaded) but never revokes that account's sessions.
- `src/modules/identity/repository.ts:588-592` (`revokeSession`) — the only place a session is ever actually revoked today, and it's wired solely to the sign-out action (`src/app/(org)/sign-out-action.ts:12`), not to move-out/removal.
- `src/modules/identity/repository.ts:488-491` (`getCurrentHouseholdMembers`) and `:569-573` (`assertHasResidentProfile`) — two of the callers that surface the consequence; there is no reason to believe they're the only ones, since every resident-only route built on `context.profileId !== null` shares the same gap.

## Root Cause Hypothesis

**Confidence: high.** `V-3` ("moved_out revokes access immediately") is enforced only at the
`Membership` row today. Session validity (`resolveSessionContext`) is a separate, independently
cached fact that nothing re-derives from `Membership`/`ResidentProfile` state after sign-in — it's
checked once at login and then trusted for the session's full lifetime (`session_acting_profile_id
_immutable` trigger even makes `actingProfileId` immutable by design, per ADR note at
schema.ts:80-84). `revokeMembershipForProfile` is the one place both removal tiers already funnel
through to make the Membership-side revocation atomic with the ResidentProfile transition
(per its own comment, repository.ts:344-347) — but it stops at `Membership` and never cascades to
`Session`. Fixing at individual call sites like `getCurrentHouseholdMembers` would be the
symptom-only patch: every other resident-only route sharing `context.profileId !== null` would
still be exploitable.

## Proposed Remediation

**Preferred**: extend `revokeMembershipForProfile` ([repository.ts:348-373](src/modules/identity/repository.ts#L348-L373)) to also
bulk-revoke every unrevoked `Session` row for the same account, in the same transaction as the
`Membership` revocation — it already loads the `membership` row (which carries `accountId`), so
this is one more `tx.update(session).set({ revokedAt: new Date() }).where(and(eq(session.accountId, target.accountId), isNull(session.revokedAt)))` inside the existing `withSessionContext` block. This
closes the gap for both `setMovedOut` and `removeMember` at their single shared choke point, and
needs no change at `resolveSessionContext` or any individual resident-only route.

**Alternatives**:
- Re-check `residentProfile.status`/`membership.revokedAt` inside `resolveSessionContext` on every
  request instead. Correct in principle (defense in depth) but strictly more expensive (an extra
  join on every authenticated request) for a case the preferred fix already closes at the source;
  worth revisiting only if a future path can revoke access without going through
  `revokeMembershipForProfile`.

**Files likely to change**:
- `src/modules/identity/repository.ts` (`revokeMembershipForProfile`)

**Tests to add or update**:
- A test that signs a resident in, captures their session, calls `setMovedOut` (or `removeMember`)
  on them from an admin/moderator context, then asserts `resolveSessionContext` for that same
  session now returns `null` (or that `getCurrentHouseholdMembers`/`assertHasResidentProfile`
  reject it) — i.e. an existing session stops working immediately, not just on next login.
- A test that `reactivateMember` does **not** un-revoke the old session (a reactivated resident
  should sign in fresh, not resume a pre-move-out session) — guards against an overly broad
  symmetric fix in `reactivateMember`.

## Risks & Considerations

- Bulk-revoking by `accountId` also invalidates any other concurrent session the same account
  holds (e.g. two open tabs/devices) — this is the correct, intended behavior for V-3 ("revokes
  access immediately"), not a side effect to guard against.
- `reactivateMember` ([repository.ts:449-469](src/modules/identity/repository.ts#L449-L469)) must **not** be
  touched to symmetrically un-revoke sessions — a reactivated resident should re-authenticate, not
  resume a stale session transparently.
- No migration needed: `session.revokedAt` already exists and is exactly what `revokeSession`
  already sets on sign-out.

## Open Questions

- [NEEDS CLARIFICATION: should the session revocation on move-out also emit its own audit event
  (e.g. `session.revoked_on_moveout`), or is the existing `membership.revoked`/
  `membership.removed_as_intruder` event sufficient audit trail per P-4?]
