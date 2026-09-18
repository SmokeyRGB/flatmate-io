# Bug Fix: `forceChangeSettingWhileRoundOpen` fails `tsc --noEmit` on `updatedByAccountId`

- **Slug**: force-change-setting-updatedby-type-error
- **Fixed**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Bound the guard-narrowed `actor.accountId` to a local `const accountId` and used it in place of
`actor.accountId` at both use sites inside the closure, restoring the narrowed `string` type across
the `withSessionContext` closure boundary.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/repository.ts` | modified | Added `const accountId = actor.accountId;` after the guard; replaced `actor.accountId` with `accountId` in `assertHasPermission` and the `updatedByAccountId` column set |

## Diff Highlights

```ts
  if (!actor.accountId) throw new Error("forceChangeSettingWhileRoundOpen requires an actor accountId");
  const accountId = actor.accountId;
  await assertHasPermission(context, accountId, "manage_settings");

  return withSessionContext(context, async (tx) => {
    await tx
      .update(householdSettings)
      .set({ [field]: value, updatedAt: new Date(), updatedByAccountId: accountId })
      ...
```

## Tests Added or Updated

None — compile-time-only fix, no behavior change. Existing `procedure-lock.test.ts` suite already
covers this function at runtime.

## Local Verification

- `npx tsc --noEmit -p .` → no errors (previously failed with `TS2322` at :525).
- `npx vitest run tests/integration/policy/procedure-lock.test.ts` → 4/4 passed, unchanged.

## Deviations from Assessment

None.

## Follow-ups

None.
