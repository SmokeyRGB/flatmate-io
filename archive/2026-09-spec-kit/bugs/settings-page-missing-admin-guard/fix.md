# Bug Fix: Settings page (O20) missing admin authorization guard

- **Slug**: settings-page-missing-admin-guard
- **Fixed**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`SettingsPage` now calls `assertIsAdministration(current.context, current.context.accountId)`
right after the sign-in check and before fetching household settings or round data, matching
O20's documented `household_admin`-only access rule. A non-admin caller is caught and shown a
short "administration only" message instead of the data.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/app/(org)/settings/page.tsx` | modified | Added `assertIsAdministration` call guarding the data fetch; wrapped in try/catch to render a friendly message on `ResidentListActionDeniedError`, mirroring the existing pattern in `src/app/(org)/members/page.tsx` |
| `tests/integration/policy/settings-page-admin-guard.test.ts` | added test | Pins that `assertIsAdministration` rejects a plain resident and permits `household_admin`, the exact guard the page now relies on |

## Diff Highlights

```tsx
try {
  await assertIsAdministration(current.context, current.context.accountId);
} catch (err) {
  if (err instanceof ResidentListActionDeniedError) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <Link href="/dashboard" className="back-link">
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        <h1 className="font-serif text-2xl font-semibold">Household settings</h1>
        <p className="text-sm text-muted-foreground">This page is for administration only.</p>
      </div>
    );
  }
  throw err;
}
```

## Tests Added or Updated

- `tests/integration/policy/settings-page-admin-guard.test.ts::"refuses a plain resident and permits household_admin"` — asserts `assertIsAdministration` throws `ResidentListActionDeniedError` for a plain resident account and resolves for `household_admin`.

## Local Verification

- Commands run:
  - `npx vitest run tests/integration/policy/settings-page-admin-guard.test.ts tests/integration/policy/member-role-appointment.test.ts` → 2 files, 3 tests passed.
  - `npx tsc --noEmit` → clean, no errors.
- Manual checks: none beyond the above (no page-level/E2E test harness exists in this repo; all authorization checks are exercised at the repository/policy layer, per existing test style).

## Deviations from Assessment

- The assessment's open question ("how are `ResidentListActionDeniedError` throws surfaced from a
  page context?") is resolved by precedent: `src/app/(org)/members/page.tsx` already establishes
  the pattern (try/catch around the admin-gated call, catch the specific error class, render an
  inline message). This fix follows that exact precedent rather than inventing a new error
  boundary or relying on a Next.js `error.tsx` (none exists in the route tree).
- Noted but out of scope: the settings *mutation* path
  (`updateHouseholdSettingsWithProcedureLock`) authorizes via the broader `manage_settings`
  permission (`assertHasPermission`), not the strict `household_admin`-only
  `assertIsAdministration` used here for the read path. This mismatch between read-strictness and
  write-permissiveness already existed before this fix and matches O20's documented rule for the
  *page* ("Nur household_admin"); reconciling the mutation's permission model, if it needs
  reconciling, is a separate concern not raised by this bug report.

## Follow-ups

- None required for this bug. If `manage_settings` is ever intentionally grantable to non-admins
  for the mutation, revisit whether O20's read-page access rule should also loosen to match, via
  a separate decision (not unilaterally).
