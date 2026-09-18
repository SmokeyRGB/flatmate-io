# Concept: Remove-resident confirmation as a modal popup

- **Slug**: remove-resident-modal
- **Created**: 2026-09-17
- **Recommended option**: B — Native `<dialog>` popup

## Options

### Option A — Reveal-in-place (no popup at all)

- **Sketch**: The "Remove" link becomes a button. Clicking it swaps the link for the existing inline confirmation UI (caution text, labeled input, disabled-until-match submit, a "Cancel" link to collapse it again) in the same spot in the row — no overlay, no separate surface. Everything else (the shared caution callout at the list's bottom) is unchanged.
- **Appetite**: small (well under a day — it's a conditional-render toggle around markup that already exists).
- **Trade-offs**: Solves the stated *problem* (an always-visible confirmation control cluttering every row) at essentially zero cost and zero new UI surface, but does not satisfy the idea *as literally stated* — the user asked for "a button to click which opens a popup," and this produces no popup. Still a per-row layout shift when expanded, which could itself look like clutter with several rows expanded at once (unlikely in practice — only one row is normally being acted on).
- **Rabbit holes**: none of consequence — this is a small, contained change to an existing client component.

### Option B — Native `<dialog>` popup

- **Sketch**: "Remove" becomes a button that opens a real popup (the browser's native `<dialog>` element, shown modally) containing the title, the cautionary note (moved from the list-wide callout into the dialog itself, or kept in both places — an open question), the typed-name input, and Cancel/Remove actions — closely mirroring the prototype's own `Dialog`-based implementation of this exact interaction (research.md's Prior Art).
- **Appetite**: small (a few days) — no new dependency; native `<dialog>` provides focus trapping, ESC-to-close, and a backdrop for free, but still requires new CSS (`docs/09-Design-System.md` has no dialog pattern yet) and manual wiring of open/close state around the existing `RemoveMemberForm` client component.
- **Trade-offs**: Satisfies the idea as stated, restores fidelity to the project's own design reference without adding a dependency, and gives the project a real (if minimal) dialog pattern it currently lacks entirely. Costs more than Option A for a problem whose own cost-of-inaction was assessed as low (problem.md), and is the first dialog pattern in `docs/09-Design-System.md` — a small precedent-setting design-system addition, not just a code change.
- **Rabbit holes**: (1) defining *the* canonical dialog pattern rather than a one-off — scope creep if it tries to anticipate every future destructive-action use case instead of just this one; (2) the open question of whether "Moved out" also moves into a dialog — answering "yes" roughly doubles the surface; (3) cross-browser `<dialog>` quirks (older Safari/older browser versions) are a real but bounded risk, worth a quick compatibility check before committing effort.

### Option C — Dependency-based dialog (match prototype's exact library)

- **Sketch**: Install a Radix UI-based dialog primitive (matching the prototype's shadcn/ui `Dialog`/`AlertDialog`, the same way `lucide-react` was added earlier in this project specifically to match the prototype's pinned choice) and build a reusable `Confirm`-style wrapper component for destructive confirmations app-wide, not just this one screen.
- **Appetite**: medium (weeks) — a new dependency needs the same vetting this project applies to others (license check, `tools/README.md`'s allowlist), plus building and documenting a genuinely reusable component and its design-system entry, not just one screen's popup.
- **Trade-offs**: Highest long-term payoff if more destructive-confirmation surfaces are coming (this is the only one that exists today) — reusable, most faithful to the prototype, least future rework. But it reopens `plan.md`'s explicit, already-recorded YAGNI decision against a component library for this slice ("a handful of forms and a table don't justify one") on the strength of a single, low-confidence, N=1 request — a materially bigger bet than the problem as currently evidenced supports.
- **Rabbit holes**: dependency vetting/licensing process; scope creep from "one popup" into "the app's confirmation-dialog system"; risk of a medium-appetite investment landing on a problem problem.md itself scored as low-cost-of-inaction.

### Option D — Do nothing

- **Sketch**: Leave the current inline confirmation UI as-is.
- **Appetite**: none.
- **Trade-offs**: Zero cost, zero risk, matches problem.md's own finding that nothing is functionally broken today. Leaves the stated visual-clutter observation and the design-reference drift (research.md) unaddressed.
- **Rabbit holes**: none.

## Recommendation

**Option B.** The idea as stated specifically asked for a popup, not merely a decluttered row (ruling out A on its own), and the evidence doesn't support Option C's bigger bet: the request is a single, low-confidence, pre-launch observation (problem.md's own success metric is "one stakeholder judges it less cluttered," N=1), and this project has already drawn the YAGNI line against a component library once, for the same class of reason ("a handful of forms and a table don't justify one," `plan.md`). Option B satisfies the literal ask, restores the project's own design-reference fidelity, and costs a few days with no new dependency — proportionate to a problem whose own cost-of-inaction is low. Option D is the honest fallback if even a few days isn't worth spending on a polish item with no measured user impact; it is not a weak alternative, just a smaller bet.

## Out of Scope (for the recommended option)

- Whether "Moved out" also becomes a dialog (open question — resolve before or during `/speckit-specify`, not assumed here).
- Any change to `U-27`'s two-tier removal decision, the permission model, or audit-event behavior (problem.md's non-goals).
- A general-purpose, reusable dialog component for other future destructive actions (Option C's scope) — Option B is scoped to this one screen's one action.
- Rewriting the cautionary note's wording.

## Assumptions to Validate

- That the browser/device support this project targets (per P-2 Geräteneutralität) is adequately covered by native `<dialog>` — worth a quick compatibility check during specification rather than assumed here.
- That moving (or duplicating) the cautionary note from the list-wide callout into the per-action dialog doesn't weaken its visibility — the open question from problem.md/research.md about where that text should live.
- That a single stakeholder's visual-cleanliness judgment is an adequate signal to act on at this project stage — reasonable pre-launch, but worth naming explicitly since it's the entire evidentiary basis (research.md, problem.md).
