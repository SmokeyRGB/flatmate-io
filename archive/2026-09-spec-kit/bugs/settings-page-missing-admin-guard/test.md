# Bug Verification: Settings page (O20) missing admin authorization guard

- **Slug**: settings-page-missing-admin-guard
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`assertIsAdministration` now gates `SettingsPage`'s data fetch (confirmed by reading the patched
`src/app/(org)/settings/page.tsx`), and the new regression test proves a plain resident is
rejected with `ResidentListActionDeniedError` while `household_admin` is permitted — the exact
symptom the report described no longer holds at the repository-function level the page relies on.
No regressions in the identity/policy suite; type-check is clean.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Read `src/app/(org)/settings/page.tsx`; confirmed `assertIsAdministration(current.context, current.context.accountId)` runs before `getHouseholdSettings`/`listRoundsForSession`, with a catch that renders a denial message instead of the form | pass | Matches the assessment's proposed remediation exactly; no code path reaches the data fetch without the guard succeeding first |
| New test | `npx vitest run tests/integration/policy/settings-page-admin-guard.test.ts` | pass | Plain resident rejected with `ResidentListActionDeniedError`; `household_admin` resolves cleanly |
| Sibling regression test | `npx vitest run tests/integration/policy/member-role-appointment.test.ts` | pass | Confirms `assertIsAdministration`'s existing behavior is unchanged |
| Regression suite | `npx vitest run tests/integration/policy tests/unit/identity` | 1 failed / 60 passed, then 4/4 passed on isolated rerun | The one failure (`round-open-atomicity.test.ts`, a 20s timeout) is unrelated to the changed files and passed cleanly when rerun alone with a longer timeout — pre-existing flakiness under parallel load, not a regression from this fix |
| Type-check | `npx tsc --noEmit` | pass | No errors |

## Output Excerpts

```
Test Files  2 passed (2)
     Tests  3 passed (3)
```
(settings-page-admin-guard.test.ts + member-role-appointment.test.ts)

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```
(round-open-atomicity.test.ts, isolated rerun after the earlier timeout)

## Residual Risks

- No page-level/E2E test harness exists in this repo (all authorization checks are exercised at
  the repository/policy layer, per existing convention) — the fix was verified by reading the
  patched page plus a repository-level test of the guard it calls, not by rendering the actual
  Next.js route end-to-end.
- The pre-existing mismatch between the settings page's strict `household_admin`-only read guard
  and the mutation's broader `manage_settings` permission (noted in `fix.md`'s Deviations section)
  is unchanged by this fix and was not in scope.

## Recommendation

Close the bug — verified. The read-path authorization gap described by the Copilot review is
closed, the fix matches the documented O20 access rule, and no regressions were introduced.
