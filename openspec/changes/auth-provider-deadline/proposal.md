# Proposal

## Why

The application's Supabase Auth calls have no deadline. `supabaseAdmin()` in
`src/modules/identity/auth.ts` is a plain `createClient`, so each call waits as long as Node's
fetch (undici) waits for response headers: 300 s. On 2026-09-28 (branch
`fix/test-timeouts-hosted-dev`), requests to flatmate-io-dev's Auth API were measured being written
to the socket in full and never answered, and GoTrue never logged them. The test suite now works
around this with a test-only deadline and resend in `tests/setup.ts`. Production has no such
protection.

That matters most where the call runs inside a `withSessionContext` transaction holding row locks.
`changeResidentEmail`, `changeResidentPassword` and `redeemPasswordReset` call the provider under
`membership`/`account`/`session FOR UPDATE`. A lost request there pins one Supavisor connection
(dev has 16 for `app_runtime`) and those locks for up to 300 s. During that time every other writer
of that account is blocked, and so is every sign-in to it (`signIn` takes `membership FOR UPDATE`).

A deadline alone is not enough. auth-js already turns a fetch that fails after sending (reset,
abort, 5xx gateway) into a returned `AuthRetryableFetchError`. Every call site then reads that
error as "the provider refused", when the truth is "the provider may have applied it". Several
call sites already mishandle it today, with or without a deadline:

- An email or password change whose answer is lost is rolled back in Postgres while the provider
  may hold the new value. The repair written for a failed commit (`providerUpdated`) never runs.
  For a password this leaves the other sessions alive under a changed password, against O-13
  (*„endet bei Passwortänderung"*, as `identity/account-settings` cites it).
- A lost `createUser` answer at join or registration can leave an Auth user nobody cleans up. The
  address is then blocked for good. For a bound link it is the profile's derived address, so every
  later redemption fails as "email taken".
- A lost reset password write is reported as "ask for a new link" even when the password is set.
- A lost read tells the person their password is wrong.

`.claude/rules/implementation-hazards.md`, "No transaction spans Postgres and Supabase Auth",
requires that *"Every error after an external change maps to the state that change left behind"*,
and that *"A repair after a failed commit reconciles to the authority's current state"*. This change
applies both rules to the error that means "unknown".

## What Changes

- **A per-request deadline on every application call to Supabase Auth.** The admin client gets a
  `global.fetch` that attaches `AbortSignal.timeout` to each request. The client moves into its own
  file in the identity module.
- **One classification of provider errors:** *refused* (the provider answered and said no) or
  *unknown* (no answer, or a retryable 5xx, so the change may or may not have applied). Every call
  site handles *unknown* explicitly. None may treat it as a refusal.
- **Reads and the password grant** (`getUserById`, `signInWithPassword`) are sent at most twice.
  They change nothing, so a second copy is safe.
- **createUser** is given an id generated up front. When its answer is unknown, the Auth user is
  deleted by that id before `signup_failed` is reported. The address is not left blocked.
- **Email and password writes** (`changeResidentEmail`, `changeResidentPassword`,
  `redeemPasswordReset` phase 2) resolve an unknown answer while still holding their locks:
  - Read the provider back. For an email that is `getUserById`. For a password it is a sign-in
    with the new password, since a password cannot be read.
  - Resend at most once, and only when the read-back shows it did not apply.
  - An outcome that stays unknown goes to the existing repair path, which reconciles to the
    provider's current state, and is reported as such.
- **New user-visible outcomes:**
  - `provider_unavailable` ("sign-in / the change is not possible right now, nothing changed, try
    again") replaces the misleading "wrong password" on sign-in and in the account settings.
  - A new reset outcome covers "your new password may be set: try it, and if it fails, ask for a
    new link".
- **Tests that fail without the change:**
  - A local-HTTP-server unit test of the deadline.
  - Transport fault injection at `globalThis.fetch` against real GoTrue on flatmate-io-dev, in two
    modes: withhold the request (*not applied*), or forward it and drop the answer (*applied,
    answer lost*).
  - A lock-release test showing that a second writer is no longer blocked for 300 s.

Not in this change (recorded so nobody assumes they are covered):
- **A Postgres-side backstop** (`idle_in_transaction_session_timeout` on `app_runtime`). It would
  bound any hang, not only Auth's. It is a human-applied role setting in
  `scripts/db/bootstrap-roles.sql`, so it gets its own change (human decision in explore,
  2026-09-28).
- **Other outbound HTTP.** There is none today: `auth.ts` is the only `createClient` in `src/`.
- **The test-only resend in `tests/setup.ts`.** It stays for the tests' own direct admin calls
  (teardown's `deleteUser`). Its "production has no such protection" comment is corrected if that
  branch has merged by the time this is applied.

## Capabilities

### New Capabilities
- `identity/provider-calls`: how the application talks to the identity provider. That covers a
  deadline on every call, the refused/unknown distinction, which calls may be resent, and the rule
  that an unknown outcome is never reported as a refusal.

### Modified Capabilities
- `identity/sign-in`: a sign-in that cannot reach the provider says so, instead of "invalid
  credentials".
- `identity/account-settings`: an email or password change whose provider answer was lost ends in
  a state that matches the provider. The other sessions end whenever the password may have changed.
  A read that cannot reach the provider is reported as unavailable, not as a wrong current
  password.
- `identity/password-reset`: a third failure outcome, "cannot tell whether the password was set",
  alongside the two the spec already names.
- `identity/join`: a join whose account creation went unanswered leaves no account behind, so the
  address, and the invitation, can be used again.

## Impact

- New: `src/modules/identity/auth-provider.ts` (admin client with deadline, error classification,
  confirmed read-back helpers), `tests/helpers/provider-fault.ts`, a unit test with a local server,
  and integration tests under `tests/integration/policy/`.
- Changed: `src/modules/identity/auth.ts` (every provider call site),
  `src/app/(auth)/sign-in/actions.ts`, `src/app/(auth)/register/actions.ts`,
  `src/app/(auth)/join/[code]/actions.ts`, `src/app/(resident)/account/actions.ts` (new codes in
  their exhaustive switches), `src/ui/strings/de.ts` (new texts), `.env.example` (the deadline
  setting), `.claude/rules/implementation-hazards.md` (the unknown-outcome rule).
- No migration, no schema change, no new table, no data-inventory entry.
- **Guardrails:**
  - It touches **G-C** in one respect: that password change ends the other sessions (V-3's
    immediate loss of access, via O-13). The change closes a path where that failed to happen and
    weakens no check.
  - It touches no **G-D** guarded test (the `identity` ones it extends are not in the manifest).
  - It does not touch **G-L**.
  - It disables nothing, so G-G3 needs no approval.

## Assumptions

- **A1.** GoTrue on flatmate-io-dev honours `id` in `auth.admin.createUser`. auth-js 2.116 declares
  it (`AdminUserAttributes.id`). The first task probes it. If the probe fails, the fallback is
  `listUsers` by address, as `provider-user-compensation.test.ts` does, and the design is revisited
  before continuing.
- **A2.** A deadline of 5 s per request, overridable through `AUTH_PROVIDER_DEADLINE_MS`. GoTrue
  logged nothing slower than 1.3 s in the measured window. The worst-case lock hold per path is
  stated in design.md.
- **A3.** A request we aborted can still apply at GoTrue *later*, after the lock was released.
  The measured requests never reached GoTrue, but the deadline also cuts requests that were merely
  slow. Application code cannot exclude this. So every password path that had an unknown write
  ends the other sessions anyway. The residual for an email or a `createUser` is logged, not
  repaired (design.md Risks).
- **A4.** A name sign-in makes the same provider calls whether or not the name exists. For an
  unknown name they go to throwaway targets. A lost request therefore yields `provider_unavailable`
  for every name, and the existing timing difference between an unknown and a known name closes
  too (design.md D11). A health check first was rejected, because availability is per request, not
  a state (human decision, 2026-09-28).
- **A5.** The German texts in the specs and `de.ts` are drafts for the human to confirm.
