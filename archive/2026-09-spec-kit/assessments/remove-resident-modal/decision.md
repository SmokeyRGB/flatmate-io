# Decision: Remove-resident confirmation as a modal popup

- **Slug**: remove-resident-modal
- **Decided**: 2026-09-17
- **Verdict**: go
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | adequate | Real, well-scoped problem (an always-visible, high-consequence confirmation control on every row) — but modest in stakes, not a functional defect (problem.md). |
| Evidence strength | adequate | User-demand evidence is thin (N=1 stakeholder opinion, no usage data — pre-launch product, none could exist yet), but the evidence that actually bears on "should we build this and how" is solid and cited: the prototype (this project's own design reference) already implements exactly this interaction as a popup, and it's compatible with the confirmed `U-27` decision without reopening it (research.md). For a small internal-admin polish item where the stakeholder raising it *is* the decision-maker, that's the right evidence to weigh — not a substitute for missing market validation this class of change was never going to have. |
| Value vs. inaction | weak | problem.md's own Cost of Inaction is explicit: nothing is broken, nothing is at risk, this is a polish item with no deadline or complaint forcing it. Named plainly, not glossed: the value case here is genuinely modest. |
| Feasibility / appetite | strong | concept.md's Option B (native `<dialog>`, no new dependency) is small-appetite and directly mirrors an existing, working prototype implementation — low execution risk. |
| Strategic fit | strong | Aligns with the project's own design reference and precedence rules (`docs/09-Design-System.md` may not contradict `07`/`08`, and doesn't need to here — `U-27` specifies the interaction, not its container); introduces the project's first dialog pattern, which is a reasonable, bounded addition, not a detour. |
| Risk posture | adequate | Risks are named and bounded in concept.md (browser `<dialog>` support, note-placement choice, scope creep toward "Moved out" or a reusable component) — Option B is explicitly scoped to exclude the riskier extensions. |

## Verdict & Rationale

**Go**, on Option B (native `<dialog>` popup) from concept.md. This clears the bar deliberately: problem validity and evidence strength both land at `adequate`, a concrete small-appetite concept option exists, and feasibility/strategic fit are both `strong`. The one honestly weak score — value vs. cost of inaction — does not sink the verdict here, because it pairs with an equally low cost: this is a cheap, low-risk, small-appetite polish item, not a strategic bet being justified by thin evidence. A `weak` value score would block a `go` for something expensive or risky; it does not for something this small, feasible, and evidence-consistent with the project's own design direction. The alternative previously named in concept.md — Option D, do nothing — remains a legitimate, low-regret choice if priorities shift before specification; going ahead now is a judgment call about a few days of low-risk work, not a claim that this is urgent.

## If go — Handoff to `/speckit-specify`

- **Problem**: The Members Moderation Dashboard renders a typed-name removal-confirmation control on every member row at all times, even though it applies to a rare, high-consequence action — creating avoidable visual clutter and drifting from the project's own design reference, which already presents this as a popup.
- **Chosen approach**: Option B from concept.md — a native HTML `<dialog>` popup (no new dependency) triggered by a "Remove" button per row, containing the title, the cautionary note, the existing typed-display-name confirmation input (submit disabled until exact match — `U-27`, unchanged), and Cancel/Remove actions. Add the pattern to `docs/09-Design-System.md` scoped to this one use case.
- **In scope**: the "Remove" action's presentation on `/members` for administration and moderator sessions; a new dialog visual pattern in `docs/09-Design-System.md`; deciding where the cautionary note lives (in the dialog, in the list, or both).
- **Out of scope** (from concept.md, inherited from problem.md's non-goals): any change to `U-27`'s two-tier removal model, the permission model, or audit-event behavior; whether "Moved out" also becomes a dialog (a named open question — resolve during specification, not assumed); a general-purpose reusable dialog component for other future destructive actions; rewriting the cautionary note's wording.
- **Success metrics**: qualitative only — the product owner (or a small internal review) judges the resulting screen less visually cluttered than today's always-visible-input rendering; structurally, the "Remove" action should no longer occupy an always-visible input field per row (problem.md). No quantitative/behavioral metric applies; none should be invented during specification.
- **Carried-forward open questions**:
  - Should "Moved out" also move into a dialog, or only "Remove"?
  - Does the cautionary note move entirely into the dialog, stay as a shorter standing list-wide notice, or remain in both places?
  - Confirm native `<dialog>` browser/device support is adequate for this project's targets (P-2 Geräteneutralität) before or during implementation.
