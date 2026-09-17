# Implementation Plan: F1 — Open a Casting Round

**Branch**: `002-f1-casting-round` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-f1-casting-round/spec.md`

## Summary

Build the `identity` bounded context for the first time (`Account`, `Household`,
`HouseholdSettings`, `ResidentProfile`, `Membership`, `Session`) and extend `casting` (already
populated by F0 with `Application`) with `Room` and `CastingRound`/`RoundParticipation` — plus the
UI screens these entities need (household registration, rooms, resident list, round creation,
household settings, org dashboard) and the procedure lock / administration boundary that constrain
all of them. This is the household's actual entry point: nothing before it exists to open a round
against, and everything after it (F2–F5) references the objects created here.

## Technical Context

**Language/Version**: TypeScript, Next.js 16.3.5 (`ADR-006`) — already installed by F0
(`package.json`), no version change needed for F1.

**Primary Dependencies**: `drizzle-orm` (schema + RLS policies, same pattern F0 established),
`@supabase/supabase-js` (Supabase Auth — F0 installed it but never called it; F1 is the first
feature to actually use it, via the **admin** API for account creation), `postgres` (driver, `{
prepare: false }` already required by F0's research.md §1 for the transaction-mode pooler). No new
dependency: registration/sign-in forms and the rooms/members/settings screens are plain React +
Tailwind against `docs/09-Design-System.md`'s tokens — `prototype/` is explicitly reference-only
for visual/UX shape, never for code (feedback memory: prototype is outside the handover boundary),
and no component library is installed for this slice (YAGNI — a handful of forms and a table don't
justify one).

**Storage**: Postgres 17 via Supabase EU (`ADR-006`), same project F0 provisioned
(`flatmate-io`/`cjinhzzvjryojvhngjjn`, `eu-west-1`). F1 adds its tables to the existing migration
chain — no new database.

**Testing**: Vitest, same as F0 (`tools/README.md`, explicitly open to challenge per constitution
Principle IX — no new argument for or against it arises in this slice).

**Target Platform**: Vercel serverless, EU region `fra1`, Supabase transaction-mode pooler
(`ADR-006`, confirmed 2026-09-16) — unchanged from F0. F1's `withSessionContext` extension (see
Research §1) inherits F0's `SET LOCAL`-only discipline (G-C8); it does not reopen the pooling risk,
it extends the existing mitigation to a third session variable.

**Project Type**: Single Next.js app; internal modular monolith (ADR-001) — F1 is the first slice
to populate the `identity` context and the first to add real, user-facing routes (F0 shipped no
UI).

**Performance Goals**: None specified — household-scale (A-1.3: single-digit rooms/residents), not
a performance-sensitive slice.

**Constraints**:
- Authorization enforced twice for every new table carrying `household_id` (G-C7/ADR-004): policy
  layer + RLS, both required, both tested (policy path and raw-SQL path).
- Session context extends from F0's `{householdId, residentProfileId}` (both mandatory) to
  `{accountId, householdId, profileId: string | null}` (ADR-013/ADR-004) — still set only via the
  one transaction helper, still `SET LOCAL` only (G-C8), see Research §1.
- Round-open snapshot + rule-freeze is atomic (FR-1.16): both effects or neither.
- Procedure lock while any round is `open` (FR-1.21/FR-1.22, invariant I-7).
- ADR-013: a household account never occupies a `ResidentProfile`; the acting identity is fixed at
  sign-in and has no write path afterward (guarded test G-D14, to be implemented in this slice —
  currently `pending` in `test/guarded.manifest.json`).
- ADR-014: a profile-less (household-account) session sees `CastingRound` identity/lifecycle
  fields but no value derived from `Application` — guarded test G-D15, also currently `pending`,
  also implemented in this slice. See the Constitution Check note below on the FR-1.23 wording.
- Every new 🟠 field (display name, role, permissions, join date, contact detail, etc. —
  `docs/domain/personenbezogene-felder.md` §9.3) needs a `data-inventory.yml` row (C-1.6, G-F1) —
  a `/speckit-tasks` item, not a design decision this plan needs to resolve.
- `Household.join_code` never appears in a log or query string (G-A5) — path-only, redacted in the
  access log for the join route specifically.

**Scale/Scope**: Household-scale; single-digit rooms and residents (A-1.3) — no pagination, bulk
import, or hierarchy needed anywhere in this slice.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md`:

- **Principle I (hard floor: G-C, G-D, G-L)** — PASS. This slice extends G-C's dual enforcement to
  three new tables and implements two previously-`pending` G-D invariants (G-D14, G-D15) rather
  than weakening any. It doesn't touch G-L (no AI/model calls in F1's scope).
- **Principle II (precedence order)** — PASS, with one finding recorded rather than silently
  resolved (see box below): `FR-1.23` as quoted in `spec.md` and `docs/backlog/requirements/
  F1-requirements.md` §3 predates `ADR-014` (F1-requirements.md is dated 2026-09-09; ADR-014 was
  confirmed 2026-09-14) and states a boundary ADR-014 has since narrowed.
- **Principle IV (docs/ authoritative)** — PASS. This plan does not edit `spec.md`'s already
  `/speckit-clarify`'d text or the requirements packet; it implements the current, later-dated
  authority (ADR-014) and records the drift below rather than silently picking one silently.
- **Principle V (cite, don't restate)** — PASS. `research.md`/`data-model.md` quote
  `docs/domain/identity.md` and `docs/domain/casting.md` fields directly; no field is invented
  (G-J4).
- **Principle VI (frozen files)** — PASS. No edit to `04-Domaenenmodell.md`, `05-ADRs.md`, or
  `07-Screen-Inventar.md`.
- **Principle VII (handover gate)** — PASS. This plan lives under `specs/`; citations run
  `specs/ → docs/`, never the reverse.
- **Principle VIII (language)** — PASS. English throughout, per the `specs/` exception.
- **Principle IX (stack fixed, tooling open)** — PASS, unchanged from F0.
- **Principle X (challenge protocol)** — **One finding, not a hard-floor conflict, recorded here
  rather than acted on unilaterally:**

> **Finding: `FR-1.23`'s literal wording is stale relative to a later, confirmed ADR.**
>
> `FR-1.23` (quoted verbatim from `docs/backlog/requirements/F1-requirements.md` §3, itself sourced
> from `S-50`) says a profile-less account "shall not reach casting rounds[...]." `docs/adr/
> 0014-haushalts-account-sieht-runden-ohne-bewerbungsdaten.md`, confirmed five days later
> (2026-09-14) and explicitly stated to redefine `S-50` ("`S-50` wird entsprechend neu gefasst[...]
> `CastingRound` verlässt die Liste"), narrows this: a profile-less session **does** see
> `CastingRound` identity/lifecycle fields (existence, `title`, `status`, `room_ids`, `opened_at`,
> `closed_at`, `phase_deadline_at`, the three retention fields) — needed for O17 retention
> management, S-35 procedure-lock enforcement, and `Room → not_available` — but **never** a value
> derived from `Application` (count, vote, participation, quorum, score, ranking), enforced by
> guarded test **G-D15**.
>
> This is not a genuine two-source conflict requiring a judgment call — checking `02-SRD.md` §5.3
> directly (rung 2, higher precedence than `docs/adr/`) shows its `S-50` line **already carries the
> ADR-014 precision** ("**Präzisiert durch ADR-014:** `CastingRound` ist davon ausgenommen, aber
> nur in Identität und Lebenszyklus[...] Alles aus `Application` Abgeleitete bleibt unsichtbar,
> ausdrücklich einschließlich Zahlen"), and `docs/review-log.md` §Offene-Punkte-Register already
> logs this as resolved (`02-SRD.md O-09`, "Geklärt (2026-09-14)"). The maßgeblich source for
> `S-50` is current. Only `docs/backlog/requirements/F1-requirements.md`'s `FR-1.23` — an
> erläuternd restatement of `S-50` for that packet's own `FR-1.*` ID family — never inherited that
> already-confirmed wording; per the constitution's own principle, "Widerspricht eine erläuternde
> Stelle der maßgeblichen, ist die erläuternde falsch" (`docs/SPEC-INDEX.md`). This plan builds
> against the current, correct `S-50`/ADR-014 text, not the stale `FR-1.23` wording `spec.md`
> quotes verbatim.
>
> **Correction, not a decision:** syncing `FR-1.23`'s wording to the `S-50` text that already
> exists is mechanical, not a new judgment call (the human decision was already made and recorded,
> 2026-09-14) — routed to a separate session (see conversation) rather than made inline here,
> since it touches `docs/` outside this feature's `specs/` scope.

No violations requiring Complexity Tracking — the above is a documentation-drift finding, not a
guardrail violation or an added complexity.

**Post-design re-check** (after `research.md`/`data-model.md`/`quickstart.md`): still PASS on all
principles. `data-model.md` lists only fields already quoted from `docs/domain/identity.md` and
`docs/domain/casting.md`; the `CastingRound` RLS design for a profile-less session (Research §3)
implements ADR-014's table exactly, with G-D15 as its guarded test.

## Project Structure

### Documentation (this feature)

```text
specs/002-f1-casting-round/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` — same reasoning as F0: no REST/GraphQL/CLI surface. Server Actions and route
handlers are called from this app's own UI, not by an external caller.

### Source Code (repository root)

Builds on F0's existing `src/db/` (cross-cutting auth substrate) and `src/modules/{casting,audit}`.
`identity` is a new module (first population of that bounded context, per
`docs/domain/kontextgrenzen.md` §4: `identity` is the root, imports nothing; `casting` may import
from `identity`, matching the existing `casting → identity` reference `RoundParticipation` and
`Application.created_by_profile_id` already need):

```text
src/
├── db/
│   ├── schema/
│   └── session-context.ts       # Extended: {accountId, householdId, profileId: string | null}
│                                 # (Research §1) — still the ONE place SET LOCAL is called
├── modules/
│   ├── identity/                 # NEW — first population of this context
│   │   ├── schema.ts             # Account, Household, HouseholdSettings, ResidentProfile,
│   │   │                         # Membership, Session
│   │   ├── repository.ts
│   │   ├── auth.ts               # Supabase Auth admin calls: derived-email mapping for
│   │   │                         # resident accounts (Research §2), (household, display_name)
│   │   │                         # + password sign-in resolution
│   │   └── transitions.ts        # ResidentProfile.status (prepared/active/moved_out) — a
│   │                             # two-way, one-shot transition, not a full machine (no
│   │                             # reopen/side-states like Application's eleven states)
│   ├── casting/                  # Extended (F0 already owns this folder for Application)
│   │   ├── schema.ts             # + Room, CastingRound, RoundParticipation
│   │   ├── repository.ts         # + room/round CRUD, round-open snapshot transaction
│   │   └── room-transitions.ts   # Room's six-state machine (separate file from
│   │                             # transitions.ts, which stays Application-only per F0's
│   │                             # existing convention — one state machine per file)
│   └── audit/                    # Unchanged structurally; new event_types only
│       └── payload-schemas.ts    # NEW — per-event_type positive-list entries for
│                                 # room.*/round.*/resident-list event types (G-D7)
├── app/
│   ├── (auth)/
│   │   ├── register/             # A1 — household registration
│   │   └── sign-in/              # (household, display_name) + password / household + password
│   └── (org)/                    # Organisation-side routes, profile-less admin AND moderator
│       ├── dashboard/            # O1 — Orga-Dashboard
│       ├── rounds/new/           # O2 — Runde anlegen
│       ├── rooms/                # O14 — Zimmer
│       ├── members/              # O16 — Mitglieder (resident list)
│       └── settings/             # O20 — Haushalt-Einstellungen

tests/
├── unit/
│   ├── identity/                 # display_name uniqueness, ResidentProfile status transition,
│   │                             # derived-email mapping (pure function, no network)
│   └── casting/
│       └── room-transitions.test.ts
└── integration/
    ├── policy/                   # + household/member/room/round scoping via the policy layer
    └── raw-sql/                  # the SAME, bypassing the policy layer (G-C7)
```

**Structure Decision**: Single Next.js project, unchanged from F0. `identity` gets its own module
folder (unlike F0's `src/db/`-only auth substrate) because F1's identity entities — `Account`,
`Household`, `ResidentProfile`, `Membership` — are `identity`-context business data (owned per
`docs/domain/kontextgrenzen.md` §4), not cross-cutting infrastructure; `src/db/session-context.ts`
remains the one cross-cutting piece every context depends on. Route groups `(auth)` and `(org)`
split by audience (public/unauthenticated registration and sign-in vs. authenticated
administration), matching how `docs/screens/A-zugang.md` and `docs/screens/O-organisation.md`
already separate them.

## Complexity Tracking

*No entries — the Constitution Check above recorded one documentation-drift finding, not a
guardrail violation requiring justification.*
