# Bug Assessment: Empty householdId on resident sign-in crashes with unhandled Error

- **Slug**: resident-signin-empty-household-id
- **Created**: 2026-09-17
- **Source**: pasted text (Next.js runtime error overlay)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

```
## Error Type
Runtime Error

## Error Message
householdId is not a valid UUID: 

    at assertUuid (src\db\session-context.ts:21:11)
    at withSessionContext (src\db\session-context.ts:50:3)
    at signIn (src\modules\identity\auth.ts:250:47)
    at signInAction (src\app\(auth)\sign-in\actions.ts:27:23)
    at SignInPage (src\app\(auth)\sign-in\page.tsx:4:10)

Next.js version: 16.3.5 (Turbopack)
```

User note: leaving the household id blank on the resident sign-in tab produces this crash instead of a normal validation error.

## Symptom

Submitting the resident sign-in form with an empty "Household" field throws an unhandled `Error` from `assertUuid`, which surfaces as a Next.js runtime error page instead of the inline `field-error` message the form already renders for other sign-in failures (e.g. wrong password).

## Reproduction

1. Go to `/sign-in`, switch to the "Resident" tab.
2. Leave "Household" empty, fill in a name and password, submit.
3. `signInAction` → `signIn({kind: "resident", householdId: "", ...})` → `withSessionContext` → `assertUuid("", "householdId")` throws a plain `Error`.
4. `signInAction`'s catch only rethrows non-`SignInError` errors (actions.ts:35-40), so it propagates to Next.js as an unhandled runtime error.

## Suspected Code Paths

- `src/app/(auth)/sign-in/sign-in-form.tsx:55-61` — the `householdId` input has no `required` attribute and the form has `noValidate`, so an empty value reaches the server action unfiltered.
- `src/modules/identity/auth.ts:233-264` — `signIn`'s resident branch passes `input.householdId` straight into `withSessionContext` (line 250) with no emptiness/format check first.
- `src/db/session-context.ts:19-23` — `assertUuid` is the generic RLS-context guard; it correctly rejects malformed input but throws a plain `Error`, which is by design not caught as a user-facing `SignInError` (`actions.ts:35-40`).

## Root Cause Hypothesis

**Confidence: high.** `assertUuid` is doing its job (never let a non-UUID reach `SET LOCAL`), but nothing upstream of it validates that the resident sign-in form actually collected a household id before calling `signIn`. The resident branch of `signIn` is the one shared entry point every resident-mode caller (currently just `signInAction`) routes through, and it has no guard for missing/malformed `householdId` or `displayName` — it assumes the caller already has a real value (per the comment at auth.ts:229-231, "householdId is taken as already known by the caller"), which the UI doesn't yet enforce.

## Proposed Remediation

**Preferred**: Add an early guard in `signIn`'s resident branch (`src/modules/identity/auth.ts`, right after entering the `else` at line ~241) that throws `SignInError` (not a plain `Error`) when `householdId` or `displayName` is empty/whitespace, e.g. `"Household and name are required"`. This is the one place all resident-mode sign-in attempts pass through, so it fixes the root cause for any future caller too, not just this form. `signInAction`'s existing `catch (err) { if (err instanceof SignInError) return { error: err.message } }` then handles it as a normal inline form error — no change needed there.

As a secondary, cheap defense-in-depth measure, add `required` to the `householdId`/`displayName`/`email`/`password` inputs in `sign-in-form.tsx` (native HTML validation, no JS) — this also improves the household sign-in tab's email field, which has the same gap. Not a substitute for the server-side guard, since the server action is the trust boundary.

**Files likely to change**:
- `src/modules/identity/auth.ts` (add guard in `signIn`'s resident branch)
- `src/app/(auth)/sign-in/sign-in-form.tsx` (add `required` attributes)
- test file covering `signIn`/`auth.ts` (wherever existing sign-in tests live — none found under a quick scan; check `test/`/`tests/`)

**Tests to add or update**:
- `signIn({kind: "resident", householdId: "", displayName: "x", password: "y"})` rejects with `SignInError`, not a raw `Error`.
- Same for empty/whitespace `displayName`.
- Existing valid resident sign-in path still succeeds (regression guard).

## Risks & Considerations

- Low risk: additive validation only, no schema/migration changes.
- Message wording for the new `SignInError` should stay in English (identity module is implementation-facing per ADR-012) and avoid confirming/denying household existence beyond the current "No such resident in this household" message already used a few lines later.

## Open Questions

- [NEEDS CLARIFICATION: is there an existing test file for `src/modules/identity/auth.ts` to extend, or does this need a new one?]
