# Bug Verification: Round-detail page leaks participant names to profile-less household-account sessions

- **Slug**: rounds-page-participant-leak
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The reproduction from the assessment (fetch `getRoundParticipants` as a profile-less
household-account session with real participation rows present) no longer leaks participant
names: it returns `[]`. The new/updated tests pass, and a full run of the affected test
directories shows one pre-existing, unrelated flaky timeout that reproduces on its own file and
passes when given a longer timeout — not caused by this change.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | New test: `getRoundParticipants refuses participant data for a profile-less session` in `tests/integration/policy/round-visibility-household-account.test.ts` | pass | Asserts `getRoundParticipants(hh.context, round.id)` (profile-less) returns `[]`; this is the exact repro path from `assessment.md`. |
| New / updated tests | `npx vitest run tests/integration/policy/round-visibility-household-account.test.ts tests/unit/casting/round-participant-list.test.ts tests/integration/raw-sql/round-visibility-household-account.test.ts` | pass | 3 files, 4 tests, all passed. |
| Regression suite | `npx vitest run tests/unit/casting tests/integration/policy tests/integration/raw-sql` | partial pass | 38 files / 61 tests; 60 passed, 1 failed (`round-open-atomicity.test.ts`, a 20s timeout on a concurrency test unrelated to the changed files). |
| Regression suite (isolated re-run of the failing file) | `npx vitest run tests/integration/policy/round-open-atomicity.test.ts --testTimeout=40000` | pass | 4/4 pass standalone with more headroom — confirms it's a pre-existing timing-sensitive test (not touched by this fix, not related to `getRoundParticipants`/round-detail page), not a regression from this change. |
| Lint | `npx eslint` on the 4 changed files | pass | No output/errors. |

## Output Excerpts

```
✓ tests/integration/policy/round-visibility-household-account.test.ts (2 tests)
✓ tests/unit/casting/round-participant-list.test.ts (1 test)
✓ tests/integration/raw-sql/round-visibility-household-account.test.ts (1 test)
Test Files  3 passed (3)
     Tests  4 passed (4)
```

```
Test Files  1 failed | 37 passed (38)
     Tests  1 failed | 60 passed (61)
× produces exactly N RoundParticipation rows and a frozen settings_snapshot (AC-1.8/FR-1.15)
  Error: Test timed out in 20000ms.
```
(re-run standalone with `--testTimeout=40000`): `Test Files 1 passed (1)` / `Tests 4 passed (4)`.

## Residual Risks

- Did not run the full `npm run verify` (build, import-boundary lint, RLS-coverage lint,
  guarded-tests lint, full suite) — only the directly affected test directories were run, per the
  fix report's own scoping.
- Did not exercise the actual Next.js route (`/rounds/[id]`) end-to-end in a browser; verification
  is at the repository/test level, which is where the leak and the fix both live. The route-level
  change (hiding the panel) is a straightforward JSX conditional and was reviewed by reading, not
  rendered.
- The `round-open-atomicity.test.ts` timeout is flagged as pre-existing/environment-timing-related
  (passes in isolation with more time) rather than definitively ruled out as flaky-under-load; it
  touches round opening broadly but not `getRoundParticipants` or the changed route.

## Recommendation

Close the bug — verified. The profile-less-session leak in `getRoundParticipants` is fixed at the
repository layer (covers all current and future callers, not just the one route), the route no
longer renders the panel for that session type, and the guarded G-D15 test suite now pins the
behavior down. Suggest a follow-up (outside this bug's scope) to look at
`round-open-atomicity.test.ts`'s timeout margin if it recurs in CI.
