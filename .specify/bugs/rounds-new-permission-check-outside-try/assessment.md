# Bug Assessment: `close_round` permission check outside the try block in `createAndOpenRoundAction`

- **Slug**: rounds-new-permission-check-outside-try
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR review comment)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> This permission failure is outside the `try` block below, so a signed-in user without
> `close_round` gets an unhandled server-action error rather than the inline `state.error`
> promised by this action. Since `/rounds/new` is reachable by any signed-in user, either guard
> the page or catch/map `PermissionDeniedError` (and other expected authorization failures) here.
> (`src/app/(org)/rounds/new/actions.ts` around line 20)

## Symptom

In `src/app/(org)/rounds/new/actions.ts`, `createAndOpenRoundAction` calls
`assertHasPermission(current.context, current.context.accountId, "close_round")` on line 20,
*before* the `try` block that starts on line 30. `assertHasPermission` throws
`PermissionDeniedError` (`src/modules/identity/repository.ts:163`) when the caller lacks the
permission. Because that throw happens outside the `try`, it propagates as an unhandled server
action error instead of being mapped to the `{ error: string }` shape the action's own return type
(`CreateRoundFormState`) and its only other failure path (`RoundOpenPreconditionError`) both use.
Any signed-in resident without `close_round` who submits the `/rounds/new` form hits a crash/500
rather than an inline denial message.

## Reproduction

1. Sign in as a resident whose session lacks the `close_round` permission (any account for which
   `assertHasPermission(..., "close_round")` is false).
2. Navigate to `/rounds/new` (page itself has no permission gate — see the separate,
   already-flagged `rounds-new-page-missing-permission-guard`).
3. Submit the create/open round form.
4. `createAndOpenRoundAction` throws `PermissionDeniedError` outside the `try`, which surfaces as
   an unhandled server-action error rather than the form's inline `state.error`.

## Suspected Code Paths

- `src/app/(org)/rounds/new/actions.ts:18-20` — session check and permission assertion sit before
  the `try` block that starts at line 30; only `RoundOpenPreconditionError` thrown inside that
  `try` is currently mapped to `{ error }`.
- `src/modules/identity/repository.ts:163` — `PermissionDeniedError` definition, the error type
  that needs mapping.
- `src/app/(org)/settings/page.tsx:20-35` — established repo pattern (from the already-committed
  `settings-page-missing-admin-guard` fix) for catching an authorization error and rendering an
  inline denial, usable as a reference for the *shape* of a catch/map, though that fix operates at
  the page level, not inside a server action returning `useActionState`-style form state.

## Root Cause Hypothesis

High confidence. The action was written assuming only `RoundOpenPreconditionError` needs inline
handling; the earlier `close_round` permission check was left as a bare `assertHasPermission`
call above the `try`, so its rejection path was never wired into the action's declared
`CreateRoundFormState` contract. This is purely a control-flow/error-mapping gap — the permission
boundary itself (whether `close_round` is the right permission, or whether profile-less household
sessions should hold it) is untouched and out of scope; see `rounds-new-profile-less-authorization`
for that separate, deliberately open question.

## Proposed Remediation

**Preferred**: Move the `assertHasPermission` call inside the existing `try` block (or wrap it in
its own try/catch) and add a catch clause that maps `PermissionDeniedError` to
`{ error: err.message }`, mirroring the existing `RoundOpenPreconditionError` handling. Do not
change who holds `close_round`, do not add a page-level redirect here (page guard is bug 2's
concern), and do not touch `createAndOpenRound`/`createRound`/`openRound` in
`src/modules/casting/repository.ts`.

**Alternatives**:
- Guard at the page level only (skip the action-level catch). Rejected as the sole fix: the report
  explicitly notes the action's own contract promises inline `state.error`, and a defense-in-depth
  action-level catch is cheap and independent of whatever page guard bug 2 adds.

**Files likely to change**:
- `src/app/(org)/rounds/new/actions.ts`

**Tests to add or update**:
- A unit/integration test invoking `createAndOpenRoundAction` with a session that lacks
  `close_round`, asserting it returns `{ error: <message> }` instead of throwing.

## Risks & Considerations

- Must not weaken or alter the `close_round` permission check itself — only its failure's error
  shape changes.
- Must not overlap with or presume the resolution of `rounds-new-profile-less-authorization`
  (a signed-in-but-no-permission user is a different case from a profile-less household session).
- Keep the diff scoped to `actions.ts`; `page.tsx` is bug 2's file.

## Open Questions

None — scope is narrow and well-supported by the existing `RoundOpenPreconditionError` handling
pattern already in the same function.
