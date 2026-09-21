# Bug Verification: Rooms page status select offers illegal transitions

- **Slug**: rooms-page-select-not-filtered-by-current-status
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The rooms page no longer flattens every F1-reachable target across all rooms into one shared
option list; each room's select is now built from `f1TargetStatusesFor(r.status)`, which is
filtered by `from === status`. The specific case in the report (`planned` wrongly offering
`on_hold`/`not_available`) is fixed and pinned by a new test that cross-checks every option
against `assertF1RoomTransitionAllowed` itself, so the UI and the server-action gate cannot drift
apart again undetected.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Traced `f1TargetStatusesFor("planned")` and `page.tsx`'s select rendering by hand (no dev server run — Server Component requires a full app/DB context) | pass | Returns `["planned", "open"]` only; `on_hold`/`not_available` no longer appear for a `planned` room. |
| New / updated tests | `npx vitest run tests/unit/casting/room-transitions.test.ts` | pass | 10/10 (7 pre-existing + 3 new), including the option-vs-`assertF1RoomTransitionAllowed` cross-check. |
| Regression suite | `npx vitest run tests/unit` | pass | 72/72 across 24 files, no regressions. |
| Lint / type-check | `npx eslint "src/app/(org)/rooms/page.tsx" "src/modules/casting/room-transitions.ts" "tests/unit/casting/room-transitions.test.ts"`; `npx tsc --noEmit -p .` | pass | No lint or type errors. |

## Output Excerpts

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```
```
 Test Files  24 passed (24)
      Tests  72 passed (72)
```

## Residual Risks

- No end-to-end/browser check was run against a live `/rooms` page (would require a running dev
  server + authenticated session + seeded rooms), so the visual rendering of the `<select>` was
  not screenshotted. The logic that produces its options is fully covered by unit tests and
  matches the code path the page actually calls.
- `f1TargetStatusesFor` is exported as a general helper; if `F1_REACHABLE_TRANSITIONS` changes in
  the future, this page's options update automatically and consistently with
  `assertF1RoomTransitionAllowed`, which is the intended coupling.

## Recommendation

Close the bug — verified via unit tests that directly pin the previously-wrong behavior (`planned`
no longer offers `on_hold`/`not_available`) and cross-check every rendered option against the
actual server-side gate, plus a clean full unit-test run, lint, and type-check with no
regressions.
