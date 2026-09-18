# Phase 0 Research: F1 — Open a Casting Round

No `NEEDS CLARIFICATION` markers remain in `plan.md`'s Technical Context — the stack is fixed
(ADR-006/ADR-001) and `spec.md`'s one open question (room renaming) was already resolved via
`/speckit-clarify` before this plan. What follows are the implementation-risk questions this
slice's actual new work raises: extending the session context to a nullable third field, mapping
`(household, display_name) + password` sign-in onto Supabase Auth's email-shaped API, and the
`CastingRound` RLS design ADR-014 requires.

## 1. Extending `SessionContext` to a nullable `profileId`

**Decision**: Change `src/db/session-context.ts`'s `SessionContext` from F0's
`{householdId, residentProfileId}` (both mandatory strings) to `{accountId, householdId, profileId:
string | null}`, and rename the Postgres session variable from `app.resident_profile_id` to
`app.profile_id`. Set all three via `SET LOCAL` inside the same one transaction helper; when
`profileId` is `null` (a household-account session per ADR-013), skip the `SET LOCAL
app.profile_id` call entirely rather than setting it to an empty string — `current_setting(...,
true)` already returns `NULL` for an unset variable, which is exactly what `app_profile_id()`
(`docs/domain/invarianten.md` §5.5) expects to distinguish a household-account session.

**Rationale**: `docs/adr/0004-*.md` names the three canonical session variables explicitly —
`app.account_id`, `app.profile_id`, `app.household_id` — and `docs/domain/identity.md`'s `Session`
entity confirms `acting_profile_id` is nullable (`null` = household-account session). F0 never
needed `account_id` (nothing in F0's scope read it) and never needed a null case (F0's tests use
synthetic resident-profile-only fixtures), so `residentProfileId` was mandatory and `account_id`
absent — correct for F0's narrower scope, not for ADR-013/ADR-014's, which this slice must
implement. This is a rename plus a widen, not a redesign: the one-transaction-helper /
`SET LOCAL`-only discipline (FR-0.3/FR-0.4, G-C8) carries over unchanged, and the existing
pool-reuse guarded test (G-D10) needs no new variant — it already proves the mechanism holds
per-transaction regardless of how many variables are set inside it.

**What this does NOT change**: F0's `application_household_isolation` and
`activityevent_household_isolation` RLS policies (`household_id = (select
current_setting('app.household_id', true)::uuid)`) keep working unmodified — they never referenced
`resident_profile_id`. Only call sites that constructed a `SessionContext` need updating (F0 test
fixtures), a `/speckit-tasks` item.

**Alternatives considered**:
- *Keep `residentProfileId` mandatory, add a separate `AdminSessionContext` type for
  profile-less sessions* — rejected: two context shapes flowing through one `withSessionContext`
  helper is exactly the kind of branch ADR-002 argues against (implicit state via which type
  showed up, rather than one explicit nullable field); every RLS policy and every caller would need
  to know which shape it received.
- *Encode `profileId = null` as a sentinel UUID (e.g., all-zeros)* — rejected: a sentinel is a
  fabricated value with no meaning of its own, and `current_setting(..., true)` already gives a
  real `NULL` for free when the variable is never set — using the language's actual null is the
  smaller, more honest mechanism (YAGNI: no sentinel-comparison logic to write or get wrong).

## 2. `(household, display_name) + password` sign-in against Supabase Auth

**Decision**: Supabase Auth's admin/client API is email(-or-phone)-shaped end to end — verified
against current docs (`search_docs`, 2026-09-17): `auth.admin.createUser({ email, password, ... })`
requires `email` (or `phone`), and there is no separate "username" identifier. This confirms
`docs/domain/identity.md`'s already-decided design is the only way to implement a
no-real-email resident account on this stack, not a new choice this plan is making: derive a
**non-deliverable, internally-unique email** from the `ResidentProfile.id` (never from
`display_name`, which is only unique among non-`moved_out` profiles and gets reused after a
move-out) at account-creation time, store nothing extra for it (it's computable from the id), and
resolve the sign-in form's `(household, display_name) + password` to that derived email
server-side before calling `supabase.auth.signInWithPassword({ email: derived, password })`. The
household account keeps its real `email` + password unchanged — Supabase Auth's normal path.

**Rationale**: This is the literal mechanism `docs/domain/identity.md` §2.1 already specifies
("jeder Resident-Account wird deshalb intern auf eine abgeleitete, nicht zustellbare Adresse
abgebildet"); the `search_docs` check exists to confirm the *implementation* of that decision is
possible on the actual installed library version (G-J1: no library API assumed from training
data), not to re-derive the decision itself, which is already `docs/`-authoritative.

**Alternatives considered**:
- *Supabase Auth phone-based identity instead of a derived email* — rejected: phone numbers are
  not collected anywhere in F1's scope (no field for it), and inventing one to satisfy an
  auth-provider requirement would be a fabricated personal-data field (G-J4/G-B1 territory) for no
  functional gain.
- *A separate, hand-rolled credentials table instead of Supabase Auth for resident accounts* —
  rejected: contradicts ADR-006 directly (Supabase Auth is confirmed-tier for **all** accounts,
  not just household accounts), and would reintroduce the exact `password_hash`-storage risk
  ADR-006 removed from the model (`docs/domain/identity.md`'s "warum hier kein `password_hash` mehr
  steht" box).

## 3. `CastingRound` row-level security for a profile-less session (ADR-014)

**Decision**: Two policies on `casting_round`, not one — the household-isolation policy F0's
pattern already establishes (`household_id = current_setting('app.household_id')`, unchanged
shape), **plus** a column-level split: a household-account session (`app.profile_id IS NULL`)
reads a restricted view/column-set (identity + lifecycle fields only), while a resident session
reads the full row subject to V-2 (round participation) once V-2 itself is implemented (out of
F1's scope per `docs/domain/casting.md`/`invarianten.md` — V-2's `RoundParticipation`-based
row-visibility is the natural F1 boundary, but the ADR-014 *column* restriction for the
household-account case is explicitly in F1's scope, since `RoundParticipation` and `CastingRound`
are both F1 entities). Concretely: a Postgres **view** (`casting_round_admin_view`) exposing only
`id, household_id, title, status, room_ids, opened_at, closed_at, phase_deadline_at,
retention_until, retention_extensions, retention_warned_at` is what the `identity`-boundary admin
screens (O17, S-35 enforcement) query against for a profile-less session; the base table remains
RLS-protected the same way for everyone, but the **application-layer policy object** (not RLS
alone, since this is a column restriction, not a row restriction — the same "RLS carries row rules,
policy objects carry the rest" split ADR-004 already makes for V-4) is what a profile-less caller's
repository function is allowed to call at all — it simply has no method that returns
`Application`-derived aggregates in the first place.

**Rationale**: `docs/adr/0004-*.md` already establishes the exact split this needs: RLS enforces
row-level rules (V-1/V-2/V-3), while column/aggregate rules (V-4) live in the policy layer because
"a RLS policy that hides rows from the caller also corrupts the average for them." ADR-014's rule
is a column rule of the same shape — restricting *which fields* a profile-less session may read on
a row it is otherwise allowed to see — so it belongs in the same layer as V-4, not as a second RLS
policy trying to express "yes to this row, but redact these specific columns," which Postgres RLS
cannot express (RLS operates per-row, not per-column). This is what the guarded test G-D15
explicitly requires be checked twice — "über die Policy-Schicht **und** direkt gegen die Datenbank
unter der Anwendungsrolle" — meaning the raw-SQL half of G-D15 must query the **base table**
directly (not the admin view) and confirm the derived-value columns it could theoretically read
still resolve to nothing when no `Application` rows exist to derive them from for that
household/round — i.e., the guarantee for the raw-SQL path is "no row exists anywhere that stores a
computed aggregate," not "the view hides it," since a view is exactly the kind of layer G-C7 warns
is not itself a defense against direct base-table access.

**Alternatives considered**:
- *A second RLS policy with a `CASE`-masked column set* — rejected: Postgres RLS `USING`/`WITH
  CHECK` clauses gate whole rows, not per-column visibility; simulating column masking through RLS
  would need either a security-barrier view (adds the exact indirection layer being considered
  anyway) or per-column functions wrapping every read, which is more mechanism for the same
  guarantee.
- *Give the household account a `RoundParticipation`-like marker so it "sees" only identity fields
  by construction* — rejected: this reintroduces the option ADR-014 itself already considered and
  rejected ("dem Haushalts-Account ein `ResidentProfile` geben") — it would grant voting identity by
  the back door.
