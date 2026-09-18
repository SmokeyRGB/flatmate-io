# Bug Verification: F1 room-transition repository path does not enforce F1's reachable-transition subset

- **Slug**: room-transitions-f1-scope-not-enforced
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The reported gap — `transitionRoomStatus` accepting `open->promised`/`promised->occupied` and
their reverses despite F1's own comments and requirements scoping those out — is closed. The new
`assertF1RoomTransitionAllowed` guard rejects all five declared-but-F1-unreachable pairs while
still accepting every `F1_REACHABLE_TRANSITIONS` pair, and the `/rooms` UI selector no longer
offers `promised`/`occupied` as choices, so it can no longer drive `transitionRoomAction` into a
combination the repository would reject. No regressions found in the casting module's test suite.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `tests/unit/casting/room-transitions.test.ts` — `assertF1RoomTransitionAllowed(...)` called directly for `open->promised`, `promised->occupied`, `promised->open`, `occupied->promised`, `occupied->open` | pass | Each throws `InvalidRoomTransitionError`; this is the exact call `transitionRoomStatus` makes since the fix, so it exercises the reported symptom directly (unit-level, not through the DB-backed repository function, which requires a live session/DB not available in this environment — see Residual Risks). |
| New / updated tests | `npx vitest run tests/unit/casting/room-transitions.test.ts` | pass | 7/7 (4 pre-existing unchanged + 3 new). |
| Regression suite | `npx vitest run tests/unit/casting` | pass | 19/19 across the whole casting module; no test weakened or removed. |
| Lint / type-check | `npx eslint src/modules/casting/room-transitions.ts src/modules/casting/repository.ts "src/app/(org)/rooms/page.tsx"` | pass | No output/errors. |
| Type-check | `npx tsc --noEmit -p .` | pass | No errors attributable to the three changed files (checked by filtering tsc output for those paths). |

## Output Excerpts

```
RUN  v5.0.1 ...
Test Files  1 passed (1)
     Tests  7 passed (7)
```

```
RUN  v5.0.1 ...
Test Files  6 passed (6)
     Tests  19 passed (19)
```

## Residual Risks

- `transitionRoomStatus` itself (the DB-backed repository function in `repository.ts`) was not
  exercised end-to-end against a real database in this verification — only the guard function it
  now calls (`assertF1RoomTransitionAllowed`) was tested directly, plus a code-level confirmation
  that `repository.ts` calls it. This is consistent with how the rest of the casting module's unit
  suite is structured (guard/logic unit tests, not DB-integration tests) and matches the fix's own
  "Local Verification" section.
- The UI selector fix narrows options based on `F1_REACHABLE_TRANSITIONS`'s target states; no
  component/e2e test exists for `rooms/page.tsx` in this repo to assert the rendered `<option>`
  list directly, so this was verified by code inspection (the `assessment.md`/`fix.md` diff
  highlights) rather than an automated UI test. Flagged in `fix.md`'s Follow-ups as a possible gap
  if `transitionRoomAction` needs hardening against forged form submissions.

## Recommendation

Close the bug — verified via direct exercise of the new guard (both the previously-permitted
unreachable pairs and the still-reachable pairs), a clean regression run of the casting module's
existing tests, and clean lint/type-check on all three changed files. The UI-selector expansion
noted in the assessment was applied and is covered by code review; an automated UI-level assertion
is a reasonable but non-blocking follow-up.
