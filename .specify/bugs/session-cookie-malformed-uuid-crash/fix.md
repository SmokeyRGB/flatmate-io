# Bug Fix: Malformed session cookie crashes with 500 instead of signing out

- **Slug**: session-cookie-malformed-uuid-crash
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`getCurrentSession()` now validates both cookie segments (`sessionId`, `householdId`) as UUIDs
before calling `resolveSessionContext`, returning `null` on a malformed segment instead of letting
`withSessionContext`'s `assertUuid` throw an unhandled `Error`. The UUID check is exposed from
`src/db/session-context.ts` as an exported `isUuid()` helper so it isn't duplicated.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/db/session-context.ts` | modified | Exported `isUuid(value: string): boolean`, backed by the existing `UUID_RE`; `assertUuid` now delegates to it. No behavior change for existing callers. |
| `src/modules/identity/session-cookie.ts` | modified | `getCurrentSession()` imports `isUuid` and returns `null` immediately if either the `sessionId` or `householdId` segment parsed from the cookie fails the UUID check, before calling `resolveSessionContext`. |
| `tests/unit/identity/session-cookie-malformed-uuid.test.ts` | added | New test file (none existed for this module) covering the malformed-cookie no-crash behavior. |

## Diff Highlights

```ts
// src/db/session-context.ts
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
```

```ts
// src/modules/identity/session-cookie.ts
if (!isUuid(sessionId) || !isUuid(householdId)) return null;

const context = await resolveSessionContext(sessionId, householdId);
```

## Tests Added or Updated

- `tests/unit/identity/session-cookie-malformed-uuid.test.ts::returns null for a malformed household segment without querying the DB`
- `tests/unit/identity/session-cookie-malformed-uuid.test.ts::returns null for a malformed session-id segment without querying the DB`
- `tests/unit/identity/session-cookie-malformed-uuid.test.ts::still resolves a well-formed cookie` — regression guard for the valid-cookie path

These mock `next/headers` (to supply a fake cookie value) and `@/modules/identity/repository`'s
`resolveSessionContext` (to assert it is never called for malformed input, and is called with the
right arguments for valid input), avoiding any real DB/network dependency — appropriate for this
pure parsing/validation logic, unlike the project's other identity tests which intentionally hit
live Supabase Auth.

## Local Verification

- Command run: `npx vitest run tests/unit/identity/session-cookie-malformed-uuid.test.ts` →
  3 passed, 0 failed.
- Did not run the full `tests/` suite (many integration tests require a live DB/Supabase
  connection per `vitest.config.ts` comments; out of scope for this isolated fix — confined the
  local check to the new/affected file per the "no destructive or network-dependent suites without
  consent" guardrail).

## Deviations from Assessment

None. Implemented the preferred remediation exactly as proposed: validate before the value reaches
`assertUuid`, reusing the existing `UUID_RE` pattern (exported as `isUuid`) rather than duplicating
a regex.

## Follow-ups

- None required. The existing `resident-sign-in-validation.test.ts` precedent and this fix now
  cover both known callers (`signIn` and `getCurrentSession`) that receive untrusted
  session/household identifiers ahead of `withSessionContext`.
