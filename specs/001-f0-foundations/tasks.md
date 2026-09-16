# Tasks: F0 — The Substrate (Authorization + State Machine + Audit Log)

**Input**: Design documents from `specs/001-f0-foundations/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included. Not optional here — `docs/GUARDRAILS.md` G-D's own enforcement mechanism
(`test/guarded.manifest.json`, CI existence-check) requires the guarded tests below to exist from
the same commit as the behavior they protect, and `quickstart.md` is written entirely around
running them.

**Organization**: by user story, per `spec.md`'s three priorities (P1 authorization, P2 state
machine, P3 audit log).

**Scope discipline**: only FR-0.1–FR-0.4, FR-0.9–FR-0.12, FR-0.13–FR-0.15 (per `spec.md`). No task
here touches FR-0.5–FR-0.8 (data-inventory gate), the six-context import-boundary lint (AC-0.8), or
dependency/license tooling (AC-0.9) — all explicitly out of scope for this slice.

**Post-`/speckit-analyze` revision (2026-09-16)**: this file was renumbered after `/speckit-analyze`
found that `ActivityEvent` (which carries `household_id`, per `data-model.md`) had no RLS
visibility policy of its own (FR-0.2/AC-0.6 gap), that no generic build-time check enforces
EC-0.1/EC-0.2/Minimal-Gate-item-5 across every `household_id` table, and that T030's
retention-redaction task depended on `Application.retention_until`, a field missing from
`data-model.md` (now fixed there, sourced from `docs/domain/casting.md` §7/line 124). T003's region
hedge is also resolved: the live Supabase project (`get_project`, 2026-09-16) confirms `eu-west-1`
for the database — distinct from, and not required to match, the solver's `eu-central-1` Lambda
(ADR-005, a separate AWS service).

## Phase 1: Setup

- [X] T001 Initialize the Next.js/TypeScript project per `plan.md`'s Project Structure
      (`src/db/`, `src/modules/casting/`, `src/modules/audit/`, `tests/unit/`,
      `tests/integration/{policy,raw-sql}`) — ADR-006.
- [X] T002 [P] Add Drizzle ORM and the `postgres` (`postgres-js`) driver; configure the client with
      `{ prepare: false }`, required because `DATABASE_URL` points at Supabase's transaction-mode
      pooler (port `6543`), which does not support prepared statements (`research.md` §1).
- [X] T003 [P] Add `.env.example` with `DATABASE_URL` pointed at the transaction-mode pooler for
      project `flatmate-io` (`cjinhzzvjryojvhngjjn`, `eu-west-1` — confirmed via Supabase MCP
      `get_project`, 2026-09-16; distinct from the solver's `eu-central-1` Lambda, ADR-005, a
      separate AWS service) — no real credentials, per G-A2.
- [X] T004 [P] Configure Vitest as the test runner (`tools/README.md` proposal; open to challenge
      per constitution Principle IX — this task only wires up the working assumption).

## Phase 2: Foundational (blocking prerequisites for all three user stories)

**⚠️ CRITICAL**: No user story task may begin until this phase is complete.

- [X] T005 Create the single transaction-context helper in `src/db/session-context.ts`: opens a
      Drizzle transaction and sets the active `household_id` and `resident_profile_id` via
      `SET LOCAL` inside it (FR-0.3: *"shall be set through exactly one transaction helper, and
      through no other code path"*). No other file may call `SET` or `SET LOCAL` on the session
      context.
- [X] T006 Add a lint rule (ESLint custom rule or a `grep`-based CI check) that fails the build on
      any bare `SET` (without `LOCAL`) outside `src/db/session-context.ts`, and separately on any
      `SET LOCAL` for the session context outside that same file (FR-0.4; G-C8).
- [X] T007 [P] Add a lint rule restricting imports of the raw Postgres/Drizzle client to
      `src/db/` and each module's own `repository.ts` — no route, component, or job handler may
      import it directly (FR-0.1: *"no data access to personal tables from a route, server
      component or job handler may bypass them"*; G-C1).
- [X] T008 [P] Add a generic, schema-introspecting build-time check (a script over Drizzle's schema
      metadata or `pg_tables`/`pg_policies`) that fails CI if any table with a `household_id`
      column has zero RLS policies — implements EC-0.1/EC-0.2 and Minimal-Gate item 5 as a standing
      gate, not a per-table manual task. Only builds the check here; it can't yet see every table
      this feature will create (`ActivityEvent` doesn't exist until Phase 4), so the first full run
      against the complete schema is T037 (Polish).
- [X] T009 [P] Scaffold `test/guarded.manifest.json` with an entry for each of the fifteen G-D
      invariants (`docs/GUARDRAILS.md` G-D1–G-D15), initially failing except where this feature
      implements one (Minimal-Gate item 6). This slice implements G-D3 (state transitions),
      G-D7/G-D8 (payload allowlist/redaction), and G-D10 (pool-reuse leak) — the rest stay
      registered-but-failing so a later feature can't silently skip one.
- [X] T010 Create the Drizzle schema file for `Application` in `src/modules/casting/schema.ts`
      with the fields this slice needs, quoted from `data-model.md` (source:
      `docs/domain/casting.md` §2.2): `id` (`uuid`), `household_id` (`uuid`, `NOT NULL` — *"Anker
      der RLS-Policy (ADR-004)"*), `round_id` (`uuid`), `state` (`enum`, values from
      `docs/03-PRD.md` §4.2.1 — do not invent the eleven names here, import/reference the
      maßgeblich transition table's own value list), `state_changed_at` (`timestamptz`),
      `became_resident_id` (`uuid`, nullable), `created_by_account_id` (`uuid`),
      `created_by_profile_id` (`uuid`, `NOT NULL`), `retention_until` (`date`, default
      `created_at + 180 days` — `docs/domain/casting.md` §7/line 124), `created_at`
      (`timestamptz`), `deleted_at` (`timestamptz`, nullable). Needed by both US1 (household-scoped
      RLS) and US2 (state machine) — created once, here, per the data-model's "put a multi-story
      entity in the earliest phase that needs it" guidance.

**Checkpoint**: transaction helper, lint rules, the RLS-coverage check, the guarded-manifest
scaffold, and the `Application` table exist. User story implementation can begin.

---

## Phase 3: User Story 1 - Authorization enforced twice (Priority: P1) 🎯 MVP

**Goal**: No query — through the policy layer or bypassing it — can return another household's
`Application` rows, even if the application code forgets to scope by `household_id`.

**Independent Test**: `vitest run tests/integration/policy/household-scoping.test.ts
tests/integration/raw-sql/household-scoping.test.ts tests/integration/raw-sql/pool-reuse.test.ts`
— all pass with zero cross-household rows returned, without any other user story's code existing.

### Tests for User Story 1

> Write these first; they must fail (no RLS policy, no repository, no helper wired up yet).

- [X] T011 [P] [US1] Guarded test **G-D10/AC-0.7** (pool-reuse leak) in
      `tests/integration/raw-sql/pool-reuse.test.ts`: two households' requests run sequentially
      over the same physical Postgres connection (borrowed twice from the transaction-mode
      pooler); the second must see nothing set by the first. Mark `[GUARDED]` with
      `// GUARDRAIL: G-C8 — siehe GUARDRAILS.md`, register in `test/guarded.manifest.json` from
      T009.
- [X] T012 [P] [US1] Test in `tests/unit/lint/session-context.test.ts`: a bare `SET` (no `LOCAL`)
      anywhere outside `src/db/session-context.ts`, and a raw-client import anywhere outside
      `src/db/`/`repository.ts` files, both fail the lint check from T006/T007.
- [X] T013 [P] [US1] Guarded test (household-scoping half of AC-0.6, via the policy layer) in
      `tests/integration/policy/household-scoping.test.ts`: given two households A and B, each
      with an `Application`, a policy-layer query scoped to household A returns zero rows from
      household B — even when the query itself omits a `WHERE household_id` clause. Register as
      `…_via_policy` in `test/guarded.manifest.json`.
- [X] T014 [P] [US1] Guarded test (household-scoping half of AC-0.6, via raw SQL) in
      `tests/integration/raw-sql/household-scoping.test.ts`: the same scenario as T013, run as raw
      SQL under the application's database role with the session context set, bypassing the
      policy layer entirely. Must independently return zero rows — per G-C7, a pass on T013 alone
      does not satisfy this. Register as `…_via_raw_sql`.

### Implementation for User Story 1

- [X] T015 [US1] Add the RLS policy for `Application` in `src/modules/casting/schema.ts` using
      Drizzle's `pgPolicy` (verified API, `research.md` §2): policy scopes all access to rows
      where `household_id` matches the session context set by T005. `pgTable`'s `withRLS`/the
      policy addition enables RLS automatically (FR-0.2: *"Postgres row-level security active,
      with at least one policy, on every table carrying a `household_id`"*).
- [ ] T016 [US1] Confirm the application's Postgres role is not the owner of the `Application`
      table (G-C2) — structural enforcement, not convention; verify in the migration/role setup,
      not just documented. Test written (`tests/integration/policy/table-ownership.test.ts`); not
      yet run — blocked on the `app_runtime` role/password, see implementation notes below.
- [X] T017 [US1] Create the central repository/policy object in
      `src/modules/casting/repository.ts`: the only sanctioned entry point for reading/writing
      `Application`, internally always opening its transaction through the T005 helper. No other
      file may query `Application` directly (FR-0.1).
- [ ] T018 [US1] Run T011–T014 and confirm all four pass.

**Checkpoint**: User Story 1 is independently functional — authorization is enforced through the
policy layer and through RLS independently, and the pool-reuse leak is proven closed.

---

## Phase 4: User Story 2 - Application state machine (Priority: P2)

**Goal**: Every state transition either matches a row in `docs/03-PRD.md` §4.2.1's transition
table or throws; no boolean flag ever substitutes for `state`.

**Independent Test**: `vitest run tests/unit/casting/state-machine.test.ts` — passes using only
the `Application` table from Phase 2 and this phase's own code, without User Story 3 existing.

### Tests for User Story 2

- [X] T019 [P] [US2] Test in `tests/unit/casting/state-machine.test.ts`: after migration, all
      eleven states declared in `docs/03-PRD.md` §4.2.1 exist as valid enum values (FR-0.9).
- [X] T020 [P] [US2] Test (same file): every `(from, to)` pair *not* present as a row in
      `docs/03-PRD.md` §4.2.1 throws when attempted — no silent fallthrough, no "unknown state"
      branch (FR-0.10, EC-0.7).
- [X] T021 [P] [US2] Test in `tests/unit/audit/backward-transition.test.ts`: a permitted backward
      transition produces exactly one `ActivityEvent` naming `actor_account_id` and
      `actor_profile_id` and recording the originating and target state (FR-0.11).

### Implementation for User Story 2

- [X] T022 [US2] Create the `ActivityEvent` schema in `src/modules/audit/schema.ts`, fields per
      `data-model.md` (source: `docs/domain/audit-und-notifications.md`): `id` (`uuid`),
      `household_id` (`uuid`, *"RLS-Anker"*), `round_id` (`uuid`, nullable), `event_type` (`text`),
      `subject_type`/`subject_id` (`text`/`uuid`), `actor_account_id` (`uuid`, nullable),
      `actor_profile_id` (`uuid`, nullable), `payload` (`jsonb`), `occurred_at` (`timestamptz`),
      `correlation_id` (`uuid`, nullable), `reverses_event_id` (`uuid`, nullable). Needed by both
      this story (backward-transition events) and User Story 3 (the log itself) — created here as
      the earliest story that needs it.
- [X] T023 [US2] Implement the transition function in `src/modules/casting/repository.ts` (extends
      T017): accepts `(application, fromState, toState)`, validates against
      `docs/03-PRD.md` §4.2.1's table, throws `InvalidTransitionError` otherwise, and on success
      writes the new `state`/`state_changed_at` and one `ActivityEvent` row in the same
      transaction (via the T005 helper).
- [X] T024 [US2] Ensure `state` is the only field read to determine `Application` behavior
      anywhere in `src/modules/casting/` — no derived boolean stands in for it (FR-0.12); add a
      lint or review note if a boolean-flag pattern is detected. Reviewed: `repository.ts` and
      `transitions.ts` read/write only `state`; no derived boolean exists.
- [ ] T025 [US2] Run T019–T021 and confirm all three pass.

**Checkpoint**: User Stories 1 and 2 both work independently — authorization holds, and the state
machine rejects undeclared transitions and audits backward ones.

---

## Phase 5: User Story 3 - Audit log immutability (Priority: P3)

**Goal**: `ActivityEvent` can never be rewritten, can never leak across households, and its
payload can never carry more than references and counters for a deliberation event.

**Independent Test**: `vitest run tests/unit/audit/immutability.test.ts
tests/unit/audit/payload-allowlist.test.ts tests/integration/policy/activityevent-scoping.test.ts
tests/integration/raw-sql/activityevent-scoping.test.ts` — passes using only the `ActivityEvent`
table from Phase 4, without needing a real `Application` state transition to have occurred.

### Tests for User Story 3

- [X] T026 [P] [US3] Test in `tests/unit/audit/immutability.test.ts`: an `UPDATE` or `DELETE` on an
      existing `ActivityEvent` fails through the application repository, through a migration
      script, and via raw SQL — all three paths (FR-0.13, AC-0.11).
- [X] T027 [P] [US3] Test in `tests/unit/audit/payload-allowlist.test.ts`: a write with a payload
      key not on the per-`event_type` positive list — a bare `value` key or any free-text field —
      is rejected; `{application_id, votes_cast: 5}`-shaped payloads (references/counters only)
      are accepted (FR-0.14, EC-0.5).
- [X] T028 [P] [US3] Test (same file): simulated end-of-retention redaction sets only the 🔴/⚫
      payload fields to `null` on an `ActivityEvent`, leaving `id`, `occurred_at`, `event_type`,
      `actor_account_id`, `actor_profile_id` readable (FR-0.13, EC-0.6).
- [X] T029 [P] [US3] Guarded test (household-scoping for `ActivityEvent`, via the policy layer,
      FR-0.2/AC-0.6 — found missing by `/speckit-analyze`) in
      `tests/integration/policy/activityevent-scoping.test.ts`: given two households A and B, each
      with `ActivityEvent` rows, a policy-layer query scoped to household A returns zero rows from
      household B, even when the query omits a `WHERE household_id` clause. Register as
      `…_activityevent_via_policy` in `test/guarded.manifest.json`.
- [X] T030 [P] [US3] Guarded test (household-scoping for `ActivityEvent`, via raw SQL) in
      `tests/integration/raw-sql/activityevent-scoping.test.ts`: the same scenario as T029, run as
      raw SQL under the application's database role with the session context set, bypassing the
      policy layer entirely. Must independently return zero rows. Register as
      `…_activityevent_via_raw_sql`.

### Implementation for User Story 3

- [X] T031 [US3] Add a database-level guard against `UPDATE`/`DELETE` on `ActivityEvent` (a
      `BEFORE UPDATE OR DELETE` trigger that raises, or an equivalent RLS `FOR UPDATE`/`FOR
      DELETE` policy with `USING (false)`) so the append-only rule holds even against raw SQL and
      migrations, not only the repository layer (FR-0.13). Implemented as two RESTRICTIVE policies
      plus `FORCE ROW LEVEL SECURITY` (closes the table-owner RLS exemption too).
- [X] T032 [US3] Add the RLS policy for `ActivityEvent` in `src/modules/audit/schema.ts` using
      Drizzle's `pgPolicy` (same mechanism as T015): policy scopes `SELECT` (and any command not
      already closed off by T031's `USING (false)`) to rows where `household_id` matches the
      session context set by T005 (FR-0.2 — `ActivityEvent` carries `household_id`, so it is
      covered by the same "every table carrying a `household_id`" requirement as `Application`).
- [ ] T033 [US3] Confirm the application's Postgres role is not the owner of the `ActivityEvent`
      table (G-C2) — mirrors T016 for the second `household_id`-carrying table. Same
      `table-ownership.test.ts` as T016; not yet run — same blocker.
- [X] T034 [US3] Implement the per-`event_type` payload positive-list validator in
      `src/modules/audit/repository.ts`, called before every `ActivityEvent` insert (FR-0.14). Per
      `research.md` §4, this is application-layer validation only — no database-level mirror is
      added, since no FR/AC in this slice's scope asks for double enforcement here the way G-C7
      does for authorization.
- [X] T035 [US3] Implement the retention-redaction path that sets 🔴/⚫ payload fields to `null`
      on `ActivityEvent` rows referencing an `Application` whose `retention_until` (T010's field,
      `docs/domain/casting.md` §7) has passed, leaving structure and timestamps intact (FR-0.13).
- [ ] T036 [US3] Run T026–T030 and confirm all five pass.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T037 Run T008's RLS-coverage build check against the complete schema (`Application` and
      `ActivityEvent` both exist by now) and confirm zero failures — this is the first point at
      which the check can see every table this feature creates.
- [X] T038 Run `bash tools/check-refs.sh --quiet` and confirm it still exits 0 — this feature's own
      spec/plan/data-model/tasks live under `specs/`, which the checker now covers. Also fixed a
      latent bug this surfaced: Rules 2/2b's `find .` filename lookups had no `node_modules`
      exclusion (only `.git`), so adding a real `node_modules/` made every lookup crawl it —
      harmless before this feature, since there was no implementation tree yet.
- [ ] T039 Run `quickstart.md`'s full validation sequence end to end (§1–§4) and confirm every
      `Expected` outcome holds.
- [X] T040 Confirm no `.skip`/`.only`/commented-out body exists in any file containing a
      `[GUARDED]` test (G-D's own CI check) — T011, T013, T014, T029, T030 at minimum.
- [ ] T041 [P] Update `docs/review-log.md`'s "ADR-006 (2026-09-16)" open item once T011 (G-D10)
      passes under the transaction-mode pooler specifically — this is the empirical verification
      that entry is tracking, not a formality.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all three user stories** — T005/T006/T007
  in particular, since every later task's tests rely on the transaction helper and lint rules
  existing and being correct. T008 (RLS-coverage check) is built here but only fully exercised in
  Polish (T037), once `ActivityEvent` exists.
- **User Story 1 (Phase 3)**: depends on Foundational only. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: depends on Foundational; T022 (`ActivityEvent` schema) and T023
  (transition function) depend on T010 (`Application` schema) and T005 (transaction helper), not
  on User Story 1's own tasks (T015–T017) — independently testable per its own Independent Test.
- **User Story 3 (Phase 5)**: depends on Foundational and on T022 (`ActivityEvent` schema, created
  in Phase 4) — this is the one real cross-story dependency, matching the data-model's
  earliest-story placement rule. Does not depend on US1 or on US2's transition-function logic
  (T023–T024).
- **Polish (Phase 6)**: depends on all three user stories being complete.

### Parallel Opportunities

- T002–T004 (Setup) in parallel.
- T007–T009 (Foundational) in parallel with each other, after T005/T006.
- T011–T014 (US1 tests) in parallel with each other.
- T019–T021 (US2 tests) in parallel with each other, and with T011–T014 if staffed separately
  (both phases depend only on Foundational).
- T026–T030 (US3 tests) in parallel with each other, once T022 exists.

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → Phase 3 (User Story 1). Authorization enforced twice is the
hard-floor guarantee (constitution Principle I, G-C/G-D) every later feature depends on — validate
it in isolation before adding the state machine or audit log.

**Incremental delivery**: Setup + Foundational → US1 (MVP, authorization) → US2 (state machine,
depends on the same `Application` table) → US3 (audit log, depends on US2's `ActivityEvent`
schema) → Polish.
