# Problem Definition: Always-visible remove-confirmation UI clutters the Members Moderation Dashboard

- **Slug**: remove-resident-modal
- **Created**: 2026-09-17
- **Inputs used**: intake.md, research.md

## Problem Statement

The Members Moderation Dashboard shows a typed-name confirmation input and a "Remove" link on every member row at all times, even though that control is only relevant in the rare moment someone actually intends to remove a join-code intruder — making the roster look busier and harder to scan than the information it's meant to convey (each member's role and status) warrants. The idea as stated ("open a popup instead") is a proposed solution; the underlying problem is that a low-frequency, high-consequence action is rendered with the same permanence and visual weight as the page's everyday content.

## Affected Users & Stakeholders

- **Users**: administration and moderator accounts viewing `/members` — the only two roles with access to this screen (`FR-1.27`, `U-30` full parity). They see the always-visible confirmation input on every row regardless of whether they intend to act on any of them.
- **Stakeholders**: the product owner (the idea's originator), who judged the current rendering visually cluttered against the project's own design reference (the prototype), which already presents this interaction as a popup — [source: research.md's Prior Art].
- No end-resident-facing impact: plain residents cannot reach this screen at all (`FR-1.27`), so this problem is scoped entirely to the administration/moderator persona.

## Goals

- Reduce the roster's default visual density: an action that applies to a small minority of removal events should not occupy permanent space on every row.
- Preserve the existing safety guarantee exactly: submit stays disabled until the exact display name is typed (`U-27`), and the cautionary "use Remove only for a join-code intruder, not a real move-out" framing stays attached to the action, not lost or diluted.
- Bring the real app's presentation of this interaction back in line with the project's own design reference (the prototype's `Dialog`-based pattern), which research found the real implementation had quietly departed from.

## Non-Goals

- Changing the two-tier removal decision itself (`U-27`: soft `moved_out` vs. hard `Remove`), its permission model, or its audit-event behavior — this is presentation only.
- Deciding whether "Moved out" should also move into a popup — carried forward as an open question, not assumed either way.
- Introducing a general-purpose modal/dialog component for use elsewhere in the app — scope is this one interaction unless a later stage finds shared need.
- Rewriting the cautionary note's wording or the two-tier explanation itself.
- Any change to `docs/backlog/requirements/F1-requirements.md`'s `FR-1.26`/`FR-1.27` or `docs/08-UX-Entscheidungen.md`'s `U-27` — none of them specify a visual container, so none need to change for this idea to be implemented (research.md).

## Success Metrics

- **Qualitative, stakeholder-judged**: the product owner (or a small internal review) judges the members page less visually cluttered than the current always-visible-input rendering — the only success signal available pre-launch, since there is no real user base or usage data yet (baseline: current implementation, judged cluttered by one reviewer, N=1).
- **Structural proxy**: number of always-visible interactive controls per member row drops — today each row permanently shows a text input plus a "Remove" link; success means the "Remove" action still functions but doesn't itself occupy in-row space as a permanent input field (baseline: 1 always-visible confirmation input per row, for every row, regardless of intent).
- No quantitative/behavioral metric is available or being proposed — this is explicitly a visual-quality goal, not a conversion, error-rate, or task-time improvement, and should not be reported as one.

## Cost of Inaction

Nothing breaks: the current inline implementation is functionally correct, already tested (`tests/integration/policy/resident-list-access.test.ts`, `resident-list-audit.test.ts`), and already passed manual UI review for its safety behavior. The only ongoing cost is a persistent, low-severity visual-quality gap between the shipped screen and the project's own design reference, and marginally higher per-row visual noise on a screen used only by administration/moderator accounts. There is no deadline, incident, or complaint forcing this — it is a polish item, not a defect.

## Open Questions

- [NEEDS CLARIFICATION: should "Moved out" (the other destructive-weight action on the same row) also move into a popup, or only "Remove"? — from intake.md/research.md, still unresolved.]
- [NEEDS CLARIFICATION: should the implementation match the prototype's exact `Dialog` structure (title + description + inline caution note + input + disabled submit), or is a deliberate simplification acceptable? — from research.md.]
- [NEEDS CLARIFICATION: native `<dialog>` element vs. hand-built overlay vs. a new dependency (e.g. matching the prototype's Radix UI choice, following the `lucide-react` precedent of matching the prototype's exact library) — explicitly deferred to `/speckit-assess-shape`, not decided here.]
- [NEEDS CLARIFICATION: does the shared caution callout currently at the bottom of the member list get removed once its text lives inside the popup, stay as a shorter standing notice, or remain unchanged? — from intake.md.]
