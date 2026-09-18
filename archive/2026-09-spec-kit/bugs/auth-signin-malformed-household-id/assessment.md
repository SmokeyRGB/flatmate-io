# Bug Assessment: resident sign-in crashes on malformed householdId

- **Slug**: auth-signin-malformed-household-id
- **Created**: 2026-09-18
- **Source**: pasted text (GitHub Copilot PR #4 review comment on `src/modules/identity/auth.ts`)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> The new guard only handles blank values. A non-empty malformed `householdId` (for example
> `not-a-uuid`) still reaches `withSessionContext` at line 269, where `assertUuid` throws a plain
> `Error`; `signInAction` catches only `SignInError`, so this input still produces an unhandled 500
> rather than an inline sign-in error. Validate the UUID before the DB lookup (and return/throw a
> `SignInError`) using the shared `isUuid` helper, as the claim action and cookie parser do.

## Symptom

Resident sign-in (`signIn` with `kind: "resident"`) with a non-blank but non-UUID-shaped
`householdId` (e.g. `not-a-uuid`) throws a plain `Error` from `assertUuid` inside
`withSessionContext` instead of a `SignInError`. Any caller (`signInAction`) that only catches
`SignInError` lets this escape as an unhandled 500 instead of an inline sign-in error message.
Expected: the same graceful `SignInError` path as blank-field input.

## Reproduction

1. Submit the resident sign-in form with `householdId = "not-a-uuid"` and a non-blank
   `displayName`/`password`.
2. `signIn()` (`src/modules/identity/auth.ts`) passes the `.trim()` blank check at line 257 (it's
   non-empty).
3. `withSessionContext(bootstrapContext, ...)` is called at line 269 with this `householdId`.
4. `assertUuid` (`src/db/session-context.ts:26-30`) throws a plain `Error`, not a `SignInError`.
5. `signInAction` (presumed in `src/app/(auth)/**/actions.ts` — not yet located, see Open
   Questions) catches only `SignInError` and lets this propagate as an unhandled exception →
   500 instead of an inline error.

## Suspected Code Paths

- `src/modules/identity/auth.ts:257` — the existing guard: `if (!input.householdId.trim() || !input.displayName.trim())`. Only rejects blank/whitespace-only values, not malformed-but-non-blank ones.
- `src/modules/identity/auth.ts:269` — `withSessionContext(bootstrapContext, ...)` call that reaches `assertUuid` with the unvalidated `householdId`.
- `src/db/session-context.ts:10-12` — `isUuid()`, the shared shape-check helper already used by the claim action and cookie parser for this exact class of bug.
- `src/db/session-context.ts:26-30` — `assertUuid()`, which throws a plain `Error` (not `SignInError`) — the proximate cause of the unhandled 500.
- `src/app/(auth)/claim/actions.ts` — prior fix's reference usage of `isUuid` for the same bug class (pattern to mirror).
- `src/modules/identity/session-cookie.ts` — prior fix's reference usage of `isUuid` for the same bug class (pattern to mirror).

## Root Cause Hypothesis

High confidence. The blank-check added to `signIn`'s resident branch (comment at lines 254-256
explicitly says it exists to reject input "before it hits `withSessionContext`'s `assertUuid`,
whose plain `Error` isn't a `SignInError`") was scoped too narrowly — it defends only against
empty strings, not against non-empty strings that aren't UUID-shaped. `assertUuid` in
`session-context.ts` throws a plain `Error` unconditionally on shape mismatch, and `signIn`'s
resident branch has no shape check before delegating to it, unlike `claimResidentProfile`'s and
the cookie parser's call sites, which both already gate on `isUuid` first.

## Proposed Remediation

**Preferred**: In `src/modules/identity/auth.ts`, import `isUuid` from `@/db/session-context`
(already imported as `withSessionContext, type SessionContext` from that module — extend the
import) and extend the existing guard at line 257 to also reject a non-UUID-shaped
`householdId`, throwing `SignInError` before `withSessionContext` is ever called:

```ts
if (!input.householdId.trim() || !input.displayName.trim()) {
  throw new SignInError("Household and name are required");
}
if (!isUuid(input.householdId)) {
  throw new SignInError("Invalid household");
}
```

This mirrors the pattern already used in `claim/actions.ts` and `session-cookie.ts`, reuses the
existing shared helper (no new validation logic), and keeps the fix at the single call site named
in the report — the one remaining place this class of bug was missed.

**Alternatives** (not preferred):
- Wrap `assertUuid`'s throw and re-map to `SignInError` at the call site — rejected: this
  re-validates at the wrong layer (inside `withSessionContext`, after a transaction has already
  started) and diverges from the established `isUuid`-before-call pattern used everywhere else.
- Make `assertUuid` throw a more specific/catchable error type shared across modules — rejected as
  overkill for this bug; `session-context.ts`'s docstring frames `assertUuid` as an internal,
  fail-closed defense-in-depth check, not a caller-facing validation API.

**Files likely to change**:
- `src/modules/identity/auth.ts`

**Tests to add or update**:
- A unit/integration test for `signIn({ kind: "resident", householdId: "not-a-uuid", ... })`
  asserting it throws `SignInError` (not a plain `Error`), analogous to existing blank-field
  coverage if present.

## Risks & Considerations

- Low risk: purely additive input validation using an already-vetted helper; no schema/API
  surface change.
- `signInAction`'s exact location/behavior was not directly located in this pass (see Open
  Questions) — the fix is scoped to `signIn()` itself, which is the shared root regardless of how
  many actions call it, per the root-cause-over-symptom principle.

## Open Questions

- [NEEDS CLARIFICATION: exact file/path of `signInAction` — not located during this assessment;
  not required to apply the fix, since the fix belongs in the shared `signIn()` function all
  callers route through, but useful to confirm test coverage reaches it.]
