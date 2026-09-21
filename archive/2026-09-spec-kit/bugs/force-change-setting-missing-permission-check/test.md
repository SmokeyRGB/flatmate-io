# Bug Verification: `forceChangeSettingWhileRoundOpen` skips the `manage_settings` permission check

- **Slug**: force-change-setting-missing-permission-check
- **Tested**: 2026-09-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

`git diff src/modules/casting/repository.ts` confirms the fix is in place: `assertHasPermission(context, actor.accountId, "manage_settings")` now runs before any read/write in `forceChangeSettingWhileRoundOpen`, mirroring `updateHouseholdSettingsWithProcedureLock`. The new regression test proves an unprivileged resident is rejected with `PermissionDeniedError`, and the full integration suite plus the pre-existing admin-actor success case still pass — no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | New test: `forceChangeSettingWhileRoundOpen(...)` called by a plain resident actor | pass | Rejects with `PermissionDeniedError`, matching the assessment's reproduction (step 3 no longer succeeds for an unprivileged actor) |
| New / updated tests | `npx vitest run tests/integration/policy/procedure-lock.test.ts` | pass | 4/4 tests pass, including the new case and the pre-existing admin-actor success case at line 64 (unaffected since that actor is `manage_settings`-implicit) |
| Regression suite | `npx vitest run tests/integration` | pass | 31 files / 43 tests pass, including concurrent unrelated work in the tree (other bug fixes in progress on this branch) — no interaction with this change |
| Type-check | `npx tsc --noEmit -p .` | pre-existing failure, unrelated | One error on an unchanged line (`updatedByAccountId: actor.accountId`, `string \| null` vs `string`) inside the same function — confirmed via `git diff` that this line is untouched by the fix's diff hunk (context line, not an added line), so it predates this fix and is out of scope here |

## Output Excerpts

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```

```
Test Files  31 passed (31)
     Tests  43 passed (43)
```

## Residual Risks

- Pre-existing `tsc --noEmit` error at `src/modules/casting/repository.ts:525` (`updatedByAccountId: actor.accountId` — `string | null` not assignable) is unrelated to this fix (confirmed unchanged in the diff) but was surfaced during verification; worth a separate bug report/fix since it's a real type-safety gap on the same function.
- No UI/route currently calls `forceChangeSettingWhileRoundOpen` (confirmed in the assessment), so this fix could not be exercised through an end-to-end HTTP/UI path — verification is at the repository-function level only, which matches how the function is actually invoked today (tests only).

## Recommendation

Close the bug — verified via the new permission-denial test, the untouched admin success path, and the full integration suite. Consider filing a separate low-severity bug for the pre-existing `updatedByAccountId` type error found during type-check, since it's out of scope for this fix.
