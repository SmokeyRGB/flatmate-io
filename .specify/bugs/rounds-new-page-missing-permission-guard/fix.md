# Bug Fix: `/rounds/new` page renders the form without a `close_round` permission guard

- **Slug**: rounds-new-page-missing-permission-guard
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added a `close_round` permission guard to `NewRoundPage`, following the exact
guard-and-render-message pattern already used by `SettingsPage`: check the permission right after
the session check, and before loading rooms or rendering `RoundForm`, returning an inline denial
message on `PermissionDeniedError` instead of continuing.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/app/(org)/rounds/new/page.tsx` | modified | added `assertHasPermission(..., "close_round")` guard with try/catch denial render, before `listRooms`/`RoundForm` |
| `tests/unit/casting/new-round-page-permission-guard.test.ts` | added | regression test rendering the page with a denied session |

## Diff Highlights

```tsx
try {
  await assertHasPermission(current.context, current.context.accountId, "close_round");
} catch (err) {
  if (err instanceof PermissionDeniedError) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <Link href="/dashboard" className="back-link">
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        <h1 className="font-serif text-2xl font-semibold">Open a casting round</h1>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to open a casting round.
        </p>
      </div>
    );
  }
  throw err;
}

const rooms = await listRooms(current.context);
```

## Tests Added or Updated

- `tests/unit/casting/new-round-page-permission-guard.test.ts::NewRoundPage close_round permission guard > renders a denial and never loads rooms when close_round is missing` — mocks `getCurrentSession`, `assertHasPermission` (throwing `PermissionDeniedError`), and `listRooms` (throws if called), calls `NewRoundPage()` directly (an async server component), renders the returned element with `react-dom/server`'s `renderToStaticMarkup`, and asserts the denial text is present and `listRooms` was never called.

## Local Verification

- `npx vitest run tests/unit/casting/new-round-page-permission-guard.test.ts` → 1/1 passed.
- `npx vitest run tests/unit/casting` → 9 files / 26 tests passed (no regression, includes bug 1's new test).
- `npx tsc --noEmit` → no errors.
- `npx eslint "src/app/(org)/rounds/new/page.tsx" tests/unit/casting/new-round-page-permission-guard.test.ts` → no errors.

## Deviations from Assessment

None — implemented exactly as proposed, reusing `assertHasPermission`/`PermissionDeniedError`
(no new helper), matching the settings page's structural pattern. The assessment's suggested
fallback test shape (mocking + direct invocation) was the one used, since no existing suite
renders `(org)` pages under vitest yet.

## Follow-ups

- None. `src/app/(org)/rounds/new/actions.ts` (fixed separately by
  `rounds-new-permission-check-outside-try`) and the open
  `rounds-new-profile-less-authorization` question are both untouched.
