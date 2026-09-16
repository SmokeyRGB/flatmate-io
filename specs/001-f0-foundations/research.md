# Phase 0 Research: F0 — The Substrate

No `NEEDS CLARIFICATION` markers remain in `plan.md`'s Technical Context — the stack is fixed by
ADR-006/ADR-001 and this feature has no genuinely open technology choice. What follows are the
implementation-risk questions worth resolving with verified facts before design, not stack
decisions.

## 1. Connection mode and its interaction with `SET LOCAL`

**Decision**: **Direct connection to Postgres** (port 5432, session-scoped) — not a
Supavisor/PgBouncer transaction-mode pooler. This is a confirmed-tier consequence of two ADRs,
not a choice this plan is free to make:

- `docs/adr/0006-*.md` row "Datenbankverbindung" states it explicitly: *"Direkte Verbindung
  (Session-Modus), nicht der Transaktions-Pooler. Der Sitzungskontext aus ADR-004 wird per `SET
  LOCAL` gesetzt. Wer versehentlich über den Transaktions-Pooler verbindet, verschiebt die
  Lebensdauer dieses Kontexts — und ein Sitzungskontext, der nicht zur Anweisung passt, ist ein
  **stiller** RLS-Fehler, kein lauter."*
- `docs/adr/0006-*.md`'s "Entscheidung" section: *"Kein Serverless folgt aus ADR-005 (ohne
  Kindprozess kein lokaler Solver)."* — the app is a long-running Docker container (app + Python
  solver in one image, per the "Auslieferung" row), not a serverless/edge deployment. An earlier
  draft of this research file wrongly assumed a serverless target and picked the transaction-mode
  pooler that goes with it; corrected here after checking ADR-006 directly instead of defaulting.

**Rationale**: The Docker-container deployment matches Supabase's own stated use case for a
direct connection — *"ideal for persistent servers, such as virtual machines (VMs) and
long-lasting containers"* (verified via `search_docs`, 2026-09-16) — and direct/session-mode
connections support prepared statements normally, so no driver workaround is needed (unlike
transaction-mode pooling, which disables them).

This does **not** make FR-0.3/FR-0.4's `SET LOCAL` discipline any less load-bearing. A
long-running container still needs many concurrent requests to share a small number of physical
Postgres connections for performance — that reuse happens one layer up, in the **app's own
internal connection pool** (the Postgres client library's pool, e.g. `postgres-js`'s), not in a
Supabase-side pooler. Supabase's own troubleshooting docs describe the identical failure mode in
general terms, independent of which layer does the pooling: *"In a pooled environment, the
connection doesn't go away. It goes back into the pool, settings and all, and the next client who
gets it inherits whatever was left behind."* Two different households' requests can still land on
the same physical connection sequentially through the app's own pool — which is exactly the
scenario FR-0.3's single transaction helper and FR-0.4's `SET LOCAL`-only rule exist to make safe
regardless of which pooling layer is doing the reuse.

**Alternatives considered**:
- *Supavisor transaction-mode pooler* — rejected: directly ruled out by `docs/adr/0006-*.md`'s
  "Datenbankverbindung" row, for exactly the `SET LOCAL` lifetime reason above.
- *Supavisor session-mode pooler* — not rejected outright, but not the default: Supabase
  recommends it as *"an alternative to a Direct Connection when connecting from an IPv4-only
  network."* If the chosen hosting turns out to be IPv4-only and lacks the IPv4 add-on, this is
  the documented fallback with the same session-scoped behavior as a direct connection — a
  `/speckit-tasks` decision at deploy time, not a plan-level one.
- *Dedicated PgBouncer pooler* — not applicable: transaction-mode only, so it inherits the same
  rejection as the Supavisor transaction-mode pooler above.

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
