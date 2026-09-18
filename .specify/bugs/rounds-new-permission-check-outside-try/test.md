# Bug Verification: `close_round` permission check outside the try block

- **Slug**: rounds-new-permission-check-outside-try
- **Tested**: 2026-09-18
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The `assertHasPermission` call now runs inside the `try` block, and its `PermissionDeniedError`
is mapped to `{ error }` the same way `RoundOpenPreconditionError` already was. The new
regression test confirms a signed-in user lacking `close_round` gets an inline `state.error`
instead of an unhandled throw; existing casting unit suites, `tsc`, and `eslint` all stay green.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx vitest run tests/unit/casting/create-and-open-round-permission-error.test.ts` | pass | mocks a session with `assertHasPermission` throwing `PermissionDeniedError`; action returns `{ error }` instead of throwing |
| New / updated tests | same command as above | pass | 1/1 |
| Regression suite | `npx vitest run tests/unit/casting` | pass | 8 files / 25 tests, no regressions from moving the permission check into the `try` |
| Type-check | `npx tsc --noEmit` | pass | no errors |
| Lint | `npx eslint "src/app/(org)/rounds/new/actions.ts" tests/unit/casting/create-and-open-round-permission-error.test.ts` | pass | no errors |

## Output Excerpts

```
Test Files  1 passed (1)
     Tests  1 passed (1)
```
```
Test Files  8 passed (8)
     Tests  25 passed (25)
```

## Residual Risks

- Only the unit-level, mocked reproduction was exercised (no live-DB integration test hitting the
  real `assertHasPermission` against a resident lacking `close_round`) — consistent with the
  action's other error path (`RoundOpenPreconditionError`), which is also only covered indirectly
  via the repository-level integration tests, not through the action itself with a real DB.
- The separate, deliberately unresolved `rounds-new-profile-less-authorization` question (whether
  `close_round` should even be reachable by a profile-less household session) is untouched here,
  as required.

## Recommendation

Close the bug — verified via the new regression test plus a clean sibling suite/tsc/eslint run.
