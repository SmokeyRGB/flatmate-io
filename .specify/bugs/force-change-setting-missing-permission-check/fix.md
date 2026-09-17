# Bug Fix: `forceChangeSettingWhileRoundOpen` skips the `manage_settings` permission check

- **Slug**: force-change-setting-missing-permission-check
- **Fixed**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added the missing `assertHasPermission(context, actor.accountId, "manage_settings")` check to
`forceChangeSettingWhileRoundOpen`, mirroring the sibling `updateHouseholdSettingsWithProcedureLock`
exactly, so the function is no longer callable by any signed-in resident regardless of permissions.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/repository.ts` | modified | Added `assertHasPermission` call before `withSessionContext`, matching the pattern in `updateHouseholdSettingsWithProcedureLock` |
| `tests/integration/policy/procedure-lock.test.ts` | added test | New case: a plain resident with no `manage_settings` permission gets `PermissionDeniedError` from `forceChangeSettingWhileRoundOpen` |

## Diff Highlights

```ts
export async function forceChangeSettingWhileRoundOpen(
  context: SessionContext,
  field: LockedSettingsField,
  value: unknown,
  openRoundId: string,
  actor: Actor,
) {
  if (!actor.accountId) throw new Error("forceChangeSettingWhileRoundOpen requires an actor accountId");
  await assertHasPermission(context, actor.accountId, "manage_settings");

  return withSessionContext(context, async (tx) => {
    await tx
      ...
```

## Tests Added or Updated

- `tests/integration/policy/procedure-lock.test.ts` — "refuses a plain resident with no
  manage_settings permission from forcing a change while open" — pins down that an unprivileged
  resident actor cannot call `forceChangeSettingWhileRoundOpen`, mirroring the existing sibling
  test for `updateHouseholdSettingsWithProcedureLock`.

## Local Verification

- Commands run: `npx vitest run tests/integration/policy/procedure-lock.test.ts` → 4 passed (1
  new test + 3 pre-existing, including the household-creator success path at line 64, which still
  passes since that actor is admin-implicit for `manage_settings`).

## Deviations from Assessment

None — applied exactly as proposed.

## Follow-ups

None.
