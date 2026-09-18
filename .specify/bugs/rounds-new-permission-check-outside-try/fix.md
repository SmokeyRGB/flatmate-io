# Bug Fix: `close_round` permission check outside the try block

- **Slug**: rounds-new-permission-check-outside-try
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Moved the `assertHasPermission(..., "close_round")` call inside `createAndOpenRoundAction`'s
existing `try` block and added `PermissionDeniedError` to the catch clause's inline-error mapping,
alongside the existing `RoundOpenPreconditionError` handling. No change to who holds
`close_round` or to the repository layer.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/app/(org)/rounds/new/actions.ts` | modified | moved permission check into `try`; catch now maps both `RoundOpenPreconditionError` and `PermissionDeniedError` to `{ error }` |
| `tests/unit/casting/create-and-open-round-permission-error.test.ts` | added | regression test pinning the inline-error behavior |

## Diff Highlights

```ts
try {
  await assertHasPermission(current.context, current.context.accountId, "close_round");
  await createAndOpenRound(current.context, title, roomIds, actor);
} catch (err) {
  if (err instanceof RoundOpenPreconditionError || err instanceof PermissionDeniedError) {
    return { error: err.message };
  }
  throw err;
}
```

## Tests Added or Updated

- `tests/unit/casting/create-and-open-round-permission-error.test.ts::createAndOpenRoundAction close_round permission handling > returns an inline error instead of throwing when close_round is missing` — mocks `getCurrentSession`, `assertHasPermission` (throwing `PermissionDeniedError`), and `createAndOpenRound`, asserting the action returns `{ error }` instead of throwing. Follows the existing `tests/unit/identity/claim-resident-profile-validation.test.ts` mocking pattern for a `"use server"` action under vitest (no Next runtime).

## Local Verification

- `npx vitest run tests/unit/casting/create-and-open-round-permission-error.test.ts` → 1/1 passed.
- `npx vitest run tests/unit/casting/round-open-preconditions.test.ts tests/unit/casting/create-and-open-round-permission-error.test.ts` → 5/5 passed (no regression in the sibling precondition suite).
- `npx tsc --noEmit` → no errors.
- `npx eslint "src/app/(org)/rounds/new/actions.ts" tests/unit/casting/create-and-open-round-permission-error.test.ts` → no errors.

## Deviations from Assessment

None — implemented exactly as proposed.

## Follow-ups

- None. The separate `rounds-new-profile-less-authorization` question (whether a profile-less
  household session should hold `close_round` at all) remains open and untouched by this fix.
