# Phase 0 Research: F0 — The Substrate

No `NEEDS CLARIFICATION` markers remain in `plan.md`'s Technical Context — the stack is fixed by
ADR-006/ADR-001 and this feature has no genuinely open technology choice. What follows are the
implementation-risk questions worth resolving with verified facts before design, not stack
decisions.

## 1. Connection pooling mode and its interaction with `SET LOCAL`

**Decision**: Connect through Supabase's Supavisor pooler in **transaction mode** (port 6543),
with prepared statements disabled on the Postgres client (`postgres(connectionString, { prepare: false })`
for the `postgres-js` driver Drizzle uses).

**Rationale**: Verified directly against Supabase's own documentation (`search_docs`,
2026-09-16), not assumed:

- Supabase names transaction-mode Supavisor as the recommended choice for "serverless or edge
  functions" — matches this project's target platform (Next.js on a serverless/edge runtime).
- Supabase's own troubleshooting docs describe *exactly* the failure GUARDRAILS.md G-C8 warns
  about, independently, as a real and documented behavior: *"If a client changes a session-level
  setting, that setting 'sticks' to the backend connection. When that backend connection is
  returned to the pool, the next client to use it inherits that exact state."* This is not a
  hypothetical risk invented for this project — it is the documented default behavior of the
  pooler this project will actually run on. It directly confirms why FR-0.3/FR-0.4 require the
  session context to be set via `SET LOCAL` inside a transaction (transaction-scoped, discarded
  automatically) and never via bare `SET` (connection-scoped, leaks to the next tenant).
- New risk surfaced by this research, not previously named in `docs/`: **transaction-mode
  Supavisor does not support prepared statements.** Drizzle's default Postgres driver
  (`postgres-js`) uses prepared statements by default, which would produce runtime errors under
  this pooling mode unless explicitly disabled. This is a real implementation detail that
  `/speckit-tasks` needs a task for; it does not currently appear in `docs/GUARDRAILS.md` or the
  F0 requirements packet, which predate a specific driver/pooling choice.

**Alternatives considered**:
- *Direct connection (port 5432, no pooler)* — rejected: not viable for a serverless/edge
  runtime, which opens and closes many short-lived connections; direct connections are meant for
  persistent backends (VMs, long-running containers).
- *Supavisor session mode (port 5432)* — rejected: designed for persistent clients on IPv4-only
  networks; it doesn't recycle connections between unrelated requests the way transaction mode
  does, so it doesn't match a serverless/edge deployment shape and would not exercise (or need)
  the leak this project is specifically guarding against, making G-C8's own justification for the
  transaction helper harder to verify under test.
- *Dedicated PgBouncer pooler* — rejected for now: paid-tier only; a reasoned upgrade for later if
  performance requires it, not a v0.1/F0 decision.

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
