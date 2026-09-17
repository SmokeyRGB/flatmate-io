# Phase 1 Data Model: F0 — The Substrate

Fields below are quoted from their living, erläuternd source and cited to it — not invented for
this plan. The maßgeblich source for the full model (all fields, including those outside F0's
scope) is the frozen `docs/04-Domaenenmodell.md`; this file only lists what F0's three FR groups
(authorization, state machine, audit log) actually touch, per `docs/SPEC-INDEX.md`'s "cite, don't
restate" discipline. Do not add a field here that isn't already named in a cited source — an
invented field is exactly what G-J4 (`docs/GUARDRAILS.md`) forbids.

## Application

Source: `docs/domain/casting.md` §2.2 "`Application` — die Bewerbung" (erläuternd); the eleven
enum values themselves are maßgeblich only in `docs/03-PRD.md` §4.2.1 and are **not reproduced
here** — this plan does not need to know each value's name to build the state-transition
mechanism generically against that table.

Fields relevant to F0 (authorization + state integrity), quoted from the source above:

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | |
| `household_id` | `uuid` | "Anker der RLS-Policy (ADR-004)" — the field FR-0.2's RLS policy is written against |
| `round_id` | `uuid` | |
| `state` | `enum(...)` | "§3.1, elf Werte" — full value list is `03-PRD.md` §4.2.1, not restated |
| `state_changed_at` | `timestamptz` | |
| `became_resident_id` | `uuid?` | Governs V-1 self-redaction; out of this slice's FR scope (F1) but the column exists from the first migration per FR-0.9 |
| `created_by_account_id` | `uuid` | |
| `created_by_profile_id` | `uuid` | `NOT NULL` |
| `retention_until` | `date` | Default `created_at + 180 Tage` — `docs/domain/casting.md` §7 / line 124; anchor for the redaction path FR-0.13 requires |
| `created_at` / `deleted_at` | `timestamptz` / `timestamptz?` | |

Fields that exist on the full entity (`applicant_name`, `contact_email`, `message_raw`, etc.) are
personal-data fields belonging to F1–F5's scope, not F0's — they are not listed here because F0's
FRs (0.1–0.4, 0.9–0.12) don't touch them; see `docs/domain/casting.md` §2.2 for the complete row
set when a later slice needs it.

**State transitions**: only rows declared in `docs/03-PRD.md` §4.2.1's transition table are
permitted (FR-0.10); an attempted transition outside that table throws (EC-0.7). Backward
transitions are permitted and each one produces exactly one `ActivityEvent` (FR-0.11). No
derived/boolean field may substitute for `state` (FR-0.12) — `state` is the only source of truth
for where an `Application` is in its lifecycle.

## ActivityEvent

Source: `docs/domain/audit-und-notifications.md` §"`ActivityEvent` — das Ereignis-Log"
(erläuternd; maßgeblich source for the append-only rule itself is `docs/adr/0003-*.md`).

Fields relevant to F0 (audit log immutability + payload allowlist):

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | |
| `household_id` | `uuid` | "RLS-Anker" |
| `round_id` | `uuid?` | |
| `event_type` | `text` | e.g. `application.state_changed`, `vote.cast`, `settings.changed` — determines which payload keys are allowed (FR-0.14) |
| `subject_type` / `subject_id` | `text` / `uuid` | what the event is about |
| `actor_account_id` | `uuid?` | `null` for system events (retention automation) |
| `actor_profile_id` | `uuid?` | `null` = acted by a household account, never a fabricated name |
| `payload` | `jsonb` | Validated against the per-`event_type` positive-list (FR-0.14); redacted (`null`'d) fields at end of retention keep the row's other fields readable (FR-0.13, AC-0.11) |
| `occurred_at` | `timestamptz` | |
| `correlation_id` | `uuid?` | groups events from one action |
| `reverses_event_id` | `uuid?` | backward transitions/undo reference the event they reverse (P-4) — this is how FR-0.11's backward-transition event links to what it reversed |

**Invariants**: append-only — no `UPDATE`/`DELETE` except the retention-redaction path (FR-0.13).
Payload keys are validated per `event_type` against a positive list; a write with a free-text
value or a bare `value` key is rejected (FR-0.14, EC-0.5). v0.1 ships the log only, no UI
(FR-0.15).

## Session context (cross-cutting, not a table)

Source: `docs/GUARDRAILS.md` G-C8, `docs/adr/0004-*.md`. Not an entity — the two session
variables row-level security reads: the active `household_id` and `resident_profile_id`.
Set **only** via the single transaction helper (FR-0.3) using `SET LOCAL` inside an open
transaction, never bare `SET`, never outside a transaction, never in a connection-setup hook
(FR-0.4). See `research.md` §1 for why this is load-bearing under this project's actual
connection-pooling mode, not a theoretical concern.
