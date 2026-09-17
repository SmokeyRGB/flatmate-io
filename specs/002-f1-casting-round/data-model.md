# Phase 1 Data Model: F1 — Open a Casting Round

Fields below are quoted from their living, erläuternd source and cited to it — not invented for
this plan (G-J4). The maßgeblich source for the full model is the frozen `docs/04-Domaenenmodell.md`
(field lists) and `docs/03-PRD.md`/`docs/backlog/requirements/F1-requirements.md` (the FR-1.* IDs
themselves); this file lists only what F1's FR groups touch. Classification marks (⚙️ not personal
· 🟠 personal, residents/accounts · 🔴 personal, applicants · ⚫ deliberation content) are from
`docs/domain/personenbezogene-felder.md` and are informational — the actual `data-inventory.yml`
entries are a `/speckit-tasks` item, not produced here.

## Account

Source: `docs/domain/identity.md` §2.1 "`Account` — der Zugang" (erläuternd).

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `email` | `text?` | 🟠 | Required + unique for the household-admin account (FR-1.1); nullable for resident accounts (Research §2's derived synthetic address, never shown to the person) |
| `email_verified_at` | `timestamptz?` | 🟠 | Not required before the first vote; irrelevant for the derived resident-account address, which is never a real mailbox |
| `locale` | `text` | ⚙️ | `de` only in v1 |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | Soft-delete |

Out of F1's scope on this entity: `passkey_enabled`, `last_seen_at` (ADR-007/notifications,
later features). Supabase Auth owns the password hash (ADR-006) — no `password_hash` column here.

## Session

Source: `docs/domain/identity.md` §2.1 "`Session`", as amended by ADR-013.

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `token_hash` | `text` | 🟠 | Hash only — a plaintext session token in the DB is a password equivalent |
| `account_id` | `uuid` | 🟠 | |
| `acting_profile_id` | `uuid?` | 🟠 | **Set once at sign-in, never written again** (ADR-013, FR-1.6). `null` = household-account session |
| `remember_me` | `bool` | ⚙️ | Default `true` |
| `expires_at` | `timestamptz` | ⚙️ | Short (`remember_me=false`) or long (`remember_me=true`, ~90 days) |
| `created_at` | `timestamptz` | ⚙️ | |
| `revoked_at` | `timestamptz?` | ⚙️ | Set on sign-out, and immediately when `ResidentProfile.moved_out_on` is set (V-3) |

**Invariant carried by this entity (G-D14, implemented in this slice):** a session whose account
has `Membership.is_resident = false` has `acting_profile_id = null` at creation and for its entire
lifetime; no write path updates `acting_profile_id` after creation (FR-1.6).

## Household

Source: `docs/domain/identity.md` §2.1 "`Household`".

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `name` | `text` | ⚙️ | |
| `owner_account_id` | `uuid` | ⚙️ | The registering account — "**keine Sicherheitsgrenze**, nur Zuordnung" (C-1.4) |
| `contact_email` | `text` | 🟠 | Distinct field from `Account.email`, out of F1's acceptance criteria but present on the entity per the source — not rendered by any F1 screen |
| `join_code` | `text` | ⚙️ | One code per household, not per person (FR-1.26's "share or rotate") |
| `join_code_rotated_at` | `timestamptz?` | ⚙️ | |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | |

Out of F1's scope on this entity: `privacy_notice_*` (compliance features, later), `join_code_
expires_at`/`join_code_max_uses`/`join_code_uses` (S-49, F2's join flow — F1 only needs a household
to own *a* code for FR-1.26's share/rotate actions, not the join redemption flow itself), 
`entity_label` (fixed `wg` in v1, not user-facing in F1).

## HouseholdSettings

Source: `docs/domain/identity.md` §2.1 "`HouseholdSettings`". 1:1 with `Household`.

| Field | Type | Class | Note |
|---|---|:--:|---|
| `household_id` | `uuid` | ⚙️ | PK + FK |
| `scale_weights` | `jsonb` | ⚙️ | Default `{no: 0, rather_not: 1, good: 3, definitely: 5}` — locked while a round is `open` (FR-1.21) |
| `favorite_budget_factor` | `numeric` | ⚙️ | Default `1.5` — locked while `open` |
| `hide_results_until_voted` | `bool` | ⚙️ | Default `true` — locked while `open` |
| `quorum_share` | `numeric` | ⚙️ | Default `0.5` — locked while `open` |
| `updated_at` / `updated_by_account_id` | `timestamptz` / `uuid` | ⚙️ | Every change is an `ActivityEvent` |

Out of F1's scope: veto/appointment/retention/notification/note fields — none of FR-1.21's four
locked settings, present on the entity for later features.

## ResidentProfile

Source: `docs/domain/identity.md` §2.1 "`ResidentProfile`".

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `display_name` | `text` | 🟠 | Unique among `status != moved_out` profiles within a household (FR-1.4) — also the sign-in identifier for resident accounts (Research §2) |
| `status` | `enum(prepared, active, moved_out)` | ⚙️ | `prepared` = created by the household account, not yet claimed by a Resident-Account sign-up |
| `moved_in_on` | `date?` | 🟠 | |
| `moved_out_on` | `date?` | 🟠 | Sets `status = moved_out` → immediate access revocation (V-3, not exercised until F3+, but the field and status exist from this slice per FR-1.26) |
| `room_id` | `uuid?` | ⚙️ | Currently-occupied room; unset until a later feature actually assigns one (`offer_made → moved_in`) |
| `created_at` | `timestamptz` | ⚙️ | |

**Status transitions** (revised 2026-09-17 — reopen added): `prepared → active` (claimed via
sign-up), `active → moved_out` / `prepared → moved_out` (via FR-1.26's `moved_out`/`removeMember`
resident-list actions, both tiers of U-27's two-tier removal), and `moved_out → active`
(`reactivateMember`, reversing either tier). Declared as an explicit small table per ADR-002, not
encoded as booleans — same discipline as `Application`'s eleven-state machine, just four pairs
over three states.

## Membership

Source: `docs/domain/identity.md` §2.1 "`Membership`".

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `account_id` | `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid?` | ⚙️ | Set = acts as a resident profile; `null` = household account (ADR-013 ties this permanently to the account type) |
| `is_resident` | `bool` | ⚙️ | Voting eligibility. The household account has `false` (FR-1.7) |
| `role` | `enum(household_admin, moderator, member)` | 🟠 | Orthogonal to `is_resident` (C-1.3) — "X is a moderator" is personal data (Art. 4 Nr. 1 DSGVO) |
| `permissions` | `text[]` | 🟠 | Individually grantable (FR-1.8): `create_application`, `change_application_state`, `close_round`, `confirm_appointment`, `manage_rooms`, `manage_members`, `manage_settings` (F1-relevant subset; export/retention permissions are later features) |
| `joined_via_code` | `text?` | ⚙️ | Which `join_code` was used |
| `joined_at` | `timestamptz` | ⚙️ | |
| `revoked_at` | `timestamptz?` | ⚙️ | Set only via `manage_members` |

**Default permission assignment** (spec.md's Assumptions, from `F1-requirements.md` §8's own
recommendation): the household account's own created resident profile holds `close_round`
(round-opening) initially, and it is grantable from there — not a system default applied to every
new member.

## Room

Source: `docs/domain/casting.md` §2.2 "`Room`".

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `label` | `text` | ⚙️ | e.g. "Zimmer 3, hinten links" — renamable at any round state (Clarifications, Session 2026-09-17) |
| `status` | `enum(planned, open, promised, occupied, on_hold, not_available)` | ⚙️ | Six states (FR-1.10), independent of round state (FR-1.11) |
| `current_resident_profile_id` | `uuid?` | 🟠 | Unset until a later feature (`moved_in`) actually populates it |
| `created_at` / `deleted_at` | `timestamptz` / `timestamptz?` | ⚙️ | |

**State transitions relevant to F1** (full table in `docs/domain/zustandsmaschinen.md` §3.3; only
the moderator-driven subset applies without `Application`, which is out of F1's scope):
`— → planned` (`manage_rooms`), `planned → open`, `open → on_hold`, `on_hold → open`,
`{open, on_hold} → not_available` (all `manage_rooms`). The `promised`/`occupied` transitions and
their reverses are driven by `Application.state` changes (F3+) — declared in the same table for
completeness but not reachable by anything F1 builds.

**Room removal** (EC-1.6): refused while a round covering it is `open`; `not_available` is offered
as the alternative. Renaming is unrestricted at any round state and any room state; each rename
produces an `ActivityEvent` (Clarifications, Session 2026-09-17).

## CastingRound

Source: `docs/domain/casting.md` §2.2 "`CastingRound`".

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `title` | `text` | ⚙️ | Visible even to a profile-less session (ADR-014's one accepted exception) |
| `status` | `enum(draft, open, paused, closed, archived)` | ⚙️ | Five states (FR-1.13), deliberately thin (C-1.2) — F1 only exercises `— → draft → open`; `paused`/`closed`/`archived`/reopen are later features' concern but the enum's full value set exists from the first migration, matching F0's precedent of shipping the complete enum even when a slice only exercises part of it |
| `room_ids` | `uuid[]` | ⚙️ | Rooms this round covers (FR-1.12) |
| `settings_snapshot` | `jsonb` | ⚙️ | Copy of `HouseholdSettings`' four locked fields, frozen at `draft → open` (FR-1.15) — a **copy, never a reference** (C-1.1) |
| `opened_at` | `timestamptz?` | ⚙️ | |
| `quorum_denominator_frozen` | `int?` | ⚙️ | Set at `closed`, not exercised in F1 (no `closed` transition in this slice's scope), column present per the source |
| `created_at` | `timestamptz` | ⚙️ | *(not in the cited source table verbatim — added here only as the standard audit timestamp every other F1 entity carries; flagged so a later slice doesn't assume it was quoted from `casting.md`)* |

**Visible to a profile-less session** (ADR-014, Research §3): `id`, `household_id`, `title`,
`status`, `room_ids`, `opened_at`, `closed_at`, `phase_deadline_at`, and the three retention
fields — none of which are `Application`-derived. **Not visible** to a profile-less session: any
value derived from `Application` (there are none on `CastingRound` itself, but this line exists so
a later feature adding a denormalized count here doesn't create one — see G-D15).

**State transitions relevant to F1** (full table in `docs/domain/zustandsmaschinen.md` §3.2):
`— → draft` (`manage_settings`), `draft → open` (`close_round`/`manage_settings`) — freezes
`settings_snapshot`, snapshots `RoundParticipation` from active residents (FR-1.14/FR-1.15/FR-1.16,
atomic). `open → paused`/`paused → open`/`open → closed`/reopen are later features.

## RoundParticipation

Source: `docs/domain/casting.md` §2.2 "`RoundParticipation`". Carries V-2 (round visibility, not
fully implemented until a later feature adds resident-facing round access — F1 only creates and
populates this table); one row per profile per round.

| Field | Type | Class | Note |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` | `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid` | ⚙️ | |
| `source` | `enum(snapshot_at_open, added_manually, joined_after_open)` | ⚙️ | (FR-1.14/FR-1.18). `joined_after_open` (added 2026-09-17) is written by a database trigger (`membership_auto_join_open_rounds`) when a resident becomes active while a round is open — a trigger, not application code, because `identity` may import nothing (kontextgrenzen.md §4) and can't reach into casting-owned tables itself. `added_manually` remains a moderator's manual-correction fallback |
| `can_vote` | `bool` | ⚙️ | Copied from `Membership.is_resident` at creation, then independent (FR-1.17's denominator does not move if role changes later) |
| `added_at` | `timestamptz` | ⚙️ | |
| `removed_at` | `timestamptz?` | ⚙️ | Reversible, audited (P-4) — not exercised by any F1 acceptance scenario, column present per the source |

**Invariant**: the denominator for all participation/quorum displays for a round is `count(p ∈
RoundParticipation WHERE p.round_id = round.id AND p.removed_at IS NULL AND p.can_vote AND
profile(p).status = 'active')` (FR-1.17, `docs/domain/invarianten.md` §5.3) — F1 does not compute
or display a quorum number itself (no vote exists yet to evaluate quorum against), but this is the
table that later features' quorum math reads, so its population must be correct now.

## Session context (cross-cutting, not a table)

Source: `docs/adr/0004-*.md`, `docs/adr/0013-*.md`, `docs/GUARDRAILS.md` G-C8. Extended in this
slice per `research.md` §1: `{account_id, household_id, profile_id: uuid | null}`, set only via the
one transaction helper using `SET LOCAL`, `profile_id` omitted (never set to empty-string) when the
session is a household account's.
