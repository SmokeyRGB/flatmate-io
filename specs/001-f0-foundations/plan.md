# Implementation Plan: F0 — The Substrate (Authorization + State Machine + Audit Log)

**Branch**: `001-f0-foundations` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-f0-foundations/spec.md`

## Summary

Build the three F0 substrate pieces in scope for this slice: authorization enforced twice
(central policy layer + Postgres RLS, `docs/adr/0004-*.md`), the eleven-state `Application`
machine (`docs/03-PRD.md` §4.2.1, `docs/adr/0002-*.md`), and the append-only `ActivityEvent`
audit log (`docs/adr/0003-*.md`). No UI, no F1–F5 business logic — this is what those features
stand on.

## Technical Context

**Language/Version**: TypeScript, Next.js (ADR-006). No exact minor version pinned by any ADR;
using current Next.js/TypeScript stable releases is a reasonable default, not a decision this
plan needs to make.

**Primary Dependencies**: Drizzle ORM (schema + RLS policies, verified against the installed
`drizzle-orm` docs below — not assumed from training data, per G-J1), `@supabase/supabase-js`
(Supabase Auth), `postgres` (the `postgres-js` driver Drizzle's Postgres dialect uses).

**Storage**: Postgres 17 via Supabase EU (`ADR-006`). Live project confirmed via Supabase MCP:
project `flatmate-io` (`cjinhzzvjryojvhngjjn`), region `eu-west-1`, Postgres engine 17,
status `ACTIVE_HEALTHY`, currently empty (0 tables) — this slice creates the first ones.

**Testing**: Vitest — the `tools/README.md`/`docs/MINIMAL-GATE.md` proposal. Per the
constitution (Principle IX), this is explicitly-open-tier, not confirmed: a reasoned
counter-proposal is possible later, provided RLS-must-be-tested-twice (G-C7) survives under
whatever runner is used.

**Target Platform**: Serverless/edge Node.js runtime (Next.js), connecting to Postgres through
Supabase's Supavisor pooler in **transaction mode** (port 6543) — see `research.md` for why this
specific choice, verified against Supabase's own docs rather than assumed, and why it makes
FR-0.3/FR-0.4's `SET LOCAL` discipline load-bearing rather than theoretical.

**Project Type**: Single Next.js app; internal modular monolith (ADR-001's six bounded contexts
as internal module boundaries, not separate services/repos).

**Performance Goals**: None specified — F0 is a correctness substrate (authorization, state
integrity, audit immutability), not a performance-sensitive path. Not applicable to this slice.

**Constraints**: RLS mandatory + policy-layer mandatory, both required and both tested per
invariant (G-C7); session context settable only via one transaction helper using `SET LOCAL`,
never bare `SET` (G-C8); no boolean flags standing in for `Application` state (ADR-002); audit
log entries immutable except via the retention-redaction path (ADR-003); six-bounded-context
import boundaries exist in principle (ADR-001) but this slice only populates two of them
(`casting` for `Application`, `audit` for `ActivityEvent`) plus a cross-cutting authorization
layer that isn't itself one of the six contexts — building out the other four contexts' folders
now would be scaffolding for features not yet started.

**Scale/Scope**: Household-scale application (not internet-scale); no concrete figure given in
any source document for this slice — not applicable.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md`:

- **Principle I (hard floor: G-C, G-D, G-L)** — PASS. This slice implements G-C/G-D mechanisms;
  it doesn't touch G-L (no AI/model calls in F0's scope) at all.
- **Principle II (precedence order)** — PASS. No conflict raised between `docs/` sources; where
  multiple documents describe the same rule (e.g., the transition table), the maßgeblich source
  per `docs/SPEC-INDEX.md` is the one this plan builds against.
- **Principle IV (docs/ authoritative)** — PASS. Nothing here redefines a `docs/` decision.
- **Principle V (cite, don't restate)** — PASS. Technical Context and the sections below link to
  ADRs/GUARDRAILS rather than re-deriving the rules; `research.md` and `data-model.md` follow the
  same discipline.
- **Principle VI (frozen files)** — PASS. No edit to `04-Domaenenmodell.md`, `05-ADRs.md`, or
  `07-Screen-Inventar.md` in this plan.
- **Principle VII (handover gate)** — PASS. This plan lives under `specs/`; it cites into `docs/`,
  never the reverse.
- **Principle VIII (language)** — PASS. This plan and all its artifacts are English, per the
  named `specs/` exception.
- **Principle IX (stack fixed, tooling open)** — PASS with a flagged open item: Vitest is used as
  the working assumption per `tools/README.md`, explicitly still challengeable (see Technical
  Context > Testing).
- **Principle X (challenge protocol)** — No challenge raised in this plan. The one interpretive
  call in this feature (including FR-0.13–FR-0.15/AC-0.11 in slice scope) was already recorded in
  `spec.md`'s Assumptions section, not re-litigated here.

No violations to record in Complexity Tracking.

**Post-design re-check** (after `research.md`/`data-model.md`/`quickstart.md`): still PASS on all
principles above. `data-model.md` names only fields already quoted from `docs/domain/casting.md`
and `docs/domain/audit-und-notifications.md` — no invented field (G-J4) — and does not reproduce
the eleven state values, which stay maßgeblich-only in `docs/03-PRD.md` §4.2.1. `research.md`'s
one new finding (Supavisor transaction mode disables prepared statements) is an implementation
detail for `/speckit-tasks`, not a constitution or docs/ conflict.

## Project Structure

### Documentation (this feature)

```text
specs/001-f0-foundations/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` — F0 has no external interface (no REST/GraphQL endpoint, no CLI). It is
consumed by other in-process modules, not called from outside the app.

### Source Code (repository root)

This is the first implementation slice in this repo — no `src/` exists yet. `prototype/` is the
Lovable clickthrough (out of the handover boundary per `docs/README.md` §1) and is not reused.
Structure follows ADR-001's modular monolith with six bounded contexts as internal module
boundaries; only the two this slice touches get a folder now — adding empty folders for
`identity`/`deliberation`/`scheduling`/`notifications` ahead of any code that would live there is
scaffolding this slice doesn't need (G-M1, scope discipline):

```text
src/
├── db/                     # Cross-cutting authorization substrate — not one of the six
│   │                       # contexts itself; every context depends on it (ADR-004)
│   ├── schema/             # Drizzle table + RLS policy definitions
│   └── session-context.ts  # The ONE transaction helper required by FR-0.3/FR-0.4 (G-C8):
│                           # sets household_id/resident_profile_id via SET LOCAL inside a
│                           # transaction; no other code path may set this
├── modules/
│   ├── casting/            # Application entity + 11-state machine (FR-0.9–FR-0.12)
│   │   └── schema.ts       # Application table, transition function
│   └── audit/              # ActivityEvent entity (FR-0.13–FR-0.15)
│       └── schema.ts       # ActivityEvent table, append-only trigger, payload validation

tests/
├── unit/                   # State-machine transition table, payload-allowlist validation
└── integration/
    ├── policy/             # Visibility-invariant tests via the policy layer
    └── raw-sql/            # The SAME invariants via raw SQL bypassing the policy layer —
                            # required twice per G-C7/AC-0.6, not a duplicate to be merged
```

**Structure Decision**: Single Next.js project (no separate frontend/backend split — F0 has no
UI). `src/db/` holds the authorization substrate rather than `src/modules/identity/`, because
FR-0.1–FR-0.4 are cross-cutting infrastructure every module depends on (ADR-004), not
`identity`-context business logic. `tests/integration/{policy,raw-sql}` mirrors G-C7's own
"both paths, tested separately" requirement directly in the folder layout so the two-path
obligation can't be quietly collapsed into one test later.

## Complexity Tracking

*No entries — the Constitution Check above recorded no violations requiring justification.*
