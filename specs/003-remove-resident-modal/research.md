# Phase 0 Research: Remove-Resident Confirmation Dialog

**Input**: `spec.md`'s Assumptions (native mechanism left open, no new dependency favored) and the
`/speckit-assess-*` pipeline (`.specify/assessments/remove-resident-modal/`), whose `research.md`
and `concept.md` already resolved most of what would otherwise be `NEEDS CLARIFICATION` here.

## Decision 1: Rendering mechanism — native `<dialog>`, no new dependency

**Decision**: Use the browser's native `<dialog>` element, opened imperatively via
`dialogRef.current.showModal()`, not a library.

**Rationale**: `concept.md`'s Option B (the assessment's recommended option) chose this
specifically to avoid reopening `plan.md`'s (002-f1-casting-round) already-recorded YAGNI decision
against a component library ("a handful of forms and a table don't justify one"). `<dialog
open>` alone (a plain attribute toggle) does **not** get modal behavior (focus trap, top-layer
rendering, native backdrop) — only `.showModal()` does; this is the one technical subtlety the
assessment stage correctly deferred to planning rather than specifying.

**Alternatives considered**:
- Radix UI / shadcn `Dialog` (matching the prototype's exact library, `prototype/src/components/
  ui/dialog.tsx`) — rejected per `concept.md`'s Option C: a new dependency, license/vetting
  overhead, and reusability payoff this single-screen change doesn't need yet.
- A hand-built `<div>` overlay with manual focus-trap/ESC/ARIA wiring — rejected: strictly more
  code and more accessibility risk than the native element for the same outcome (`concept.md`
  Option B's own trade-off note).

## Decision 2: Dismissal — Cancel button + native ESC, not a backdrop-click handler

**Decision**: Wire an explicit "Cancel" `<button type="button">` calling `dialogRef.current
.close()`. Native `<dialog>` already fires its own `cancel`/`close` events on Escape, which need
no extra code. A backdrop-click-to-dismiss handler is **not** added in this pass.

**Rationale**: FR-005 requires "an explicit cancel control and... the standard dismiss gesture"
— ESC is the standard gesture for `<dialog>` and is free. Backdrop-click is a separate,
non-native behavior requiring a manual `e.target === dialogRef.current` check; spec.md's FR-005
does not require it, and adding it is exactly the kind of scope-widening `concept.md`'s Rabbit
Holes flagged as a risk (Option B, risk 1) — deferred, not forgotten.

**Alternatives considered**: Backdrop click — deferred as above, not rejected outright; may be
added later as a small, separate enhancement if it turns out to be expected.

## Decision 3: Field reset — explicit reset on close, not on unmount

**Decision**: The dialog element is not unmounted when closed (native `<dialog>` hides via its
own display semantics, not React unmount) — reset the typed-name field explicitly in the same
handler that closes the dialog (Cancel button and the native `close` event listener), not relied
on to reset "for free."

**Rationale**: FR-006 requires the field to start empty on every reopen. Because the component
stays mounted across a close/reopen cycle, React state would otherwise persist the previous
attempt's typed text — a real behavior difference from a naive "just add a dialog wrapper"
implementation, worth calling out explicitly so it isn't missed during implementation.

**Alternatives considered**: Reset only `onOpen` instead of `onClose` — equivalent in outcome,
implemented at `onClose` here so the field is also guaranteed clean if the component is
inspected while the dialog is closed (e.g. dev tools), not just at the next open.

## Decision 4 (corrected during implementation): Success path — explicit close-on-success IS needed

**Original decision (wrong, superseded)**: Assumed `removeMember` deletes the member, so the row
— dialog included — would unmount on its own once `revalidatePath("/members")` re-renders the
list, making an explicit close call unnecessary.

**What implementation found**: `removeMember` performs a **soft** `status: "moved_out"`
transition and revokes `Membership` access (`U-27`'s hard tier, `T076` from
`002-f1-casting-round`) — it does not delete the `ResidentProfile` row. `getResidentList` still
returns the member, now with `status: "moved_out"`, and `page.tsx` renders that as a "moved out"
badge plus a "Reactivate" action instead of unmounting the row. The dialog therefore does **not**
close on its own — the original Decision 4 was based on an unverified assumption about existing
behavior, not on reading `removeMember`'s actual implementation.

**Corrected decision**: Add a `useEffect` in `remove-member-form.tsx` that closes the dialog
(`dialogRef.current.close()`) when `state.error === null` and the dialog is currently open —
guarding on "currently open" so the effect is a no-op on mount and never fires for an unrelated
render. A failed submission (`state.error` set) leaves the dialog open so the inline error stays
visible (FR-008).

**Verification**: confirmed via a Playwright walkthrough against the live dev server and seeded
demo data (`npm run seed:demo`) — before the fix, the dialog stayed open indefinitely after a
successful removal; after adding the effect, it closes automatically once the action resolves,
observed alongside the row correctly updating to its "moved out" state.

**Lesson**: this is exactly the kind of assumption `research.md` exists to make explicit and
falsifiable — it was wrong, and manual verification (per Decision 5) caught it before this
feature shipped, rather than after.

## Decision 5: Verification approach for DOM-level requirements — manual, not a new test harness

**Decision**: FR-001, FR-002, FR-005, FR-006, and FR-007's DOM-level behaviors (dialog open/
close/reset/pending-disable) are verified manually against the dev server (`npm run dev`, `npm
run seed:demo` for known test data), not via a new automated browser/DOM test dependency.
FR-004's actual removal behavior (permission check, access revocation, audit entry) is already
covered by existing tests (`tests/integration/policy/resident-list-access.test.ts`,
`resident-list-audit.test.ts`) and is unchanged by this feature, per FR-004's own wording.

**Rationale**: `vitest.config.ts` runs with `environment: "node"` — there is no jsdom/DOM test
environment or component-testing library (e.g. React Testing Library) installed anywhere in this
project today, and this project's established practice for verifying rendered UI behavior is
manual/ad-hoc Playwright walkthroughs against the live dev server (used throughout
`002-f1-casting-round`'s own design-system passes), never a committed dependency. Introducing a
DOM-testing harness for one dialog's open/close semantics would be a materially bigger, separate
tooling decision than this feature's own small appetite (`concept.md`) justifies.

**Alternatives considered**: Add `jsdom` + React Testing Library — rejected for this feature;
worth reconsidering later only if DOM-level UI logic becomes common enough across features to
justify the investment (a decision for a future assessment, not this one).

## Decision 6: Design-system documentation — add a scoped dialog pattern, not a general one

**Decision**: Add a minimal `.dialog`/`.dialog::backdrop` component-class pair to
`src/app/globals.css` (matching the existing `@layer components` pattern already used for
`.callout`, `.card-featured`, etc.) and document it in `docs/09-Design-System.md`, scoped to
describe this one confirmation-dialog use case — not a general-purpose "all future dialogs" spec.

**Rationale**: `docs/09-Design-System.md` sits at precedence rank 6 (`docs/README.md` §2): it
binds visual implementation only, never scope, and is additive here (a new pattern, not a
correction of anything `07`/`08` already decided) — consistent with Constitution Principle II
and IV, no human-decision gate required for an additive, non-conflicting visual-pattern entry.
Scoping it narrowly avoids `concept.md`'s Option B risk 1 (over-designing a "canonical" pattern
before a second real use case exists).

**Alternatives considered**: Defining a fully general dialog system now — rejected, same
reasoning as Decision 1's rejection of Option C's broader reusable-component scope.
