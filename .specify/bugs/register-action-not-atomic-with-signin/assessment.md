# Bug Assessment: Register action not atomic with sign-in

- **Slug**: register-action-not-atomic-with-signin
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review comment)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> Registration and sign-in are two separate operations, so if `registerHousehold` succeeds but
> `signIn` or session-cookie creation fails, the newly created household/account remains persisted
> while the user sees an error. A retry can then fail as a duplicate and leave an unusable
> account; make these operations compensating/atomic (or explicitly clean up the created Auth user
> and rows on the post-registration failure path).

## Symptom

`registerHouseholdAction` (`src/app/(auth)/register/actions.ts:15-37`) calls `registerHousehold`
(creates a Supabase Auth user, then `Household`/`HouseholdSettings`/`Account`/`Membership` rows in
one DB transaction — `src/modules/identity/auth.ts:35-109`), and only afterward calls `signIn` and
`setSessionCookie`. The `catch` block only re-maps `RegistrationError`/`SignInError` to a form
error; anything else (e.g. `hashSessionToken` throwing a plain `Error` when
`SESSION_TOKEN_HASH_SECRET` is unset — the exact same gap identified and now fixed for the claim
flow in `identity-moveout-session-revocation-not-atomic`'s sibling bug,
`claim-action-not-atomic-with-session-setup`) propagates unhandled. Either way, the household/Auth
user/rows are already committed. A retry with the same email hits Supabase Auth's
"already registered" on `createUser` (`RegistrationError`), so the user sees a duplicate-email
error and has no path forward — they can't re-register (email taken) and never received working
sign-in confirmation from the first attempt.

## Reproduction

1. Ensure `SESSION_TOKEN_HASH_SECRET` is unset (or otherwise force `signIn` to throw after
   `registerHousehold` succeeds).
2. Submit the register form with a fresh email + password.
3. `registerHousehold` commits: Auth user created, `Household`/`HouseholdSettings`/`Account`/
   `Membership` rows inserted.
4. `signIn` throws (`hashSessionToken` throws a plain `Error`, not caught by
   `err instanceof RegistrationError || err instanceof SignInError`) — the action's `catch`
   rethrows it, producing an unhandled exception instead of a graceful message.
5. Retry the register form with the same email: `registerHousehold` calls
   `supabaseAdmin().auth.admin.createUser({ email, ... })` again, which fails because that email is
   already registered → `RegistrationError`. The user is stuck: the household exists with no way
   to sign into it (this action never offers "sign in instead"), and there is no email-based
   account-recovery flow in F1 scope.

[NEEDS CLARIFICATION: whether `setSessionCookie` can realistically throw was not independently
re-derived beyond it being an `await`ed call inside the same `try`, matching the report's framing.]

## Suspected Code Paths

- `src/app/(auth)/register/actions.ts:25-34` — `registerHousehold` then `signIn` then
  `setSessionCookie` as three sequential, non-compensating steps inside one `try`.
- `src/modules/identity/auth.ts:35-109` (`registerHousehold`) — the durable state (Auth user +
  `Household` + `HouseholdSettings` + `Account` + `Membership` + an `ActivityEvent`) is fully
  committed here, before the action ever attempts `signIn`.
- `src/modules/identity/auth.ts:224-228` (`hashSessionToken`) — same as the claim-flow sibling bug:
  throws a plain `Error`, not a `SignInError`, uncaught by the action's type check.
- `src/modules/identity/auth.ts:35-38` — `registerHousehold`'s own `createUser` call is what turns
  a retry into a duplicate-email `RegistrationError`, confirming the stuck state on retry.
- `tests/helpers/identity.ts:37-55` (`registerTestHousehold`'s own `cleanup`) — existing test-only
  helper proving the exact set of rows/tables (`residentProfile`, `membership`, `session`,
  `account`, `householdSettings`, `household`) plus `adminClient().auth.admin.deleteUser(...)` that
  a full household teardown requires; reusable shape for a real compensating-cleanup path (a fresh
  registration has no `residentProfile`/`session` rows yet, so only the latter four tables apply).

## Root Cause Hypothesis

High confidence, and structurally identical to `claim-action-not-atomic-with-session-setup`:
`signIn({ kind: "household", ... })` calls `supabaseAdmin().auth.signInWithPassword`, which
requires the Auth user `registerHousehold` just created to already exist — so `registerHousehold`
cannot be deferred until after `signIn` succeeds; the two are inherently ordered. The actual gap,
same as the claim flow, is the missing failure path: nothing undoes `registerHousehold`'s
side effects when the subsequent `signIn`/`setSessionCookie` step fails, and `hashSessionToken`'s
plain `Error` isn't recognized as a handled error type here either.

## Proposed Remediation

**Preferred**: Mirror the fix already applied to the claim flow. Add an exported
`undoRegisterHousehold(context, householdId, accountId)` helper in `identity/auth.ts` that, inside
one `withSessionContext` transaction, deletes the `Membership`, `Account`, `HouseholdSettings`, and
`Household` rows for that specific `householdId`/`accountId` (never a broader lookup), then
best-effort deletes the Supabase Auth user via
`supabaseAdmin().auth.admin.deleteUser(accountId)` (swallowed on failure — the DB rollback is what
actually gates a clean retry, same reasoning as the claim-flow fix). In
`registerHouseholdAction`, wrap `signIn`/`setSessionCookie` in an inner `try/catch`; on any failure
(not just `RegistrationError`/`SignInError`) call `undoRegisterHousehold` and return a graceful
form error instead of leaving committed state or letting the error propagate unhandled.

**Alternatives**:
- Reorder to sign in first. Rejected for the same reason as the claim flow: there is no Auth user
  to sign in as until `registerHousehold` creates one.
- Leave the household committed and instead detect "email already registered but no working
  session" on a later attempt, offering the user a "sign in instead" link. Rejected as a much
  larger scope change (a recovery/support flow) for a problem compensating cleanup solves cleanly
  and consistently with the sibling fix.

**Files likely to change**:
- `src/modules/identity/auth.ts` — add `undoRegisterHousehold`.
- `src/app/(auth)/register/actions.ts` — call it on `signIn`/`setSessionCookie` failure; broaden
  the failure handling so a plain `Error` (e.g. from `hashSessionToken`) is also turned into a form
  error rather than propagating unhandled.
- A new/updated test under `tests/unit/` exercising: registration succeeds, forced `signIn`
  failure, cleanup runs (household/account gone), and a second registration attempt with the same
  email succeeds.

**Tests to add or update**:
- A test that forces `signIn` (or `hashSessionToken`) to fail after `registerHousehold` succeeds,
  then asserts: the Auth user was deleted, and the `Household`/`HouseholdSettings`/`Account`/
  `Membership` rows are gone.
- A test that a subsequent registration attempt with the same email succeeds after the above
  cleanup.

## Risks & Considerations

- Same as the claim-flow fix: deleting a Supabase Auth user is irreversible and must be scoped
  strictly to the `accountId` this same request just created.
- The compensating cleanup can itself fail (e.g. `deleteUser` network error) — must be best-effort
  (swallow after the DB rollback) rather than mask the original error or crash the request; if it
  fails, a retry will get "already registered" from Supabase Auth rather than a silent duplicate,
  which is an acceptable, non-crashing degradation (same trade-off already accepted for the claim
  flow).
- `registerHouseholdAction` is a Next.js server action; must not leak Supabase service-role details
  or stack traces to the client on failure.
- No `[GUARDED]` test currently covers this path (`test/guarded.manifest.json` has nothing named
  for registration/session-setup atomicity).
- `registerHousehold`'s own transaction currently writes an `ActivityEvent`
  (`resident_profile.created` reused for `household` subject type) — the compensating cleanup does
  not need to touch `ActivityEvent` rows (audit trail of an attempted-then-reverted registration is
  fine to keep, same as the claim flow's cleanup leaves no separate audit-of-cleanup requirement in
  scope), but this should be confirmed not to violate any audit-completeness guardrail before
  finalizing (G-D4 "Löschvollständigkeit" is currently `pending`/unimplemented per
  `test/guarded.manifest.json`, so it does not gate this fix).

## Open Questions

- [NEEDS CLARIFICATION: none blocking — recommend proceeding to fix with compensating cleanup,
  mirroring the already-applied and already-verified claim-flow fix.]
