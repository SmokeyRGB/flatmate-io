# Bug Assessment: claim action crashes on non-UUID householdId

- **Slug**: claim-household-id-uuid-validation
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review, PR #4, file `src/app/(auth)/claim/actions.ts` around line 36)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> `householdId` is only checked for non-emptiness before this lookup; a user can submit an
> arbitrary non-UUID value from `/claim`, causing `withSessionContext`/`assertUuid` to throw a
> plain `Error` that this action does not catch. That recreates the unhandled-error behavior this
> PR fixes for sign-in. Validate the UUID at the action boundary or convert the validation failure
> into the returned `ClaimFormState.error` before calling `findPreparedResidentProfile`.

## Symptom

Submitting the `/claim` form with a non-empty but non-UUID `householdId` (e.g. `"abc"`) causes
`claimResidentProfileAction` to throw an unhandled `Error` instead of returning a
`ClaimFormState.error`. Expected: the same graceful `{ error: "..." }` response the action already
gives for other invalid input (missing fields, unknown profile).

## Reproduction

1. Open `/claim`.
2. Submit the form with `householdId = "not-a-uuid"`, a non-empty `displayName`, and a password.
3. `claimResidentProfileAction` calls `findPreparedResidentProfile(householdId, displayName)`,
   which (per `src/modules/identity/auth.ts`) calls `withSessionContext`, whose `assertUuid`
   (`src/db/session-context.ts:19-23`) throws a plain `Error` for a non-UUID value.
4. The action's `catch` block (`actions.ts:46-51`) only re-wraps `ClaimError`/`SignInError`; any
   other error is rethrown (`actions.ts:50`), producing an unhandled server-action crash instead of
   a form error.

## Suspected Code Paths

- `src/app/(auth)/claim/actions.ts:27-33` — only checks `!householdId` (non-emptiness), never
  format.
- `src/app/(auth)/claim/actions.ts:36` — `findPreparedResidentProfile(householdId, displayName)`
  is the first call that reaches `withSessionContext`.
- `src/app/(auth)/claim/actions.ts:46-51` — catch block does not catch the plain `Error` thrown by
  `assertUuid`, so it is rethrown unhandled.
- `src/db/session-context.ts:5,19-23` — `UUID_RE` and `assertUuid`, the shared boundary that
  throws a plain (non-`ClaimError`/`SignInError`) `Error` on a malformed UUID. Not exported.
- `src/modules/identity/auth.ts:241-247` — the analogous resident-sign-in path already guards
  against **blank** `householdId`/`displayName` before `withSessionContext` (commit
  `78a62ce`), but that guard is `.trim()` truthiness only — it does **not** validate UUID format
  either, so a non-empty, non-UUID `householdId` (e.g. `"abc"`) still reaches `assertUuid`
  unguarded on the sign-in path too. Out of scope for this fix per the task's file boundary, but
  flagged as the same root cause recurring in a sibling caller.

## Root Cause Hypothesis

Confidence: high. `assertUuid` is the single shared validation boundary for
`SessionContext.householdId`/`accountId`/`profileId`, and it deliberately throws a plain `Error`
(not a domain error type) because it's meant to catch programmer mistakes, not user input. Two
callers now pass raw, unvalidated user input (`householdId` from a form) down to it:
`claimResidentProfileAction` (this bug) and `signIn`'s resident branch (already partially guarded
against blank-only, per commit `78a62ce`, but not against malformed-but-non-blank values). The
claim action's `catch` only special-cases `ClaimError`/`SignInError`, so `assertUuid`'s plain
`Error` escapes uncaught — the same class of bug the referenced PR fixed for sign-in's blank-field
case, just for the format case and a different caller.

## Proposed Remediation

**Preferred**: Validate `householdId`'s UUID shape at the top of `claimResidentProfileAction`,
alongside the existing non-emptiness check, and return it as a normal `ClaimFormState.error`
before calling `findPreparedResidentProfile`. This mirrors the existing pattern in the same file
(reject bad input early, return `{ error }`) and needs no new dependency — a local regex literal
(matching `UUID_RE` in `src/db/session-context.ts:5`) is enough; `crypto.randomUUID` provides no
parse/validate helper, and adding a shared exported validator is unnecessary for one extra call
site.

**Alternatives**:
- Export `assertUuid`/`UUID_RE` from `src/db/session-context.ts` and reuse it in the action —
  slightly more DRY, but touches a file outside the stated scope and turns an internal
  RLS-boundary guard into a public validation utility used by UI-facing code, which is a bigger
  behavioral surface than this bug needs.
- Broaden the action's `catch` block to also catch generic `Error` and return its message as
  `ClaimFormState.error` — rejected: this would swallow *any* unexpected error (including real
  bugs/db errors) into a user-facing message, which is worse than today's crash for debuggability
  and is explicitly what the referenced sign-in fix avoided doing (it validates before the call,
  not after).

**Files likely to change**:
- `src/app/(auth)/claim/actions.ts` (add UUID-format check next to the existing empty-field check)
- test file(s) for this action, e.g. `src/app/(auth)/claim/actions.test.ts` if one exists, else the
  nearest existing test suite covering `claimResidentProfileAction`

**Tests to add or update**:
- `claimResidentProfileAction` returns `{ error: "..." }` (not a thrown error) when `householdId`
  is non-empty but not a valid UUID, without ever calling `findPreparedResidentProfile`.
- Existing happy-path/blank-field tests continue to pass unchanged.

## Risks & Considerations

- Low risk: purely additive input validation, no schema/API changes.
- Keep the regex consistent with `UUID_RE` in `src/db/session-context.ts:5` so behavior doesn't
  drift between the two independent checks.
- The sign-in path (`src/modules/identity/auth.ts:245`) has the same latent gap (blank-only guard,
  not format guard) — noted above but intentionally left untouched, since the task scopes this fix
  to the claim action; worth its own follow-up bug if desired.

## Open Questions

- [NEEDS CLARIFICATION: should the sign-in resident path (`src/modules/identity/auth.ts`) get the
  same non-UUID-format guard in a follow-up, since it has the identical unhandled-crash shape for
  a non-blank, non-UUID `householdId`? Left out of this fix's scope per task instructions.]
