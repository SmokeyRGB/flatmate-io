# Bug Verification: Remove-resident dialog not centered

- **Slug**: remove-resident-modal-not-centered
- **Tested**: 2026-09-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Reproduced the exact reported symptom in isolation using the project's real, compiled
`globals.css` (via `@tailwindcss/postcss`) and confirmed the fix resolves it: the `<dialog>`
pins top-left pre-fix and centers correctly post-fix, with no lint regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (pre-fix) | Compiled HEAD's `globals.css` (minus the `margin: auto` fix) through the project's actual `@tailwindcss/postcss` pipeline, rendered a fixture `<dialog class="dialog">` with `showModal()` in headless Chromium (Playwright), screenshotted | pass — bug reproduced | Dialog pinned top-left, matching the user's screenshot exactly |
| Reproduction (post-fix) | Same fixture, compiled current (fixed) `globals.css` | pass — bug resolved | Dialog centers in the viewport over the dimmed backdrop |
| Regression suite | Not run | skipped | No dev server / DB / auth session available in this environment to exercise `/members` end-to-end; the CSS mechanism itself was verified directly instead (see above) |
| Lint | `npm run lint` | pass | No errors on the changed files |

## Output Excerpts

- Pre-fix compiled `.dialog` rule: no `margin` property present (relies on UA default, cancelled by Tailwind preflight's global `margin: 0`).
- Post-fix compiled `.dialog` rule:
  ```css
  .dialog {
    margin: auto;
    background: var(--color-card);
    ...
  }
  ```
- `npm run lint` → exits clean, no output beyond the script banner.

## Residual Risks

- Did not verify inside the actual running app (no dev server / seeded auth session available in
  this session) — verified the CSS mechanism directly against the project's real compiled
  stylesheet instead, which is what actually determines the dialog's position; this is a static
  layout property with no app-state dependency, so the isolated repro is representative.

## Recommendation

Close the bug — the root cause (Tailwind preflight's `margin: 0` reset cancelling the browser's
native `dialog:modal { margin: auto }` centering) is verified via a before/after screenshot diff
against the project's actual compiled CSS, and lint is clean. Recommend a quick manual glance at
`/members` in a real browser session next time it's open, as a final sanity check, but no further
code changes are needed.
