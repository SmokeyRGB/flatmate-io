# Bug Fix: Malformed round id causes 500 instead of notFound()

- **Slug**: rounds-page-malformed-id-500
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added an `isUuid` guard at the top of `getRoundForSession` (repository layer) so a malformed
`roundId` returns `null` before either query branch runs, instead of letting Postgres's `::uuid`
cast (or the Drizzle-builder branch) throw a raw DB error. The page's existing
`if (!round) notFound();` now handles malformed ids for free.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/repository.ts` | modified | Imported `isUuid` from `@/db/session-context`; added an early-return guard (`if (!isUuid(roundId)) return null;`) at the top of `getRoundForSession`, before the profile-less raw-SQL branch and the resident Drizzle branch. |
| `tests/unit/casting/round-malformed-id.test.ts` | added test | New unit test file; no DB fixture needed since the guard returns before `withSessionContext` runs. |

## Diff Highlights

```ts
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
...
export async function getRoundForSession(context: SessionContext, roundId: string) {
  // A route param is untrusted input — fail closed on a malformed id the same way
  // claim/actions.ts and session-cookie.ts do, instead of letting Postgres's `::uuid` cast (or
  // the Drizzle-builder branch below) throw a raw DB error up through the page.
  if (!isUuid(roundId)) return null;
  return withSessionContext(context, async (tx) => {
    ...
```

## Tests Added or Updated

- `tests/unit/casting/round-malformed-id.test.ts::getRoundForSession malformed id handling > returns null for a malformed id on a profile-less session` — pins the profile-less branch.
- `tests/unit/casting/round-malformed-id.test.ts::getRoundForSession malformed id handling > returns null for a malformed id on a resident session` — pins the resident branch (also vulnerable, per assessment).

## Local Verification

- `npx vitest run tests/unit/casting/round-malformed-id.test.ts` → 2 passed.
- `npx vitest run tests/unit/casting` (full unit/casting suite, 7 files) → 21 passed, no regressions.

## Deviations from Assessment

None — implemented exactly as proposed (repository-level `isUuid` guard, no page-level change).

## Follow-ups

- None required; existing `[GUARDED]` tests (`round-visibility-household-account.test.ts` etc.) were not touched and still pass under the new guard.
