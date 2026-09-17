# Bug Fix: Remove-resident dialog not centered

- **Slug**: remove-resident-modal-not-centered
- **Fixed**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Restored `margin: auto` on `.dialog` in `globals.css`, which Tailwind's preflight had zeroed out,
so the native `<dialog>` centers in the viewport again instead of pinning to the top-left.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/app/globals.css` | modified | added `margin: auto;` to `.dialog` with a one-line comment explaining why preflight requires it |

## Diff Highlights

```css
.dialog {
  margin: auto;
  background: var(--color-card);
  ...
}
```

## Tests Added or Updated

- None — pure CSS layout fix, per assessment's "Tests to add or update" (visual-only, no
  unit-testable behavior).

## Local Verification

- Commands run: none (no test targets this covers).
- Manual checks: not run in this session (no browser available here) — recommend opening
  `/members`, clicking "Remove" on a resident, and confirming the dialog now centers over the
  dimmed backdrop.

## Deviations from Assessment

None.

## Follow-ups

- None.
