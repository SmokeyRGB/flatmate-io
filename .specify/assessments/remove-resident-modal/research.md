# Idea Research: Remove-resident confirmation as a modal popup

- **Slug**: remove-resident-modal
- **Created**: 2026-09-17
- **Evidence confidence (overall)**: low — one strong internal precedent (prior art), but no real user/usage evidence exists yet (pre-launch product).

## Users & Demand

- The idea originates from a single stated aesthetic observation ("that would be visually cleaner") made while reviewing the shipped screen, not from a support ticket, interview, or measured usage — [source: intake.md] (confidence: low, ASSUMPTION that this reflects a broader user need rather than one reviewer's preference).
- No real households exist yet: `docs/02-SRD.md`/`spec.md`'s Assumptions state F1 runs on synthetic data only, so there is no usage volume or complaint history for this exact screen to draw on — [source: `specs/002-f1-casting-round/spec.md` §Assumptions] (confidence: high, cited).

## Prior Art

- **Strong internal precedent — the prototype already designed this as a modal.** `prototype/src/routes/_authenticated/organisation/mitglieder.tsx` (lines 200–239) implements the exact interaction described in the idea: a `Dialog` titled "`<name>` endgültig entfernen?" containing (1) the same cautionary note now shown inline on the real app's members page ("Nutze das, wenn jemand über den Einladungslink hereingekommen ist...", functionally identical to F1's English "Use 'Remove' only for someone who joined via the join code...") and (2) a typed-display-name input with the submit button disabled until the name matches — [source: `prototype/src/routes/_authenticated/organisation/mitglieder.tsx:200-239`] (confidence: high, cited).
- The prototype also ships a small reusable `Confirm` wrapper (`prototype/src/components/fm/Confirm.tsx`) built on shadcn/ui's `AlertDialog`/Radix UI `Dialog` primitives, used generically across the prototype for destructive confirmations — [source: `prototype/src/components/fm/Confirm.tsx`] (confidence: high, cited).
- **The real app's F1 implementation is a deviation from this prototype design, not a from-scratch decision.** The real `src/app/(org)/members/page.tsx` implements the same typed-name-confirmation *logic* (`RemoveMemberForm`, gated on an exact-match check) but renders it inline per member row, with the cautionary note hoisted once to the bottom of the whole list instead of living inside a per-action confirmation surface — [source: `src/app/(org)/members/page.tsx`, `src/app/(org)/members/remove-member-form.tsx`, this session's own implementation work] (confidence: high, cited).
- `docs/08-UX-Entscheidungen.md`'s **U-27** (confirmed 2026-09-16) mandates the two-tier removal model and the typed-exact-display-name confirmation requirement, but says nothing about the visual container (inline vs. modal) — the interaction requirement and its presentation are separable, so this idea does not require reopening or contesting U-27 — [source: `docs/08-UX-Entscheidungen.md:68`] (confidence: high, cited).

## Market & Context

- Confirmation dialogs (rather than always-visible inline confirmation UI) are the conventional pattern for destructive actions in mainstream admin/moderation UIs generally — a widely-established convention, not specific evidence about this product's users — [source: general industry convention] (confidence: low, ASSUMPTION — no citation gathered for this specific claim, offered only as background).
- Not a market-facing or competitive concern: this is an internal household-administration screen, not a customer-facing surface where competitor UX patterns would carry weight.

## Data & Constraints

- **No modal/dialog component exists yet in the real app.** `plan.md`'s Technical Context explicitly records a YAGNI decision against installing any component library for F1 ("a handful of forms and a table don't justify one") — [source: `specs/002-f1-casting-round/plan.md` §Technical Context] (confidence: high, cited). Building this idea means either introducing a dialog primitive (reopening that YAGNI call) or implementing it without a new dependency.
- The native HTML `<dialog>` element (broadly supported in current browsers) provides built-in focus trapping, ESC-to-close, and backdrop behavior without a new dependency — noted here as an existing platform capability relevant to the cost estimate, not a design decision — [source: general web-platform fact] (confidence: medium, ASSUMPTION not verified against this project's specific browser-support requirements).
- `docs/09-Design-System.md` (the real app's only current design-system reference, precedence rank 6 per `docs/README.md` §2) defines no modal/dialog pattern today — this session's two design-system passes covered callouts, badges, featured cards, tab switchers, and back-links, but never a dialog — [source: this session's own review of `docs/09-Design-System.md` and `src/app/globals.css`] (confidence: high, cited).
- Existing automated test coverage for removal (`tests/integration/policy/resident-list-access.test.ts`, `resident-list-audit.test.ts`) asserts repository-layer behavior (permission checks, audit events, the exact-match rule) rather than DOM structure, so moving the confirmation into a modal would not itself break existing tests — [source: `tests/integration/policy/resident-list-access.test.ts`, `resident-list-audit.test.ts`] (confidence: high, cited).

## Evidence Against the Idea

- The only stated justification so far is one person's visual-cleanliness judgment, made once, with no corroborating user complaint, support ticket, or usage data — because the product is pre-launch, none could exist yet, but that also means the "problem" is unvalidated rather than merely under-documented.
- A modal adds an interaction step (click "Remove" → dialog opens → then type the name) compared to today's single-surface flow (the field is already visible; typing starts immediately) — arguably more friction for the exact same safety guarantee, even though it looks tidier at rest.
- Implementing this either reopens the project's own explicit no-component-library YAGNI decision (if using a dialog library) or requires hand-rolling accessible modal behavior (focus trap, ESC handling, backdrop click, ARIA `dialog` role) that the current inline approach gets for free from being plain page content — real, non-zero implementation and testing cost for a change with no measured functional benefit.
- The shared caution callout currently at the bottom of the list is visible to everyone reading the page, once, regardless of which row they're acting on; moving its text into a per-row popup means it is only read at the moment of an already-committed "Remove" click, which is arguably a worse place to first encounter the warning "use this only for X, not Y" — a possible usability regression alongside the visual improvement.

## Gaps & Open Questions

- [NEEDS CLARIFICATION: should "Moved out" (the other destructive-weight action on the same row) also move into a popup, or only "Remove"? — carried over from intake.md, still unresolved.]
- [NEEDS CLARIFICATION: is matching the prototype's exact `Dialog` structure (title + description + inline caution note + input + disabled submit) the goal, or is there a preferred simplification?]
- [NEEDS CLARIFICATION: native `<dialog>` element vs. a hand-built overlay vs. introducing a dependency (e.g. Radix UI, matching the prototype and the `lucide-react` precedent of matching the prototype's exact library choices) — no decision made here, flagged for `/speckit-assess-shape`.]

## Sources

- `prototype/src/routes/_authenticated/organisation/mitglieder.tsx` (internal repository file, not a URL fetch — read directly per the idea's own "codebase pointer" nature)
- `prototype/src/components/fm/Confirm.tsx` (internal repository file)
- `docs/08-UX-Entscheidungen.md` (internal repository file)
- `specs/002-f1-casting-round/plan.md`, `specs/002-f1-casting-round/spec.md` (internal repository files)
- `src/app/(org)/members/page.tsx`, `src/app/(org)/members/remove-member-form.tsx` (internal repository files)
- `tests/integration/policy/resident-list-access.test.ts`, `resident-list-audit.test.ts` (internal repository files)

No external URLs were fetched — the input contained none, and all prior art was located inside this repository.
