# Phase 0 Research: F0 — The Substrate

No `NEEDS CLARIFICATION` markers remain in `plan.md`'s Technical Context — the stack is fixed by
ADR-006/ADR-001 and this feature has no genuinely open technology choice. What follows are the
implementation-risk questions worth resolving with verified facts before design, not stack
decisions.

## 1. Connection mode and its interaction with `SET LOCAL`

**Decision**: **Supabase's Supavisor pooler in transaction mode** — confirmed 2026-09-16
(`docs/adr/0006-*.md`, "Änderung 2026-09-16" and the "Datenbankverbindung" row), superseding two
earlier drafts of this section. History, so the reasoning isn't lost: draft 1 wrongly assumed
serverless without checking ADR-006 and picked transaction-mode pooling by default; draft 2
corrected to a direct/session-mode connection after finding ADR-006 explicitly required it
*for the container-based architecture that was confirmed at the time*; the project owner then
made an explicit decision to move the solver to its own service (`docs/adr/0005-*.md`) specifically
so the app could go serverless on Vercel, which reopens the connection-mode question for real —
this section reflects that final, human-confirmed state, not another assumption.

**Why transaction-mode pooling is required, not just permitted**: a serverless/edge runtime cannot
hold a long-lived direct connection the way a container can — many concurrent function invocations
need to share a small number of physical Postgres connections, and only a server-side pooler makes
that safe against connection exhaustion. Supabase's own docs name transaction-mode Supavisor as
the recommended choice for exactly this shape of workload (verified via `search_docs`, 2026-09-16).

**The risk this reopens, stated plainly, not minimized**: Supabase's own troubleshooting docs
describe the general failure mode of any pooled connection: *"In a pooled environment, the
connection doesn't go away. It goes back into the pool, settings and all, and the next client who
gets it inherits whatever was left behind."* This is the exact mechanism `docs/GUARDRAILS.md` G-C8
calls *"der subtilste Fehler in der gesamten Sicherheitsarchitektur."* Under the container
architecture this plan assumed until 2026-09-16, this risk had a second line of defense (few,
long-lived connections in the app's own pool, direct to Postgres). Under transaction-mode pooling,
that second line is gone — **FR-0.3's single transaction helper and FR-0.4's `SET LOCAL`-only rule
are now the sole defense**, not one of two, exactly as `docs/adr/0006-*.md`'s 2026-09-16 amendment
states.

**Why the sole defense can still hold, and what it depends on**: `SET LOCAL` is transaction-scoped
by Postgres itself — it is discarded automatically at `COMMIT`/`ROLLBACK`, at the exact moment a
transaction-mode pooler reclaims the connection for the next tenant. As long as every request
executes its `SET LOCAL` and its dependent queries inside **one** database transaction, opened and
closed by the **one** transaction helper FR-0.3 requires, the pooler's per-transaction connection
assignment and `SET LOCAL`'s own scoping match up correctly. The risk `docs/adr/0006-*.md` names
is about *accidentally* splitting the `SET LOCAL` and the query across two separate
transactions/connection checkouts (an easy mistake with an ORM that isn't used carefully) — not a
claim that the combination is unsafe when the discipline holds. This is **not yet an empirically
verified claim** for this codebase — it is the reasoning behind why FR-0.3/FR-0.4 are written the
way they are, and it is exactly what the guarded test **G-D10/AC-0.7** (two households, same
physical connection, sequential requests, second sees nothing from the first) exists to prove
before the first real policy is written, not assume.

**New implementation detail surfaced by this decision**: transaction-mode Supavisor does not
support prepared statements. Drizzle's default Postgres driver (`postgres-js`) uses them by
default; this must be disabled (`postgres(connectionString, { prepare: false })`) or writes will
fail unpredictably. This needs an explicit `/speckit-tasks` item — it is a real driver-configuration
detail, not something GUARDRAILS or the F0 requirements packet could have named in advance, since
they predate this specific hosting decision.

**Alternatives considered**:
- *Direct connection (session mode)* — was the confirmed choice for the container architecture
  (2026-09-16, earlier same day); superseded once the app moved to serverless, since a serverless
  runtime cannot sustain a long-lived direct connection under concurrent invocations without
  risking connection exhaustion.
- *Supavisor session-mode pooler* — Supabase's documented fallback *"when connecting from an
  IPv4-only network,"* not needed here since transaction mode is the documented fit for
  serverless/edge specifically.
- *Dedicated PgBouncer pooler* — paid-tier only; not relevant to a free-hosting decision.

## 2. Row-level security policy definition mechanism

**Decision**: Define RLS policies in Drizzle's schema layer using `pgPolicy` (declarative, colocated
with the table definition), not as free-standing raw-SQL migrations maintained separately from the
schema.

**Rationale**: Verified against the current `drizzle-orm` documentation (Context7,
`/drizzle-team/drizzle-orm-docs`, 2026-09-16), not assumed from training data, per `docs/GUARDRAILS.md`
G-J1 ("no library API without verification"):

- `pgPolicy(name, { as, to, for, using, withCheck })` attaches a policy directly to a `pgTable`
  definition.
- Per Drizzle's own docs: *"If you add a policy to a table, RLS will be enabled automatically. So,
  there's no need to explicitly enable RLS when adding policies to a table."* This means FR-0.2
  ("Postgres row-level security active, with at least one policy") is satisfied as a single
  schema-level declaration rather than two separate steps that could drift apart.
- `drizzle-orm/supabase` exports predefined roles (`authenticatedRole`, `serviceRole`) that can be
  referenced in a policy's `to` field, avoiding hand-rolled role names that could typo-mismatch
  Supabase's actual role names.

**Alternatives considered**:
- *Hand-written raw-SQL migrations for policies, schema for tables only* — rejected: splits the
  authorization-relevant part of a table's definition away from the table itself, which is exactly
  the kind of drift `docs/SPEC-INDEX.md` exists to prevent for documentation and applies equally
  well as an engineering principle for schema/policy coupling.

## 3. `Application` state representation

**Decision**: A Postgres native `ENUM` type for `Application.status`, not a `text` column with a
`CHECK` constraint and not a separate lookup table.

**Rationale**: FR-0.12 requires that "no boolean flag shall stand in for a state" and that state
be "one of the declared enum values, not a derived or inferred condition" — a native Postgres enum
makes an invalid state a schema-level impossibility (an insert with an undeclared value is
rejected by Postgres itself), which is a stronger guarantee than an application-level `CHECK`
string comparison and needs no separate join to a lookup table for something that never needs
translation, ordering by an arbitrary table, or per-row metadata.

**Alternatives considered**:
- *`text` + `CHECK (status IN (...))`* — rejected: equivalent enforcement, no benefit over a native
  enum, and Postgres enums are natively supported by Drizzle's `pgEnum`.
- *Separate `application_status` lookup table with a foreign key* — rejected: over-engineering for
  eleven fixed, versioned-in-the-transition-table values with no independent lifecycle of their
  own; would need its own seed migration for no functional gain (YAGNI).

## 4. `ActivityEvent.payload` allowlist enforcement point

**Decision**: Validate the payload shape in the application layer (a schema per `event_type`,
checked before insert), not with a database-level `CHECK` constraint or trigger.

**Rationale**: FR-0.14 requires payload validation against "a positive list of allowed keys per
`event_type`" — this is a single-point-of-entry check (all `ActivityEvent` writes go through one
write path in the `audit` module), unlike authorization, which F0-requirements.md explicitly
requires **twice** (AC-0.6/G-C7) specifically because it must hold even if application code is
wrong. No requirement in F0's scope (FR-0.13–FR-0.15, AC-0.11) asks for a second, database-level
enforcement line for payload shape the way G-C7 explicitly does for visibility invariants — adding
one here would be inventing a requirement rather than citing one, which the constitution's
"cite, don't restate" principle argues against as much as it argues against restating an existing
one.

**Alternatives considered**:
- *Database CHECK constraint or trigger mirroring the app-layer schema* — considered as a
  "defense in depth" analogy to G-C7, but rejected for this slice: not asked for by any FR/AC in
  scope, and duplicating the allowlist in two places (Zod schema + SQL) creates exactly the
  "same rule in two places, now drifted" risk `docs/SPEC-INDEX.md` exists to prevent — unless a
  future ADR or GUARDRAILS revision explicitly extends G-C7's double-enforcement reasoning to
  this rule, single enforcement is the correct match for what was actually specified.
