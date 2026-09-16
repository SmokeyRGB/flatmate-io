# Feature Specification: F0 — The Substrate (Authorization + State Machine + Audit Log)

**Feature Branch**: `001-f0-foundations`

**Created**: 2026-09-16

**Status**: Draft

**Input**: Implement the F0 foundations packet as specified in
[`docs/backlog/requirements/F0-requirements.md`](../../docs/backlog/requirements/F0-requirements.md).
Slice covers authorization enforced twice (FR-0.1–FR-0.4), the visibility invariant double-test
requirement (AC-0.6, G-C7, ADR-004), the eleven-state `Application` machine (FR-0.9–FR-0.12,
AC-0.10), and the append-only audit log's immutability (FR-0.13–FR-0.15, AC-0.11). Out of scope:
the data-inventory CI gate (FR-0.5–FR-0.8) and the activity-feed UI (explicitly v0.2 per
F0-requirements.md §1).

## Why this spec has no end-user personas

Per [`docs/backlog/requirements/F0-requirements.md`](../../docs/backlog/requirements/F0-requirements.md)
§2 — the maßgeblich source for this packet's framing — F0 is infrastructure, not a feature:
*"These are not user stories and nobody would put them in a pitch."* Nobody logs in to use
central policy objects, a state-transition table, or an audit log; they are the substrate F1–F5
stand on. The "User Scenarios" below are therefore framed as system-behavior guarantees that a
developer implementing F1–F5, or a reviewer auditing the system, can rely on — not journeys a
resident or moderator takes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authorization cannot be bypassed by a forgotten query condition (Priority: P1)

A developer building any of F1–F5 writes a query against a personal-data table. Whether or not
they remember to scope it to the current household, the system must not return another
household's data.

**Why this priority**: Per
[`docs/adr/0004-*.md`](../../docs/adr/) (maßgeblich source for "Autorisierung doppelt", per
[`docs/SPEC-INDEX.md`](../../docs/SPEC-INDEX.md)), authorization is enforced twice — centrally in
a policy layer, and independently by Postgres row-level security — specifically because AI-assisted
implementation makes a missing `WHERE household_id = …` a realistic, recurring failure mode. This
is a hard-floor guarantee (G-C, `docs/GUARDRAILS.md`) per the project constitution
(`.specify/memory/constitution.md`, Principle I): it must hold even when the first line of defense
fails, not only when both are used correctly.

**Independent Test**: Can be fully tested by attempting to read another household's data (a) through
the application's policy layer and (b) via raw SQL under the application's database role with the
session context set, bypassing the policy layer entirely — both must return zero rows.

**Acceptance Scenarios**:

1. **Given** two households A and B, **When** a query for household A's data omits any
   household-scoping condition, **Then** Postgres row-level security still returns zero rows
   for household B's tables (FR-0.2).
2. **Given** a visibility invariant V-1…V-4 (defined in
   [`docs/domain/invarianten.md`](../../docs/domain/invarianten.md) §5, the maßgeblich source per
   `docs/SPEC-INDEX.md`), **When** the invariant is tested, **Then** it is verified twice — once
   through the policy layer and once as raw SQL against the same tables under the application role
   — and both paths return empty. A single-path test does not satisfy this (G-C7: *"sonst ist
   ADR-004 eine Illusion"*, `docs/GUARDRAILS.md`).
3. **Given** two requests from different households served sequentially over the same pooled
   database connection, **When** the session context is set via the single transaction helper
   required by FR-0.3, **Then** the second request sees nothing set by the first — and a bare
   `SET` (without `LOCAL`) of that context is rejected by lint before merge (FR-0.4).

---

### User Story 2 - The Application lifecycle cannot enter an undeclared state (Priority: P2)

A developer implementing casting/deliberation logic (F1–F5) transitions an `Application` between
states. The system must reject any transition that is not explicitly declared, and must never
represent state as an inferred boolean condition.

**Why this priority**: Per [`docs/03-PRD.md`](../../docs/03-PRD.md) §4.2.1 (the maßgeblich
transition table, per `docs/SPEC-INDEX.md`) and
[`docs/adr/0002-*.md`](../../docs/adr/) (explicit state machine over boolean flags), retrofitting
this after boolean flags exist means migrating live data through an ambiguous intermediate state —
the cost `docs/backlog/requirements/F0-requirements.md` §1 names as the reason this ships in F0
rather than later.

**Independent Test**: Can be fully tested by attempting every possible `(from_state, to_state)`
pair against the eleven declared states and asserting that only rows present in the
`03-PRD.md` §4.2.1 transition table succeed; all others throw.

**Acceptance Scenarios**:

1. **Given** the first migration, **When** the schema is created, **Then** all eleven `Application`
   states exist, even though v0.1's application code only reaches `invited` (FR-0.9).
2. **Given** an attempted transition, **When** it is not a row in the `03-PRD.md` §4.2.1 table,
   **Then** it throws — no silent fallthrough, no "unknown state" branch (FR-0.10, EC-0.7).
3. **Given** a permitted backward transition, **When** it executes, **Then** it produces exactly
   one `ActivityEvent` naming the acting account and profile and recording the originating and
   target state (FR-0.11).
4. **Given** any state that governs behavior, **When** the code checks it, **Then** it reads a
   declared enum value — never a derived or inferred boolean condition (FR-0.12).

---

### User Story 3 - The audit log proves what happened even after content is gone (Priority: P3)

An auditor or a data-subject-access process needs to establish that a given action occurred and
who performed it, even after the personal-data content of that action has been redacted at the
end of its retention period.

**Why this priority**: Per [`docs/adr/0003-*.md`](../../docs/adr/) (maßgeblich source for
"Append-only-Protokoll", per `docs/SPEC-INDEX.md`), `ActivityEvent` is append-only specifically so
that the accountability chain survives deletion — described in `docs/GUARDRAILS.md` G-D7/G-D8 as
the difference between "the log is not a workaround around V-1" being an assertion versus a
verified property.

**Independent Test**: Can be fully tested by attempting an `UPDATE` or `DELETE` on an existing
`ActivityEvent` through the application, a migration, and raw SQL — all three must fail — and by
running a retention-end redaction and confirming the event row survives with only its 🔴/⚫ payload
fields set to `null`.

**Acceptance Scenarios**:

1. **Given** an existing `ActivityEvent`, **When** an `UPDATE` or `DELETE` is attempted through any
   path, **Then** it fails (FR-0.13, AC-0.11).
2. **Given** an `ActivityEvent.payload` write, **When** it contains a key not on the
   per-`event_type` positive list — a free-text value or a bare `value` key — **Then** it is
   rejected (FR-0.14, EC-0.5).
3. **Given** an `Application`'s retention period ending, **When** redaction runs, **Then** its
   referencing `ActivityEvent` rows survive with 🔴/⚫ payload fields set to `null`, while
   structure, timestamps, and the who/when/what-kind-of-action chain remain readable (FR-0.13,
   EC-0.6).

### Edge Cases

Selected from [`docs/backlog/requirements/F0-requirements.md`](../../docs/backlog/requirements/F0-requirements.md)
§6 (maßgeblich for this packet's edge cases); not restated, only the required behavior is
summarized with its source ID:

- **EC-0.1 / EC-0.2**: A table with `household_id` ships without an RLS policy, or a migration
  contains `DISABLE ROW LEVEL SECURITY` — both must fail the build before merge, not at runtime.
- **EC-0.3**: A visibility-invariant test exists only against the policy layer — the manifest
  check must fail the invariant as *unverified*, not report it as passing.
- **EC-0.7 / EC-0.8**: An undeclared `Application` transition throws; a reverse transition into a
  state whose underlying data was already deleted is deliberately unavailable, not an oversight.
- **EC-0.9**: Two households served back-to-back on one pooled connection — the second must see
  nothing set by the first, proven by a guarded test, not by inspection.
- **EC-0.5 / EC-0.6**: An `ActivityEvent` payload write with a free-text or bare-value key is
  rejected; an `Application` whose retention ends while `ActivityEvent`s still reference it leaves
  those rows readable in structure but `null` in 🔴/⚫ payload fields.

## Requirements *(mandatory)*

### Functional Requirements

Quoted verbatim from their maßgeblich source,
[`docs/backlog/requirements/F0-requirements.md`](../../docs/backlog/requirements/F0-requirements.md)
§3 (the authoritative file for `FR-0.*` per `docs/README.md` §3's ID register) — not restated in
new prose, per the constitution's "cite, don't restate" principle:

- **FR-0.1**: *"The system shall enforce authorization through central policy objects,
  independently of the client — no data access to personal tables from a route, server component
  or job handler may bypass them."* (maßgeblich rule source: `docs/adr/0004-*.md`)
- **FR-0.2**: *"The system shall have Postgres row-level security active, with at least one
  policy, on every table carrying a `household_id`."* (`docs/adr/0004-*.md`)
- **FR-0.3**: *"The session context that row-level security reads (the active `household_id` and
  `resident_profile_id`) shall be set through exactly one transaction helper, and through no other
  code path."* (`docs/GUARDRAILS.md` G-C8)
- **FR-0.4**: *"A `SET` of the session context without `LOCAL` shall be rejected by lint."*
  (`docs/GUARDRAILS.md` G-C8)
- **FR-0.9**: *"All eleven `Application` states — the seven main-path states plus the four side
  states — shall exist from the first migration, even though the v0.1 slice's application code
  only reaches `invited`."* (maßgeblich rule source: `docs/03-PRD.md` §4.2.1)
- **FR-0.10**: *"Only the transitions declared in the transition table of `03-PRD.md` §4.2.1 shall
  be permitted; an undeclared transition shall throw rather than silently fail or fall through to
  an unknown state."* (`docs/03-PRD.md` §4.2.1; `docs/adr/0002-*.md`)
- **FR-0.11**: *"Backward transitions shall be permitted, and every backward transition shall
  produce an `ActivityEvent` recording the originating and target state."* (`docs/03-PRD.md`
  §4.2.1)
- **FR-0.12**: *"No boolean flag shall stand in for a state; every state that governs behaviour
  shall be one of the declared enum values, not a derived or inferred condition."*
  (`docs/adr/0002-*.md`)
- **FR-0.13**: *"`ActivityEvent` shall be append-only: entries shall never be updated or deleted,
  except by the deletion concept acting on the entries' referenced data."* (maßgeblich rule
  source: `docs/adr/0003-*.md`)
- **FR-0.14**: *"The `payload` of an `ActivityEvent` shall be validated against a positive list of
  allowed keys per `event_type`; a deliberation event may carry only references and counters, and
  a write containing a free-text value or a bare value key shall be rejected."* (`docs/adr/0003-*.md`;
  `docs/GUARDRAILS.md` G-D7)
- **FR-0.15**: *"v0.1 shall ship the append-only log only. The activity feed user interface is out
  of scope for v0.1 and lands in v0.2."* (`docs/backlog/requirements/F0-requirements.md` §1)

### Key Entities *(include if feature involves data)*

- **Application**: the eleven-state entity whose transition table is maßgeblich in
  `docs/03-PRD.md` §4.2.1. This spec does not restate its schema — see
  `docs/domain/casting.md` §3 (erläuternd) and the frozen `docs/04-Domaenenmodell.md` (hash-locked,
  line-number citations permitted only there per the constitution's Principle VI).
- **ActivityEvent**: the append-only audit record, maßgeblich in `docs/adr/0003-*.md`, with its
  payload allowlist behavior in `docs/GUARDRAILS.md` G-D7/G-D8.
- **Household / ResidentProfile session context**: the authorization scope RLS reads, maßgeblich
  in `docs/adr/0004-*.md` and `docs/domain/invarianten.md` §5 (V-1…V-4).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero cross-household data exposures across all visibility-invariant tests, verified
  through two independent paths (policy layer and raw SQL) for each of V-1…V-4 — a single-path
  pass does not count (AC-0.6).
- **SC-002**: 100% of attempted `Application` state transitions either succeed as a declared row
  in the transition table or throw — zero silent fallthroughs and zero derived-boolean stand-ins
  for state, across all eleven states (AC-0.10).
- **SC-003**: 100% of attempted modifications (`UPDATE`/`DELETE`) to an existing `ActivityEvent`
  are rejected, across all three access paths (application, migration, raw SQL) (AC-0.11).
- **SC-004**: A retained `ActivityEvent` remains fully readable in structure, timestamps, and
  actor/action-kind chain after its referenced `Application`'s retention ends, with only its
  restricted-category payload fields cleared (AC-0.11, FR-0.13).
- **SC-005**: A session context leak across pooled connections between two different households
  occurs zero times under sequential reuse of the same physical connection (AC-0.7, FR-0.4).

## Assumptions

- **Scope boundary for this slice**: this spec covers FR-0.1–FR-0.4 (authorization), the
  visibility-invariant double-test requirement (AC-0.6/G-C7/ADR-004), FR-0.9–FR-0.12 with AC-0.10
  (state machine), and FR-0.13–FR-0.15 with AC-0.11 (audit-log immutability). FR-0.5–FR-0.8 (the
  `data-inventory.yml` CI gate) are explicitly **out of scope** for this slice and are deferred to
  a later spec — the instruction driving this spec named AC-0.11 explicitly, which
  `docs/SPEC-INDEX.md`'s "Append-only-Protokoll" row and `docs/backlog/requirements/F0-requirements.md`
  §4 both trace to FR-0.13–FR-0.15, so those three requirements are included even though the
  authorization/state-machine FR ranges alone would not have implied them. Flagging this
  explicitly rather than silently narrowing or widening scope.
- Concrete tool choices (test runner, lint plugin for import boundaries, secret scanner, license
  checker) remain `⚠️ TBD` per `docs/GUARDRAILS.md` and `.specify/memory/constitution.md`
  Principle IX — this spec does not resolve them; `/speckit-plan` is where a tool proposal would be
  argued, per the constitution's challenge protocol (explicitly-open tier).
- This packet has no end-user personas by design — see the "Why this spec has no end-user
  personas" section above.
