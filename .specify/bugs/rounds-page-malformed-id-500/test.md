# Bug Verification: Malformed round id causes 500 instead of notFound()

- **Slug**: rounds-page-malformed-id-500
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The new unit test proves `getRoundForSession` now returns `null` for a malformed id on both a
profile-less and a resident session, before either query branch runs, so the page's existing
`if (!round) notFound();` handles it — no Postgres cast error, no 500. Full `tests/unit/casting`
suite and the project's `session-context` lint pass with no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx vitest run tests/unit/casting/round-malformed-id.test.ts` | pass | Both new cases (profile-less, resident) return `null` for `"not-a-uuid"` with no DB call made. |
| New / updated tests | `npx vitest run tests/unit/casting/round-malformed-id.test.ts` | pass | 2/2 passed. |
| Regression suite | `npx vitest run tests/unit/casting` | pass | 7 files / 21 tests passed, including the pre-existing `round-open-preconditions`, `round-participant-list`, `quorum-denominator`, `room-transitions`, `state-machine`, `room-rename` suites. |
| Lint / type-check | `npx eslint src/modules/casting/repository.ts tests/unit/casting/round-malformed-id.test.ts` | pass | No output/errors. |
| Session-context lint | `npx tsx scripts/lint/session-context.ts` | pass | "Session-context lint: OK" — the project's own convention check for this file. |

## Output Excerpts

```
✓ tests/unit/casting/round-malformed-id.test.ts (2 tests) 4ms
Test Files  1 passed (1)
     Tests  2 passed (2)
```

```
Test Files  7 passed (7)
     Tests  21 passed (21)
```

## Residual Risks

- The route-level check (an actual HTTP request to `/rounds/not-a-uuid` hitting Next's
  `notFound()`) was not exercised end-to-end (no dev server / integration test for this page
  exists in the suite); verification is at the repository layer, which is where the root cause and
  fix both live, and is the layer both prior-precedent fixes (`claim`, `session-cookie`) were also
  verified at.
- Full `tests/integration/*` suites (which hit a live Supabase DB) were not run as part of this
  bug's isolated verification; they are covered by the end-of-task full casting/rounds suite run.

## Recommendation

Close the bug — verified at the repository layer with a passing regression suite and no lint
regressions; the fix is minimal and matches the codebase's existing `isUuid` guard convention.
