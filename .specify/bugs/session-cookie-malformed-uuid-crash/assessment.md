# Bug Assessment: Malformed session cookie crashes with 500 instead of signing out

- **Slug**: session-cookie-malformed-uuid-crash
- **Created**: 2026-09-18
- **Source**: pasted text (Copilot review, PR #4, file `src/modules/identity/session-cookie.ts` around line 47)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim)

> A user-controlled/tamperable cookie with a malformed household component (for example
> `sessionId.not-a-uuid`) reaches `resolveSessionContext`, where `withSessionContext` throws its
> plain UUID-validation `Error`; this turns an invalid or stale cookie into a 500 instead of
> treating the user as signed out. Validate the parsed IDs or catch the validation failure and
> return `null` so malformed cookies follow the documented no-session path.

## Symptom

`getCurrentSession()` in `session-cookie.ts` is documented (line 33-35) to return `null` for "no
cookie, or the session it names is revoked/expired/gone — never partially trusts a stale cookie."
Instead, a cookie whose household segment isn't a valid UUID (e.g. tampered, stale from a schema
change, or truncated by a browser/proxy) causes an uncaught `Error` to propagate out of
`resolveSessionContext` → `withSessionContext` → `assertUuid`, turning what should be a "treat as
signed out" case into an unhandled exception (500) instead of the documented `null`.

## Reproduction

1. Set the `flatmate_session` cookie to a value with a syntactically-invalid household segment,
   e.g. `flatmate_session=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.not-a-uuid`.
2. Call any code path that awaits `getCurrentSession()` (e.g. a server component/route handler).
3. Observe an unhandled `Error: householdId is not a valid UUID: not-a-uuid` instead of a `null`
   result / redirect-to-sign-in behavior.

## Suspected Code Paths

- `src/modules/identity/session-cookie.ts:41-48` — `getCurrentSession()` splits the raw cookie on
  `.` and passes the two segments (`sessionId`, `householdId`) to `resolveSessionContext` without
  any format validation. Neither segment is checked for UUID shape before use.
- `src/modules/identity/repository.ts:242-247` — `resolveSessionContext()` builds a bootstrap
  `SessionContext` directly from the unvalidated `householdId` and passes it straight into
  `withSessionContext`.
- `src/db/session-context.ts:19-23, 45-53` — `assertUuid()` throws a plain `Error` (not a
  domain/sign-in error type) when a `SessionContext` field fails `UUID_RE.test()`;
  `withSessionContext()` calls `assertUuid` unconditionally for `accountId`, `householdId`, and
  (if non-null) `profileId` before opening the transaction.
- `src/modules/identity/auth.ts:241-247` — an existing, directly analogous fix: `signIn()` already
  guards against blank `householdId`/`displayName` fields precisely to "reject before householdId
  hits `withSessionContext`'s `assertUuid`, whose plain Error isn't a SignInError and would
  otherwise surface as an unhandled crash." This confirms the failure mode is known and previously
  addressed for one caller (sign-in) but not for the cookie-read path.

## Root Cause Hypothesis

High confidence. `assertUuid` is a hard, throw-on-invalid guard designed for a context that is
assumed to already be well-formed (it exists to stop raw SQL interpolation of non-UUID strings,
not to do user-input validation). `getCurrentSession()` is the one caller that feeds it directly
from untrusted, attacker-tamperable cookie data without a validation layer in between, and its own
docstring commits it to returning `null` on any malformed session data. The gap is that nothing
between the cookie split and `assertUuid` validates shape, and nothing catches `assertUuid`'s
generic `Error`.

## Proposed Remediation

**Preferred**: Validate `sessionId` and `householdId` for UUID shape in `getCurrentSession()`
immediately after splitting the cookie value, before calling `resolveSessionContext`, and return
`null` if either fails. This keeps the fix local to the one caller that receives untrusted input,
mirrors the existing precedent in `auth.ts:241-247` (validate before the value reaches
`assertUuid`), and requires no changes to `db/session-context.ts`'s intentionally strict
fail-closed behavior (which other, already-trusted callers throughout `repository.ts`/`auth.ts`
correctly rely on).

A shared UUID regex/helper should be reused rather than duplicated — check whether `UUID_RE` in
`src/db/session-context.ts` is exported/reusable, or add a small shared helper (e.g.
`isUuid(value: string): boolean`) if not, rather than inlining a second regex literal.

**Alternatives**:
- Catch the `Error` thrown by `assertUuid` inside `resolveSessionContext` (or `getCurrentSession`)
  and treat any exception as "no session." Rejected as primary approach because it uses exceptions
  for expected-input control flow, and a bare `catch` there risks silently swallowing unrelated
  errors (e.g. real DB failures) as "no session," which is a worse failure mode than a 500 for
  genuine faults.

**Files likely to change**:
- `src/modules/identity/session-cookie.ts` (add UUID validation before calling
  `resolveSessionContext`)
- `src/db/session-context.ts` (only if `UUID_RE`/a validator needs to be exported for reuse)
- A test file covering `getCurrentSession` (likely new, e.g.
  `src/modules/identity/session-cookie.test.ts`, or wherever identity module tests already live —
  none found yet under `src/modules/identity/` at assessment time)

**Tests to add or update**:
- `getCurrentSession()` returns `null` (not a thrown error) when the cookie's household segment is
  not a valid UUID.
- `getCurrentSession()` returns `null` when the cookie's session-id segment is not a valid UUID.
- `getCurrentSession()` still returns the resolved session for a well-formed, valid cookie
  (regression guard).

## Risks & Considerations

- Must not weaken `withSessionContext`'s fail-closed guarantee for its other callers — the fix
  should stay scoped to the cookie-parsing boundary, not loosen `assertUuid` itself.
- Should reuse the existing UUID pattern/helper rather than introduce a second, possibly
  inconsistent regex.

## Open Questions

- [NEEDS CLARIFICATION: no existing test file was found for `src/modules/identity/session-cookie.ts`
  — confirm during `/speckit-bug-test` whether one should be created from scratch or added to an
  existing identity-module test suite.]
