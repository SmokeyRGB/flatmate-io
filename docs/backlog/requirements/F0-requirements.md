# F0 — The substrate · requirements

> **Feature:** [Feature 0 — the substrate, which is not optional](../MVP%20Backlog%20Features/README.md#feature-0--the-substrate-which-is-not-optional)
> **Band:** `v0.1` · **Scope lines:** S-15, S-27, S-36, S-37
> **Screens:** none — this packet is substrate, not a user-facing feature (see §2)
> **Status:** V1.0 · 2026-09-09
>
> **This document is `requirements.md` only — what must be built, not how.** Architecture,
> schema shape and implementation order are out of scope for this exercise (`design.md` /
> `tasks.md`). Where an existing decision constrains behaviour it appears under
> **Constraints** with its source, not as a design instruction.

---

## 1. Scope

Four scope lines that never appear in a demo and never get their own screen, but that every
query in the system runs through: authorization enforced twice, a data inventory that gates the
build, an explicit state machine for `Application`, and an append-only event log. The MVP
Backlog README states why they sit here and not later:

> *"Beide bestimmen jede Abfrage im System. Nachträglich eingezogen müsste jede bestehende
> Abfrage angefasst werden — und bei AI-gestützter Implementierung ist genau das der Weg, auf
> dem eine vergessene Bedingung zum Datenleck wird."*

The same README names the cost of waiting for each of the four individually: retrofitting
authorization means touching every existing query; retrofitting the state machine means
migrating boolean flags to states; retrofitting the data inventory means running a CI gate
against a schema that is already full of undeclared columns; and the audited backward
transitions that S-15 requires have nowhere to be recorded without the append-only log that
S-27 provides.

**In scope:** authorization enforced through central policy objects **and** Postgres row-level
security, and the single transaction helper that sets the session context RLS reads · the
`data-inventory.yml` machine-readable record of every personal-data field, enforced as a CI
gate, with the redaction/export/deletion lists it generates · the complete eleven-state
`Application` transition table, declared from the first migration, with backward transitions
permitted and audited · the append-only `ActivityEvent` log, its per-`event_type` payload
allowlist, and its redaction at end of retention.

**Out of scope:** the activity feed **user interface** — the log itself is v0.1, the screen is
v0.2 · the self-redaction visibility invariant over `Application.became_resident_id` (S-31) —
a related but distinct scope line, already carried as a constraint in `F1-requirements.md` ·
retention **automation** and its 14-day warning (S-33's automatic half, gated into v0.2) ·
screening, voting, scheduling or any of the mechanics F1–F5 build on top of this substrate —
this packet is what those five features stand on, not a sixth feature beside them.

---

## 2. Why this packet has no user stories

These four scope lines are not user-facing requirements. As the MVP Backlog README states
plainly, *"These are not user stories and nobody would put them in a pitch."* Nobody logs in to
use central policy objects, a data inventory gate, a state-transition table or an audit log —
they are the ground the five real features stand on, not something a resident or a moderator
asks for. Writing user stories for them anyway would invent a persona and a job-to-be-done that
do not exist, and would misrepresent this packet as a feature when it is infrastructure.

---

## 3. Functional requirements

### Authorisation, enforced twice (S-36)

- **FR-0.1** The system shall enforce authorization through central policy objects, independently
  of the client — no data access to personal tables from a route, server component or job handler
  may bypass them.
- **FR-0.2** The system shall have Postgres row-level security active, with at least one policy,
  on every table carrying a `household_id`.
- **FR-0.3** The session context that row-level security reads (the active `household_id` and
  `resident_profile_id`) shall be set through exactly one transaction helper, and through no other
  code path.
- **FR-0.4** A `SET` of the session context without `LOCAL` shall be rejected by lint. A value set
  without `LOCAL` survives on the pooled connection past the end of the transaction and is
  inherited by whichever request the connection serves next — the guardrail's own description of
  the failure is that *"Anfrage B erbt den Haushaltskontext von Anfrage A"*, and RLS then applies
  correctly, but to the wrong household.

### Data inventory as a build gate (S-37)

- **FR-0.5** The system shall have every personal-data field declared in `data-inventory.yml`
  with its purpose, legal basis, retention period and privacy category.
- **FR-0.6** CI shall fail when a database column capable of holding personal data is not
  declared in `data-inventory.yml` — either with a full declaration or an explicit
  `personal_data: false` marker; there is no silent third option.
- **FR-0.7** The list of fields redacted at end of retention shall be **generated** from
  `data-inventory.yml`, never hand-maintained, so that a newly declared personal-data field
  extends the redaction automatically and cannot be forgotten.
- **FR-0.8** The four privacy classes 🔴 (personal data about applicants), 🟠 (personal data about
  residents/accounts), ⚫ (personal data that is also deliberation content about a person) and ⚙️
  (not personal data) shall be the declared categories that `data-inventory.yml` uses.

### Explicit state machine (S-15)

- **FR-0.9** All eleven `Application` states — the seven main-path states plus the four side
  states — shall exist from the first migration, even though the v0.1 slice's application code
  only reaches `invited`.
- **FR-0.10** Only the transitions declared in the transition table of `03-PRD.md` §4.2.1 shall
  be permitted; an undeclared transition shall throw rather than silently fail or fall through to
  an unknown state.
- **FR-0.11** Backward transitions shall be permitted, and every backward transition shall
  produce an `ActivityEvent` recording the originating and target state.
- **FR-0.12** No boolean flag shall stand in for a state; every state that governs behaviour
  shall be one of the declared enum values, not a derived or inferred condition.

### Append-only audit log (S-27)

- **FR-0.13** `ActivityEvent` shall be append-only: entries shall never be updated or deleted,
  except by the deletion concept acting on the entries' referenced data.
- **FR-0.14** The `payload` of an `ActivityEvent` shall be validated against a positive list of
  allowed keys per `event_type`; a deliberation event may carry only references and counters, and
  a write containing a free-text value or a bare value key shall be rejected.
- **FR-0.15** v0.1 shall ship the append-only log only. The activity feed user interface is out
  of scope for v0.1 and lands in v0.2.

---

## 4. Acceptance criteria

`GUARDRAILS.md`'s "Minimal-Gate für den ersten Commit" lists **nine** items. Each becomes one
`AC-0.x` below, in the same order.

**AC-0.1 — Secrets never enter the repository**
Given a commit containing a secret-shaped string, when CI runs secret scanning, then the build
fails before merge; given a local `.env*` file, when the repository's `.gitignore` is applied,
then the file is not trackable by git.
Source: `GUARDRAILS.md`, Minimal-Gate item 1 (G-A1, G-A2).

**AC-0.2 — `any` and disable-comments are rejected before merge**
Given TypeScript configured in `strict` mode, when a change introduces `as any`,
`@ts-expect-error` or an `eslint-disable` in the policy, repository or domain layer, then lint
fails and the merge is blocked.
Source: `GUARDRAILS.md`, Minimal-Gate item 2 (G-C4, G-J2).

**AC-0.3 — CODEOWNERS guards the sensitive paths**
Given `CODEOWNERS`, when a pull request touches configuration, CI workflows, `GUARDRAILS.md`,
`data-inventory.yml`, `test/guarded.manifest.json`, the migrations directory, or the Solver
adapter, then review from the designated owners is required before merge.
Source: `GUARDRAILS.md`, Minimal-Gate item 3 (G-G3, G-D, G-E1, G-K1).

**AC-0.4 — An undeclared personal-data column breaks the build, before the first table**
Given a new database column capable of holding personal data, when it is not declared in
`data-inventory.yml` with purpose, legal basis, retention and category (and not explicitly
marked `personal_data: false`), then the build fails.
Source: `GUARDRAILS.md`, Minimal-Gate item 4 (G-F1).

**AC-0.5 — RLS is proven positively on every household-scoped table, before the first table**
Given every table carrying a `household_id`, when the RLS positive-test runs, then it asserts
that row-level security is enabled and at least one policy exists for that table; a new such
table without RLS fails the build without anyone needing to remember to check.
Source: `GUARDRAILS.md`, Minimal-Gate item 5 (G-C2, G-C5).

**AC-0.6 — The visibility invariant is proven twice, or it is "an illusion"**
Given `test/guarded.manifest.json` and its thirteen G-D invariants, when a visibility-invariant
test is registered, then it exists as **two** entries — one exercised through the policy layer,
one as raw SQL against the same tables under the application role with the session context set,
bypassing the policy layer entirely — and both must return empty. A test that checks only the
policy path does not satisfy this: per `GUARDRAILS.md` **G-C7**, *"sonst ist ADR-004 eine
Illusion"* — the second line of defence would be untested, and nobody would notice, because the
first path already catches the check.
Source: `GUARDRAILS.md`, Minimal-Gate item 6 (G-C7).

**AC-0.7 — Two households share one pooled connection without leaking context**
Given two requests from different households, when they run sequentially over the same physical
database connection, and the session context is set only via `SET LOCAL` inside the transaction
helper (never bare `SET`, never outside a transaction), then the second request sees nothing set
by the first. This is the guarded test G-D10, and it lands before the first policy is written,
not after.
Source: `GUARDRAILS.md`, Minimal-Gate item 7 (G-C8, G-D10).

**AC-0.8 — Import-boundary lint enforces the six bounded contexts**
Given the six bounded contexts `identity`, `casting`, `deliberation`, `scheduling`,
`notifications` and `audit`, when a module imports across a context boundary other than through a
declared public interface or a domain event, then the import-boundary lint fails the build, with
no per-instance exception.
Source: `GUARDRAILS.md`, Minimal-Gate item 8 (G-I1).

**AC-0.9 — Dependencies are locked, licensed and version-checked**
Given the project's lockfile, when dependencies are installed in CI or production, then
installation runs reproducibly from the lockfile only; given a new dependency, when it is added,
then its license is checked against an allow-list and its version is pinned rather than `latest`
or an open range.
Source: `GUARDRAILS.md`, Minimal-Gate item 9 (G-H2, G-H3, G-H4).

**AC-0.10 — The transition table is complete and closed, and reverse moves are audited**
Given the `Application` state machine, when the schema is first migrated, then all **eleven**
states exist; and when a transition is attempted, then it succeeds only if it is a row in the
table of `03-PRD.md` §4.2.1 and throws otherwise — with no silent fallthrough and no "unknown
state" branch; and when a permitted **backward** transition runs, then an `ActivityEvent` records
it, naming the account and the acting profile. No boolean field anywhere may stand in for a
state.
Source: S-15, `03-PRD.md` §4.2.1, `05-ADRs.md` ADR-002. Covers FR-0.9 to FR-0.12.

**AC-0.11 — The audit log cannot be rewritten**
Given an existing `ActivityEvent`, when an `UPDATE` or a `DELETE` is attempted — through the
application, through a migration, or in raw SQL — then it fails; and given a redaction at the end
of a retention period, when it runs, then the event row survives with its 🔴/⚫ payload fields set
to `null` rather than being removed, so the fact of the event remains provable after its content
is gone.
Source: S-27, `05-ADRs.md` ADR-003, `GUARDRAILS.md` G-D7 and G-D8. Covers FR-0.13 to FR-0.15.

> **Why these two are not Minimal-Gate items.** `AC-0.1` to `AC-0.9` are the nine items of
> `GUARDRAILS.md`'s Minimal-Gate, in its order. None of the nine tests the state machine's own
> rules or the audit log's immutability — the gate is about *infrastructure being in place*, not
> about these two behaving. `AC-0.10` and `AC-0.11` close that gap, so that every functional
> requirement in §3 has an acceptance criterion above it.

---

## 5. Constraints

- **C-0.1** The nine Minimal-Gate items are ordered, not a bag: the `data-inventory.yml` gate
  (item 4) and the RLS positive-test (item 5) must land **before** the first table exists; the
  transaction-helper/lint pairing for the session context (item 7) must land **before** the first
  policy is written. Source: `GUARDRAILS.md`, "Minimal-Gate für den ersten Commit".
- **C-0.2** A protected test in `test/guarded.manifest.json` may only be weakened with CODEOWNERS
  approval on that test path — "assertion loosened" is not machine-distinguishable from
  "assertion corrected," so the check is a review requirement, not an automated one. Source:
  `GUARDRAILS.md` **G-D** (enforcement table row "Geschützte Tests (inhaltliche Abschwächung)").
- **C-0.3** Row-level security is enforced structurally, not by convention: the application's
  database role is never the owner of the tables it queries. Source: `GUARDRAILS.md` **G-C2**.
- **C-0.4** A column declared `personal_data: false` in `data-inventory.yml` satisfies the CI
  gate structurally; the gate cannot verify that the classification is actually correct — a
  named 🟡 limit, not a gap to silently close. Source: `GUARDRAILS.md` **G-F1**.
- **C-0.5** The redaction, error-report-exclusion, subject-access-export and end-of-retention
  deletion lists are all generated from `data-inventory.yml`, never hand-maintained; a test
  confirms the generated artefacts are current (empty diff on regeneration). Source:
  `GUARDRAILS.md` **G-F2**, `ADR-010`.
- **C-0.6** Documents are written in German, identifiers in English. Source: `ADR-012`. (These
  exercise deliverables are English by the Exercise 10 precedent; `ADR-012` records that
  exception formally.)

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| **EC-0.1** | A new table carries `household_id` but ships without an RLS policy | The RLS positive-test fails the build; no such table reaches a green CI run |
| **EC-0.2** | A migration contains `DISABLE ROW LEVEL SECURITY` | The CI check over all migrations catches the string; the build breaks |
| **EC-0.3** | A visibility-invariant test exists only against the policy layer, with no raw-SQL counterpart | The manifest check fails: the invariant is registered as unverified, not as passing |
| **EC-0.4** | A new personal-data column is declared `personal_data: false` incorrectly | The gate accepts the declaration structurally; correctness is a review question, not a build failure (C-0.4) |
| **EC-0.5** | An `ActivityEvent` write attempts a payload like `{value: "no"}` or a free-text field | Rejected by the per-`event_type` positive-list validation; only references and counters are accepted |
| **EC-0.6** | An `Application`'s retention period ends while its `ActivityEvent`s still reference it | Payload fields classed 🔴/⚫ become `null`; structure, timestamps and the who/when/what-kind-of-action chain remain readable |
| **EC-0.7** | An `Application` transition is attempted that is not a row in the transition table | It throws — no silent fallthrough, no "unknown state" |
| **EC-0.8** | An `archived` `Application`'s underlying data has since been deleted | The reverse transition back to its previous state is not available — deliberate, not an oversight |
| **EC-0.9** | Two requests from different households are served back-to-back on the same pooled connection | The second sees nothing set by the first, proven by the guarded pool-reuse test, not by inspection |

---

## 7. Risks & assumptions

### Assumptions

- **A-0.1** This packet's four scope lines are built before any of F1–F5's application code
  depends on them — the MVP Backlog README frames them as "not optional," not as parallel work.
- **A-0.2** Concrete tool choices (test runner, the lint plugin for module boundaries, the secret
  scanner, the license checker, the license allow-list itself) are explicitly marked `⚠️ TBD` in
  `GUARDRAILS.md` and are a repo-setup decision, not a requirement this packet resolves.
- **A-0.3** The eleven-state `Application` transition table is built in full even though the v0.1
  slice's application code only reaches `invited` — declaring the remaining states now costs
  little; migrating flags to states after the fact costs a lot.

### Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R-0.1** | Row-level security is "temporarily" disabled to get a test green | Removes the one defence that still holds when application code is wrong | C-0.3's structural enforcement (app role never owns the tables) plus the CI check on `DISABLE ROW LEVEL SECURITY` |
| **R-0.2** | A visibility-invariant test is written only against the policy layer | The RLS defence goes untested and could silently stop working | AC-0.6's two-entry manifest requirement (G-C7) |
| **R-0.3** | Session context is set with `SET` instead of `SET LOCAL` | A pooled connection leaks one household's context into the next request, worst under load, with the symptom "someone else's applications in my household" | FR-0.4's lint rejection, the CI string check, and the guarded pool-reuse test G-D10 (AC-0.7) |
| **R-0.4** | `data-inventory.yml` is introduced after the schema already has undeclared columns | Exactly what `04-Domaenenmodell.md` §9 records happening three times already | FR-0.6 as a Minimal-Gate item, required before the first table (C-0.1) |
| **R-0.5** | A protected test in `test/guarded.manifest.json` is weakened to make CI pass | Indistinguishable, by tooling, from a legitimate correction | C-0.2's CODEOWNERS review requirement on every guarded test path |

---

## 8. Review

**Still MVP-sized?** Yes, and more firmly than any of F1–F5: nothing here is a feature that could
be trimmed, because none of it is a feature. The MVP Backlog README is explicit that retrofitting
any of these four costs more than building them first — touching every existing query for S-36,
migrating flags to states for S-15, hitting an already-drifted schema for S-37. This packet is
the one place where "build it now" is cheaper than "build it later," not a matter of taste.

**Anything unclear or missing?** One item, deliberately left open rather than invented: FR-0.7
(the generated redaction list) is sourced by combining two related passages — `04-Domaenenmodell.md`
§2.5's rule that `ActivityEvent` payload fields classed 🔴/⚫ are redacted at end of retention, and
`GUARDRAILS.md` **G-F2**'s rule that the deletion/redaction lists derived from `data-inventory.yml`
are generated, never hand-maintained. No single passage states the two together for
`ActivityEvent` specifically; the requirement is a traceable synthesis of both, not an invention,
but it is worth a reviewer's second look rather than treating it as verbatim.

**Too complex?** No — every item is a declared table or a build gate, which is the opposite of
complex once it exists; the cost is entirely in building it before instead of after. If anything
here risks over-reach it is the temptation to pull the Minimal-Gate's tool-selection questions
(test runner, lint plugin, secret scanner, license checker) into this document — `GUARDRAILS.md`
already marks that choice `⚠️ TBD` and scopes it to repo setup, and this packet does not pull that
decision forward.
