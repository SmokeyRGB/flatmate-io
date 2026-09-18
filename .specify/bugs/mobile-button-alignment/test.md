# Bug Verification: Icon/text buttons misaligned on mobile (Members page) — corrected fix

- **Slug**: mobile-button-alignment
- **Tested**: 2026-09-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: superseded

> **2026-09-17 update**: the user chose not to verify the two-row wrap fix and instead requested a
> visual redesign of these same actions (icon-only "Remove" in the card corner, solid destructive
> "Moved out" pill). That redesign is applied directly on top of this fix (both changes are in
> `src/app/(org)/members/page.tsx` / `remove-member-form.tsx`) and, as a side effect, structurally
> resolves the original wrap-inconsistency: "Remove" is no longer in the flex-wrap action row at
> all (moved to the card header), and "Moved out" is now a `.btn.btn-destructive` pill — the same
> box height as "Make moderator"/"Make member" — so the two-row split this fix introduced is no
> longer even necessary (reverted to one row). See the follow-up work in this same session for the
> actual current state; this bug is closed as superseded, not independently re-verified.

## Summary

Regression checks (lint, typecheck, full test suite) all pass clean after the two-row restructure.
The last cycle's mistake was declaring confidence in a visual fix without anyone actually looking at
the rendered page — that turned out wrong. To avoid repeating it, this pass does not claim
**verified** until the user (or a rendered check) confirms the actual mobile layout, since this is a
purely visual bug and no automated check in this repo renders CSS/layout.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Visual re-check of `/members` at phone width | not-run | No browser/screenshot tooling available in this session (confirmed last cycle — still true); asking the user to confirm directly rather than assuming |
| New / updated tests | none added (per fix.md — pure markup regrouping) | n/a | Assessment agreed no test was warranted |
| Regression suite | `npm test` (vitest) | pass | 49 test files, 92 tests, all passed |
| Lint / type-check | `npm run lint`; `npx tsc --noEmit` | pass | Both clean, no output/errors |

## Output Excerpts

```
Test Files  49 passed (49)
     Tests  92 passed (92)
```

`npm run lint` and `npx tsc --noEmit` produced no output (clean).

## Residual Risks

- This is the second attempt at what was reported as a purely visual complaint. The first attempt
  looked correct by CSS reasoning and passed every automated check, yet did not resolve what the
  user actually saw — so "all checks green" is demonstrably not sufficient evidence on its own for
  this particular bug.
- The new root-cause theory (mismatched wrap points between a tall pill button and short text links
  sharing one flex row, now split into two rows per `docs/09-Design-System.md:84`) is structurally
  sound and directly explains the specific inconsistency in the original screenshots (Sam's row
  wrapping differently from Alex's), which is stronger grounding than the first attempt had — but it
  is still unconfirmed against a real render.

## Recommendation

Hold at "partial" — do not close this out until the user (or a capable render/screenshot check)
confirms `/members` at phone width now shows consistent action-row wrapping for both a
"Make moderator" resident and a "Make member" resident. If confirmed, re-run
`/speckit-bug-test slug=mobile-button-alignment` (or simply tell me) to flip this to verified. If
still wrong, reopen and re-run `/speckit-bug-assess` with what's actually seen this time.
