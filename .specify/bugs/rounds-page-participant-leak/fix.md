# Bug Fix: Round-detail page leaks participant names to profile-less household-account sessions

- **Slug**: rounds-page-participant-leak
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`getRoundParticipants` now refuses (returns `[]`) for a profile-less (household-account) session,
matching the ADR-014/G-D15 guard already present on its sibling `getRoundForSession`, so the
restriction holds regardless of caller. The round-detail route also skips rendering the
Participants panel entirely for such a session as a UI-level cleanup on top of the repository fix.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/repository.ts` | modified | `getRoundParticipants` returns `[]` immediately when `context.profileId === null`, before running the join query. |
| `src/app/(org)/rounds/[id]/page.tsx` | modified | Participants panel now only renders when `current.context.profileId !== null`. |
| `tests/integration/policy/round-visibility-household-account.test.ts` | added test | New case in the existing `[GUARDED] G-D15` suite asserting `getRoundParticipants` returns `[]` for a profile-less session with real participation rows present. |
| `tests/unit/casting/round-participant-list.test.ts` | modified | **Scope expansion** (not in original file list): this pre-existing test was reading with `hh.context` — the profile-less household-account session — and asserting the participant's name came back, i.e. it exercised and pinned the leak as "expected" behavior. Fixed it to read as the claimed resident's session (`profileId` set) instead, which is what FR-1.19/AC-1.18 actually intend it to cover. |

## Diff Highlights

```ts
// src/modules/casting/repository.ts
export async function getRoundParticipants(context: SessionContext, roundId: string) {
  if (context.profileId === null) return [];
  return withSessionContext(context, (tx) => /* ...unchanged join... */);
}
```

```tsx
// src/app/(org)/rounds/[id]/page.tsx
{current.context.profileId !== null && (
  <div className="panel-round"> ... </div>
)}
```

## Tests Added or Updated

- `tests/integration/policy/round-visibility-household-account.test.ts` — new test
  "getRoundParticipants refuses participant data for a profile-less session" pins the repository
  guard down at the policy layer (`[GUARDED]` G-D15 suite).
- `tests/unit/casting/round-participant-list.test.ts::returns display names only, nothing else` —
  updated to read as a resident session context instead of the household-account context, so it
  now asserts the correct (non-leaking) behavior rather than the bug.

## Local Verification

- Commands run:
  - `npx vitest run tests/integration/policy/round-visibility-household-account.test.ts tests/unit/casting/round-participant-list.test.ts tests/integration/raw-sql/round-visibility-household-account.test.ts` → 3 files, 4 tests, all passed.
  - `npx eslint "src/modules/casting/repository.ts" "src/app/(org)/rounds/[id]/page.tsx" "tests/integration/policy/round-visibility-household-account.test.ts" "tests/unit/casting/round-participant-list.test.ts"` → no output (clean).
- Manual checks: read `src/modules/identity/auth.ts` to confirm `claimResidentProfile` doesn't itself return a `SessionContext`, and built the resident context manually (`{ accountId, householdId, profileId: profile.id }`) matching `SessionContext`'s shape used elsewhere in the same test file's `TestHousehold.context`.
- Did not run the full `npm run verify` (build/import-boundary/rls-coverage/full suite) — out of scope for this targeted fix; the guarded-tests lint script was not run, see Follow-ups.

## Deviations from Assessment

- Expanded scope beyond the assessment's "Files likely to change" list: also fixed
  `tests/unit/casting/round-participant-list.test.ts`, which the assessment did not flag. It was
  discovered during verification — its existing assertion actively depended on the leak (reading
  with the profile-less `hh.context` and expecting the participant's name back), so leaving it
  unchanged would have made it fail after the fix, or worse, made it pass by still leaking. Root
  cause and fix are otherwise exactly as assessed.
- Did not add a raw-SQL-layer test for `getRoundParticipants` specifically. The existing
  `tests/integration/raw-sql/round-visibility-household-account.test.ts` guards a different
  surface (absence of Application-derived columns on the base `casting_round` table, for
  `getRoundForSession`) — `getRoundParticipants` reads `round_participation`/`resident_profile`
  directly with no admin view involved, so the policy-layer guard (a `context.profileId === null`
  branch that short-circuits before any query runs) is the entire enforcement; there is no
  separate "raw SQL bypasses a view" scenario to cover here the way there is for the admin view.

## Follow-ups

- Confirm whether `test/guarded.manifest.json`'s G-D15 entry needs its `testFiles` list updated to
  also name the new case's location (it's an additional `it()` in an already-listed file, so no
  path change is needed, but flagging for the guarded-tests lint script,
  `scripts/lint/guarded-tests.ts`, to double check).
- Consider running the full `npm run verify` before merging, since it wasn't run here.
