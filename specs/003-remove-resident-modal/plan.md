# Implementation Plan: Remove-Resident Confirmation Dialog

**Branch**: `003-remove-resident-modal` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-remove-resident-modal/spec.md`, itself the
handoff from `/speckit-assess-decide`'s `go` verdict
(`.specify/assessments/remove-resident-modal/decision.md`).

## Summary

Replace the Members Moderation Dashboard's always-visible, per-row "type the name to confirm"
removal control with a native `<dialog>` popup opened by a "Remove" button — presentation only,
no change to the underlying permission check, access-revocation logic, or audit behavior
(`removeMember`, `removeMemberAction`, unchanged). No new dependency: `concept.md`'s recommended
Option B, chosen specifically to avoid reopening `002-f1-casting-round`'s existing no-component-
library decision on the strength of a single, low-confidence, pre-launch UI-polish request.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.5 (`ADR-006`) — unchanged, already installed.

**Primary Dependencies**: None new. `lucide-react` (already installed) for the dialog's icon,
matching the existing `TriangleAlert` icon already used for this exact cautionary text.

**Storage**: N/A — no schema change. `spec.md`'s Assumptions are explicit: this feature does not
touch `U-27`'s two-tier removal model, the `manage_members` permission model, or the audit-event
schema.

**Testing**: Vitest (existing, unchanged config). FR-004's actual removal behavior is already
covered by `tests/integration/policy/resident-list-access.test.ts` and
`resident-list-audit.test.ts` and is not modified by this feature. The dialog's own DOM-level
behaviors (open/close/reset/pending-disable) are verified manually against the dev server, per
`research.md` Decision 5 — this project has no jsdom/component-testing harness installed, and
adding one is a bigger, separate decision than this feature's small appetite justifies.

**Target Platform**: Vercel serverless, unchanged from `002-f1-casting-round` — this feature adds
no server-side surface beyond what `removeMemberAction` already exposes.

**Project Type**: Single Next.js app (unchanged) — a presentation-layer change to one existing
route, `src/app/(org)/members/`.

**Performance Goals**: None specified — `spec.md`'s Assumptions explicitly rule out new
performance/concurrency targets for this low-traffic, administration/moderator-only screen.

**Constraints**:
- No new dependency (`concept.md`'s recommended option, reaffirmed in `research.md` Decision 1).
- P-2 (Geräteneutralität): native `<dialog>` has broad support across this project's target
  evergreen browsers; no device-exclusion risk identified, per `research.md`.
- The cautionary explanation currently shown once at the bottom of `/members` moves into the
  dialog itself (`spec.md` Assumptions, matching the prototype's original design per the
  assessment's `research.md`) — the standalone callout is removed, not duplicated.

**Scale/Scope**: Single screen (`/members`), one existing client component
(`remove-member-form.tsx`) extended in place — no new route, no new page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` (v1.1.0):

- **Principle I (hard floor: G-C, G-D, G-L)** — PASS. FR-004 requires the exact same permission
  check, access revocation, and audit behavior as today; this feature does not touch
  authorization logic, `[GUARDED]` tests, or anything AI-related.
- **Principle II (precedence order)** — PASS. The one `docs/` edit this feature makes is additive
  to `09-Design-System.md` (rank 6): a new, narrowly-scoped dialog pattern, not a correction of
  anything `07`/`08` already decided, and it does not bind scope or requirements per rank 6's own
  definition.
- **Principle III (P-1…P-5)** — PASS. P-2 (Geräteneutralität) checked in Technical Context's
  Constraints; native `<dialog>` introduces no new device-exclusion risk.
- **Principle IV (docs/ authoritative until a human changes it)** — PASS. The `09-Design-System.md`
  addition is additive, not a redefinition of an existing decision, and does not require the
  challenge protocol (that gate is for confirmed-tier/precedence changes, not a new, non-
  conflicting visual pattern the document exists to hold).
- **Principle V (cite, don't restate)** — PASS. This plan and `research.md` cite `spec.md`'s
  FR-numbers directly rather than re-deriving requirements.
- **Principle VI (frozen files)** — PASS. No edit to `04-Domaenenmodell.md`, `05-ADRs.md`, or
  `07-Screen-Inventar.md`.
- **Principle VII (handover gate)** — PASS. The `09-Design-System.md` edit describes the pattern
  generically; it does not cite `specs/003-remove-resident-modal` from inside `docs/`.
- **Principle VIII (language)** — PASS. English throughout, per the `specs/` exception.
- **Principle IX (stack fixed, tooling open)** — PASS, reinforced: this plan explicitly avoids
  adding a dependency rather than merely not needing one.
- **Principle X (challenge protocol)** — No finding. No hard-floor or confirmed-tier conflict.

No violations requiring Complexity Tracking.

**Post-design re-check** (after `research.md`/`quickstart.md`): still PASS on all principles — no
new findings emerged during design; Decision 6 (research.md) is the `09-Design-System.md` change
already covered by Principle II/IV above.

## Project Structure

### Documentation (this feature)

```text
specs/003-remove-resident-modal/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `data-model.md` — this feature introduces no new entity, field, or schema change (`spec.md`'s
Assumptions; no Key Entities section in `spec.md`, matching the template's "include if feature
involves data" instruction). No `contracts/` — same reasoning as `002-f1-casting-round`: no REST/
GraphQL/CLI surface, only a Server Action already covered by `002-f1-casting-round`'s own
contract-equivalent (its repository/action signatures), unchanged here.

### Source Code (repository root)

```text
src/
├── app/
│   └── (org)/
│       └── members/
│           ├── page.tsx               # MODIFIED: "Remove" becomes a button that opens the
│           │                           # dialog; the standalone caution callout at the bottom
│           │                           # of the list is removed (its text moves into the dialog)
│           ├── remove-member-form.tsx # MODIFIED: wraps the existing form in a <dialog>,
│           │                           # adds open/close state, the cautionary text, Cancel
│           │                           # control, and the reset-on-close behavior
│           │                           # (research.md Decisions 2/3/4)
│           └── actions.ts             # UNCHANGED: removeMemberAction, same signature
├── modules/
│   └── identity/
│       └── repository.ts              # UNCHANGED: removeMember, same permission check and
│                                       # audit behavior (FR-004)
└── app/globals.css                    # MODIFIED: adds `.dialog`/`.dialog::backdrop` component
                                        # classes (research.md Decision 6)

docs/
└── 09-Design-System.md                # MODIFIED: documents the new dialog pattern, scoped to
                                        # this one use case (research.md Decision 6)
```

**Structure Decision**: No new files. This is a targeted extension of one existing client
component (`remove-member-form.tsx`) and its parent page, plus one new CSS pattern shared through
the project's existing `@layer components` convention — consistent with `002-f1-casting-round`'s
own "plain Tailwind component classes, no component library" approach, not a departure from it.

## Complexity Tracking

*No entries — the Constitution Check above found no violations requiring justification.*
