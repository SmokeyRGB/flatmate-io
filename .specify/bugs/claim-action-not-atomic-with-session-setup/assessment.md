# Bug Assessment: Claim action not atomic with session setup

- **Slug**: claim-action-not-atomic-with-session-setup
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review comment)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> The action claims the profile and only then creates the session. If `signIn`/`setSessionCookie`
> fails (for example, a missing `SESSION_TOKEN_HASH_SECRET`, a transient Auth error, or a cookie
> write failure), the profile/account have already been made active and a retry finds no prepared
> profile, leaving the resident unable to complete the flow. This needs compensating cleanup or a
> claim flow whose durable state is committed only after the session setup succeeds.

## Symptom

`claimResidentProfileAction` (`src/app/(auth)/claim/actions.ts:43-59`) calls
`claimResidentProfile` (creates a Supabase Auth user, an `Account` row, a `Membership` row, and
flips `ResidentProfile.status` to `active`, all inside one DB transaction — see
`src/modules/identity/auth.ts:146-216`), and only afterward calls `signIn` and
`setSessionCookie`. If either of the latter two throws (a plausible failure: `signIn` re-derives
the email and calls `supabaseAdmin().auth.signInWithPassword`, which can fail transiently even
right after `createUser` succeeds; `hashSessionToken` throws a plain `Error` — not a `SignInError`
— if `SESSION_TOKEN_HASH_SECRET` is unset; `setSessionCookie` can throw on a cookie-write failure),
the `catch` block only re-maps `ClaimError`/`SignInError` to a form error and re-throws anything
else, but in both the caught and uncaught cases the resident profile is already `active` with a
claimed Auth account. A retry of the claim form calls `findPreparedResidentProfile`, which only
matches `status = "prepared"` (`auth.ts:121-140`) — it returns null, so the user sees "No profile
with that name is waiting to be claimed" and has no way to retry or sign in (they don't know the
password ever got set, and there is no "already claimed, try signing in" fallback shown).

## Reproduction

1. Ensure `SESSION_TOKEN_HASH_SECRET` is unset (or otherwise force `signIn` to throw after
   `claimResidentProfile` succeeds).
2. Submit the claim form for a `prepared` resident profile with a valid household id, display
   name, and password.
3. `claimResidentProfile` commits: Auth user created, `Account`/`Membership` rows inserted,
   `ResidentProfile.status` set to `active`.
4. `signIn` throws (here, `hashSessionToken` throws `Error("SESSION_TOKEN_HASH_SECRET is not
   configured")`, which is neither `ClaimError` nor `SignInError`) — the action's `catch` block
   rethrows it, producing an unhandled exception page (Next.js error boundary) instead of a
   graceful message.
5. Retry the claim form with the same household/display name/password: `findPreparedResidentProfile`
   returns `null` (profile is now `active`, not `prepared`) → "No profile with that name is
   waiting to be claimed in this household." The resident is stuck — the account exists and has a
   password, but no UI offers to sign in with it, and no email/notification exists in this scope
   (F1) to tell them.

[NEEDS CLARIFICATION: whether `setSessionCookie` (in `src/modules/identity/session-cookie.ts`) can
realistically throw was not independently re-derived beyond noting it's an `await`ed call inside
the same `try`; treated as plausible per the report's own framing.]

## Suspected Code Paths

- `src/app/(auth)/claim/actions.ts:43-59` — `claimResidentProfile` then `signIn` then
  `setSessionCookie` as three sequential, non-compensating steps inside one `try`.
- `src/modules/identity/auth.ts:146-216` (`claimResidentProfile`) — the durable state (Auth user +
  Account + Membership + `status: "active"`) is fully committed here, before the action ever
  attempts `signIn`.
- `src/modules/identity/auth.ts:224-228` (`hashSessionToken`) — throws a plain `Error`, not a
  `SignInError`, so it isn't caught by the action's `err instanceof SignInError` check and instead
  propagates as an unhandled exception (worse than a form error, but functionally the same root
  cause: durable state was already committed).
- `src/modules/identity/auth.ts:121-140` (`findPreparedResidentProfile`) — the retry path's lookup,
  which only matches `status = "prepared"`, confirming a retry cannot find the now-`active`
  profile.
- `tests/helpers/identity.ts:59-61` (`deleteTestAccount`) — existing test-only helper proving
  `adminClient().auth.admin.deleteUser(accountId)` is the mechanism already used in this codebase
  to remove a Supabase Auth user; reusable for a real compensating-cleanup path.

## Root Cause Hypothesis

High confidence. `claimResidentProfile`'s DB transaction and Supabase Auth user creation cannot be
made to commit *after* `signIn`, because `signIn` requires the Auth user (and its password) to
already exist — `signInWithPassword` cannot authenticate a user that isn't there yet. So the two
steps are inherently ordered (create identity, then sign in as it) and cannot be reordered the way
`removeMember`'s DB writes could be merged into one transaction in the earlier
`identity-moveout-session-revocation-not-atomic` fix. The actual gap is the missing failure path:
nothing undoes the `claimResidentProfile` side effects (Auth user, Account, Membership,
ResidentProfile status) when the subsequent `signIn`/`setSessionCookie` step fails, and
`hashSessionToken`'s plain `Error` isn't even caught as a recognized error type.

## Proposed Remediation

**Preferred**: Add compensating cleanup in `claimResidentProfileAction`. Wrap the `signIn` +
`setSessionCookie` calls in an inner `try/catch`; on failure, call a new exported cleanup helper
in `identity/auth.ts` (mirroring `tests/helpers/identity.ts`'s `deleteTestAccount` pattern, but for
production use) that: (a) deletes the newly created Supabase Auth user via
`supabaseAdmin().auth.admin.deleteUser(accountId)`, and (b) reverts the DB side effects — delete
the `Membership` row and the `Account` row, and revert `ResidentProfile.status` back to `prepared`
(clearing `movedInOn`) — all inside one `withSessionContext` transaction, so the profile becomes
claimable again. After compensating, re-throw (or return) a user-facing error so the resident sees
"Something went wrong, please try again" rather than a stuck/broken state. Also fix
`hashSessionToken`'s error to be recognized: either catch it explicitly in the action, or have
`signIn` wrap the `hashSessionToken` call so a missing secret surfaces as a `SignInError` (a
config problem, but the action's catch block should still turn it into a message instead of an
unhandled crash) — the compensating cleanup makes this safe to retry either way.

**Alternatives**:
- Make `claimResidentProfile` itself accept an already-signed-in Supabase session (do the
  Auth-side sign-in first, then use that same session for DB commits). Rejected: `signIn` derives
  the resident's email/session from the profile id created inside `claimResidentProfile` itself
  (chicken-and-egg — there is no account/email to sign in as until the claim step creates it), so
  this would require a much larger restructuring of the claim flow for no benefit over
  compensating cleanup.
- Do nothing and rely on an administrator/support process to manually intervene when this happens.
  Rejected: it's a self-service flow (FR-1.5) with no admin visibility built for this specific
  stuck state in F1 scope; leaving it unrecoverable violates the spirit of a graceful retry.

**Files likely to change**:
- `src/modules/identity/auth.ts` — add an exported compensating cleanup function (e.g.
  `deleteClaimedResidentAccount` or similar), reusable by the action.
- `src/app/(auth)/claim/actions.ts` — call the cleanup function on `signIn`/`setSessionCookie`
  failure, and turn any thrown error (including a plain `Error` from `hashSessionToken`) into a
  user-facing form error rather than letting it propagate unhandled.
- A new/updated test under `tests/unit/identity/` or `tests/integration/` exercising: claim
  succeeds, forced `signIn` failure, cleanup runs, and a second claim attempt for the same profile
  succeeds.

**Tests to add or update**:
- A test that forces `signIn` (or `hashSessionToken`) to fail after `claimResidentProfile`
  succeeds, then asserts: the Auth user was deleted, `Membership`/`Account` rows are gone, and
  `ResidentProfile.status` is back to `prepared` (so a retry can succeed).
- A test that a subsequent claim attempt with the same profile/display name succeeds after the
  above cleanup.

## Risks & Considerations

- Deleting a Supabase Auth user is a real, irreversible admin operation — must be scoped tightly
  to "the account we just created in this same request" (the `accountId` returned by
  `claimResidentProfile`), never a broader lookup, to avoid ever deleting an unrelated account.
- The compensating cleanup itself can fail (e.g. `deleteUser` network error) — should be
  best-effort (log/swallow after the DB rollback, since the DB state is what gates a retry) rather
  than let a cleanup failure mask the original error or crash the request.
- `claimResidentProfileAction` is a Next.js server action; must not leak Supabase service-role
  details or stack traces to the client on failure.
- No `[GUARDED]` test currently covers this path (see `test/guarded.manifest.json` — nothing
  named for claim/session-setup atomicity), so no guarded test needs to be touched.
- Must not change `claimResidentProfile`'s existing successful-path behavior/signature in a way
  that breaks other callers (currently only this one action calls it).

## Open Questions

- [NEEDS CLARIFICATION: none blocking — recommend proceeding to fix with compensating cleanup as
  the preferred remediation, since reordering is not feasible for the reasons given above.]
