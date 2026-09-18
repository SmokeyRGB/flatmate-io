# Bug Verification: `/rounds/new` page missing `close_round` permission guard

- **Slug**: rounds-new-page-missing-permission-guard
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`NewRoundPage` now guards on `close_round` before loading rooms or rendering the form, returning
an inline denial for a session without the permission — matching the settings page's pattern. The
new regression test confirms the denial renders and `listRooms` is never invoked; existing casting
unit suites, `tsc`, and `eslint` all stay green.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx vitest run tests/unit/casting/new-round-page-permission-guard.test.ts` | pass | mocks a session with `assertHasPermission` throwing `PermissionDeniedError`; page renders denial, `listRooms` not called |
| New / updated tests | same command as above | pass | 1/1 |
| Regression suite | `npx vitest run tests/unit/casting` | pass | 9 files / 26 tests (includes bug 1's test from the same session) |
| Type-check | `npx tsc --noEmit` | pass | no errors |
| Lint | `npx eslint "src/app/(org)/rounds/new/page.tsx" tests/unit/casting/new-round-page-permission-guard.test.ts` | pass | no errors |

## Output Excerpts

```
Test Files  1 passed (1)
     Tests  1 passed (1)
```
```
Test Files  9 passed (9)
     Tests  26 passed (26)
```

## Residual Risks

- Verified via a direct server-component invocation + `renderToStaticMarkup`, not a full Next.js
  route/browser render — consistent with the fact that no existing suite in this repo renders
  `(org)` pages end-to-end.
- Does not touch or resolve `rounds-new-profile-less-authorization`, as required.

## Recommendation

Close the bug — verified via the new regression test plus a clean sibling suite/tsc/eslint run.
