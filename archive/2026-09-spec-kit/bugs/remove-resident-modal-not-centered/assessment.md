# Bug Assessment: Remove-resident dialog not centered/displayed correctly

- **Slug**: remove-resident-modal-not-centered
- **Created**: 2026-09-17
- **Source**: pasted text + screenshot ("the removal dialog is not correctly displayed")
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

User attached a screenshot of the "Remove Sam?" confirmation `<dialog>` (from
`003-remove-resident-modal`) open in the browser. Instead of appearing centered over a dimmed
backdrop, the dialog box renders pinned near the top-left of the viewport, overlapping the page
content behind it rather than floating centered above it.

## Symptom

Native `<dialog>` opened via `showModal()` does not use the browser's built-in auto-centering; it
renders at the top-left of its containing block instead of centered in the viewport. Expected:
centered dialog with dimmed backdrop, as specced in `docs/09-Design-System.md`'s "Dialogs &
confirmations".

## Reproduction

1. Go to `/members` as an org member with removal rights.
2. Click "Remove" next to a resident who joined via join code.
3. Observe the dialog appears top-left-ish instead of centered.

## Suspected Code Paths

- `src/app/globals.css:1` — `@import "tailwindcss"` pulls in Tailwind v4's preflight, which
  resets `margin: 0` on all elements, including `dialog`.
- `src/app/globals.css:295-303` — `.dialog` class sets background/border/shadow/width but never
  sets `margin`, relying on the UA stylesheet's default `dialog:modal { margin: auto }` for
  centering — which preflight already zeroed out.
- `src/app/(org)/members/remove-member-form.tsx:43` — renders `<dialog ref={dialogRef}
  className="dialog" ...>`, opened via `dialogRef.current?.showModal()` — no other centering
  logic exists here.

## Root Cause Hypothesis

Confidence: high. Browsers center a modal `<dialog>` purely via the UA stylesheet rule
`dialog:modal { position: fixed; inset: 0; margin: auto; }` — the `margin: auto` is what does the
centering once the element is in the top layer with `inset: 0`. Tailwind's preflight (loaded via
`@import "tailwindcss"` before the app's own `.dialog` rule) resets `margin` to `0` globally,
which cancels that auto-centering. Nothing in the app's own `.dialog` rule restores it, so the
dialog collapses to its top-left `inset` position instead of floating centered — exactly what the
screenshot shows.

## Proposed Remediation

**Preferred**: Add `margin: auto;` to the `.dialog` rule in `src/app/globals.css` (alongside the
existing background/border/shadow/width declarations) to restore centering without touching
Tailwind's preflight or introducing new layout code.

**Files likely to change**:
- `src/app/globals.css`

**Tests to add or update**:
- None — this is a pure CSS layout fix with no unit-testable behavior; verify visually (dialog
  centers in the viewport) after the change.

## Risks & Considerations

- Low risk: single CSS property addition, scoped to the existing `.dialog` class already used
  only by this one dialog.
- No effect on the dialog's semantics, focus trapping, or backdrop dimming (already correct per
  the screenshot — only the box position is wrong).

## Open Questions

None.
