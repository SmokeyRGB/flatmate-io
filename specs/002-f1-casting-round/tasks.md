# Tasks: F1 — Open a Casting Round

**Input**: Design documents from `specs/002-f1-casting-round/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included. Not optional here — same reason as F0: `docs/GUARDRAILS.md` G-D's own
enforcement (`test/guarded.manifest.json`, CI existence-check) requires guarded tests G-D14/G-D15
to exist from the same commit as the behavior they protect, and G-C7 requires every new
`household_id`-carrying table to be tested twice (policy layer + raw SQL).

**Organization**: by user story, per `spec.md`'s four priorities (P1 identity/registration, P2
rooms, P3 casting round + procedure lock, P4 resident list + administration boundary).

**Scope discipline**: only FR-1.1–FR-1.30 (per `spec.md`). No task here touches `Application`'s
personal-data fields, votes, vetoes, notes, appointments, or slots (F3–F5) — `RoundParticipation`
is created and populated by this feature but no quorum percentage or vote count is computed or
displayed (there is nothing to vote on yet).

**A documentation-drift finding recorded in `plan.md`'s Constitution Check does not block any task
below**: `spec.md`'s literal `FR-1.23` quote is stale relative to `docs/adr/0014-*.md`, but
`02-SRD.md`'s own `S-50` text (the actual maßgeblich source, already amended 2026-09-14) is
current — every task below implements the current, correct boundary (ADR-014's table), not the
stale FR wording. A separate, parallel effort is syncing the backlog packet's wording; no task here
depends on that landing first.

## Phase 1: Setup

- [X] T001 Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.example` (empty/placeholder value, per G-A2)
      with a comment: server-only, used by `src/modules/identity/auth.ts`'s admin API calls
      (`auth.admin.createUser`, Research §2) — **never** imported into a client component or
      exposed via `NEXT_PUBLIC_*`, unlike `NEXT_PUBLIC_SUPABASE_ANON_KEY` already in this file.
- [X] T002 [P] Add a route group scaffold: `src/app/(auth)/` and `src/app/(org)/` empty layout
      files, per `plan.md`'s Project Structure — no page content yet, just the route groups so
      later tasks have somewhere to add pages.

## Phase 2: Foundational (blocking prerequisites for all four user stories)

**⚠️ CRITICAL**: No user story task may begin until this phase is complete.

- [X] T003 Extend `SessionContext` in `src/db/session-context.ts` from F0's
      `{ householdId: string; residentProfileId: string }` to
      `{ accountId: string; householdId: string; profileId: string | null }` (`research.md` §1,
      ADR-013/ADR-004). Rename the Postgres session variable from `app.resident_profile_id` to
      `app.profile_id` (matching `docs/adr/0004-*.md`'s canonical name). Set `app.account_id` and
      `app.household_id` unconditionally via `SET LOCAL`; set `app.profile_id` via `SET LOCAL` only
      when `profileId !== null` — never set it to an empty string, so `current_setting(...,
      true)` returns real SQL `NULL` for a household-account session, matching what
      `docs/domain/invarianten.md` §5.5's `app_profile_id()` expects. Validate all three as UUIDs
      before interpolation (same `assertUuid` pattern F0 already uses), skipping the check for
      `profileId` when it's `null`.
- [X] T004 Update every existing call site of `withSessionContext(...)` built with F0's old
      `{ householdId, residentProfileId }` shape to the new shape from T003, setting `accountId` to
      a freshly generated UUID and `profileId` to the old `residentProfileId` value (these are test
      fixtures standing in for a resident session, so `profileId` stays non-null): `tests/
      integration/policy/household-scoping.test.ts`, `tests/integration/raw-sql/
      household-scoping.test.ts`, `tests/integration/policy/activityevent-scoping.test.ts`, `tests/
      integration/raw-sql/activityevent-scoping.test.ts`, `tests/integration/raw-sql/
      pool-reuse.test.ts`, `tests/integration/policy/table-ownership.test.ts`. Run `vitest run` and
      confirm all pre-existing F0 tests still pass unchanged in behavior.
- [X] T005 [P] Create the `identity` module's schema file `src/modules/identity/schema.ts` with
      `Account` (`data-model.md` "Account"): `id` (`uuid`, PK), `household_id` (`uuid`, `NOT NULL`)
      — **denormalized, not in `docs/domain/identity.md`'s field list**, added here under the same
      documented pattern `docs/domain/casting.md` already uses for `Application.household_id`
      ("redundant zur Runde, aber Anker der RLS-Policy (ADR-004)") — known at creation time in both
      the registration flow (US1: household is created in the same transaction) and the join flow
      (out of F1's scope, F2), so `NOT NULL` is satisfiable without a chicken-and-egg problem
      (G-C5: "jede personenbezogene Tabelle führt household_id NOT NULL"), `email` (`text`,
      nullable — required+unique for the household-admin account per FR-1.1, nullable for a
      resident account's derived address, Research §2), `email_verified_at` (`timestamptz`,
      nullable), `locale` (`text`, default `"de"`), `created_at` (`timestamptz`, default now),
      `deleted_at` (`timestamptz`, nullable). Add the household-isolation `pgPolicy` (same
      `household_id = (select current_setting('app.household_id', true)::uuid)` shape F0's
      `Application`/`ActivityEvent` policies already use) and an index on `household_id`.
- [X] T006 [P] In the same file, add `Session` (`data-model.md` "Session"): `id` (`uuid`, PK),
      `household_id` (`uuid`, `NOT NULL` — same denormalization rationale as T005's `Account`,
      copied from the owning `Account` at creation), `token_hash` (`text`, `NOT NULL` — hash only,
      per G-A3/G-B3's redaction-list precedent), `account_id` (`uuid`, `NOT NULL`),
      `acting_profile_id` (`uuid`, nullable — "**Set once at sign-in, never written again**",
      ADR-013/FR-1.6), `remember_me` (`bool`, default `true`), `expires_at` (`timestamptz`, `NOT
      NULL`), `created_at` (`timestamptz`, default now), `revoked_at` (`timestamptz`, nullable).
      Household-isolation `pgPolicy`, same shape as T005.
- [X] T007 [P] In the same file, add `Household` (`data-model.md` "Household"): `id` (`uuid`, PK),
      `name` (`text`, `NOT NULL`), `owner_account_id` (`uuid`, `NOT NULL` — "keine
      Sicherheitsgrenze, nur Zuordnung", C-1.4), `contact_email` (`text`, `NOT NULL`), `join_code`
      (`text`, `NOT NULL`), `join_code_rotated_at` (`timestamptz`, nullable), `created_at`
      (`timestamptz`, default now), `deleted_at` (`timestamptz`, nullable). RLS policy scoped by
      `id` itself (`Household` is the tenant root, not `household_id`-keyed):
      `id = (select current_setting('app.household_id', true)::uuid)`.
- [X] T008 [P] In the same file, add `HouseholdSettings` (`data-model.md` "HouseholdSettings"),
      1:1 with `Household`: `household_id` (`uuid`, PK + FK to `household.id`), `scale_weights`
      (`jsonb`, default `{no: 0, rather_not: 1, good: 3, definitely: 5}`), `favorite_budget_factor`
      (`numeric`, default `1.5`), `hide_results_until_voted` (`bool`, default `true`),
      `quorum_share` (`numeric`, default `0.5`), `updated_at` (`timestamptz`, default now),
      `updated_by_account_id` (`uuid`, `NOT NULL`). Household-isolation `pgPolicy` keyed by
      `household_id` (the PK itself).
- [X] T009 [P] In the same file, add `ResidentProfile` (`data-model.md` "ResidentProfile"): `id`
      (`uuid`, PK), `household_id` (`uuid`, `NOT NULL`), `display_name` (`text`, `NOT NULL` —
      "**unique among `status != moved_out` profiles within a household**", FR-1.4 — enforced as a
      **partial unique index** `ON (household_id, display_name) WHERE status != 'moved_out'`, not a
      plain unique constraint, so a released name is reusable per AC-1.4), `status`
      (`pgEnum("resident_profile_status", ["prepared", "active", "moved_out"])`, `NOT NULL`),
      `moved_in_on` (`date`, nullable), `moved_out_on` (`date`, nullable), `room_id` (`uuid`,
      nullable), `created_at` (`timestamptz`, default now). Household-isolation `pgPolicy`.
- [X] T010 [P] In the same file, add `Membership` (`data-model.md` "Membership"): `id` (`uuid`,
      PK), `household_id` (`uuid`, `NOT NULL`), `account_id` (`uuid`, `NOT NULL`),
      `resident_profile_id` (`uuid`, nullable — "set = acts as a resident profile; `null` =
      household account"), `is_resident` (`bool`, `NOT NULL` — "the household account has `false`",
      FR-1.7), `role` (`pgEnum("membership_role", ["household_admin", "moderator", "member"])`,
      `NOT NULL`), `permissions` (`text[]`, `NOT NULL`, default `[]` — values from FR-1.8's F1-
      relevant subset: `create_application`, `change_application_state`, `close_round`,
      `confirm_appointment`, `manage_rooms`, `manage_members`, `manage_settings`), `joined_via_code`
      (`text`, nullable), `joined_at` (`timestamptz`, default now), `revoked_at` (`timestamptz`,
      nullable). Household-isolation `pgPolicy`.
- [X] T011 Create `test/guarded.manifest.json` entries for **G-D14** and **G-D15**, moving their
      `status` from `"pending"` to a `testFiles`-populated but still-failing state until Phase 3/5
      implement them (Minimal-Gate item 6 — registered before implementation, not after).
- [X] T012 [P] Add a `visibilityInvariants` entry pair (`…_via_policy`/`…_via_raw_sql`) in the same
      manifest for each new `household_id`-carrying table this feature creates: `account`,
      `session`, `household`, `householdsettings`, `residentprofile`, `membership`, `room`,
      `castinground`, `roundparticipation` — all initially `"pending"` (G-C7's own bookkeeping
      requirement, mirroring F0's `application`/`activityevent` pair).

**Checkpoint**: session context supports nullable `profileId`, the `identity` module's six tables
exist with RLS, guarded-manifest scaffolding is in place. User story implementation can begin.

---

## Phase 3: User Story 1 - Register a household and become one of its residents (Priority: P1) 🎯 MVP

**Goal**: A household registers, is warned its email is shared, creates a resident profile for the
person operating it without that profile ever being occupied by the household account itself, and
the acting identity of any session is fixed at sign-in with no write path afterward.

**Independent Test**: Register a household, confirm the shared-address notice renders before
submit, create a resident profile from that account, and confirm a sign-out/sign-in cycle is
required to act as that resident — with the household account itself never able to cast a vote.

### Tests for User Story 1

> Write these first; they must fail (no repository/auth code wired up yet).

- [X] T013 [P] [US1] Test in `tests/unit/identity/display-name-uniqueness.test.ts`: creating a
      second `ResidentProfile` named "Jonas" in the same household while the first is `status !=
      moved_out` is refused (AC-1.3, FR-1.4); creating it succeeds once the only "Jonas" is
      `moved_out` (AC-1.4).
- [X] T014 [P] [US1] Test in `tests/unit/identity/resident-profile-transitions.test.ts`: only
      `prepared → active`, `prepared → moved_out`, and `active → moved_out` are declared and
      permitted; any other pair (e.g. `moved_out → active`) throws — same "declared table, no
      silent fallthrough" discipline as F0's `Application` machine (ADR-002).
- [X] T015 [P] [US1] Test in `tests/unit/identity/derived-email.test.ts`: the derived resident-
      account email is computed from `ResidentProfile.id`, is stable for the same id, and differs
      for two different ids sharing the same `display_name` — a pure function, no network call
      (Research §2: "never from `display_name`, which is only unique among non-`moved_out`
      profiles and gets reused after a move-out").
- [X] T016 [P] [US1] Guarded test **G-D14** in `tests/integration/policy/
      household-account-identity.test.ts`: a `Session` created for an `Account` whose `Membership`
      has `is_resident = false` has `acting_profile_id = null` at creation. Mark `[GUARDED]` with
      `// GUARDRAIL: G-D14 — siehe GUARDRAILS.md`.
- [X] T017 [P] [US1] Guarded test **G-D14**, second half, in `tests/integration/raw-sql/
      session-immutable-profile.test.ts`: an attempted `UPDATE sessions SET acting_profile_id = …`
      against an existing session is rejected (no write path after creation — FR-1.6, "shall not
      be writable afterwards"). Both this and T016 register in `test/guarded.manifest.json` from
      T011.
- [X] T018 [P] [US1] Test in `tests/integration/policy/account-cannot-vote.test.ts`: a repository-
      layer attempt to record a vote-like action (a stub call representing "cast a vote", since
      `Vote` doesn't exist until F3 — assert the *authorization check* refuses any
      `is_resident = false` account, not the `Vote` table itself) fails for a household account by
      every route the repository exposes (AC-1.5, FR-1.7).
- [X] T019 [P] [US1] Guarded test (household-scoping, policy layer) in `tests/integration/policy/
      identity-household-scoping.test.ts`: given two households A and B, each with an `Account`/
      `ResidentProfile`/`Membership`, a policy-layer query scoped to household A returns zero rows
      from household B for all three tables — even with no `WHERE household_id` clause. Register
      as `…_via_policy` for `account`/`residentprofile`/`membership` in the manifest.
- [X] T020 [P] [US1] Guarded test (household-scoping, raw SQL) in `tests/integration/raw-sql/
      identity-household-scoping.test.ts`: the same scenario as T019, as raw SQL under the
      application role, bypassing the policy layer (G-C7). Register as `…_via_raw_sql`.

### Implementation for User Story 1

- [X] T021 [US1] Create `src/modules/identity/repository.ts`: the sanctioned entry point for
      `Account`/`Household`/`HouseholdSettings`/`ResidentProfile`/`Membership`/`Session` reads and
      writes, every call opening its transaction through T003's helper (mirrors F0's
      `casting/repository.ts` convention, G-C1).
- [X] T022 [US1] Implement `src/modules/identity/transitions.ts`: `ResidentProfile.status`'s
      three-pair transition table (`prepared→active`, `prepared→moved_out`, `active→moved_out`),
      `assertTransitionAllowed`/`InvalidTransitionError`, same shape as F0's
      `casting/transitions.ts` but for this smaller machine — a separate file, not a fourth branch
      added to `Application`'s transition table.
- [X] T023 [US1] Implement `src/modules/identity/auth.ts`: `deriveResidentEmail(residentProfileId)`
      (pure function, Research §2, T015's subject), and the Supabase Auth admin wiring —
      `registerHousehold(email, password)` calling `auth.admin.createUser({ email, password })`
      then creating the `Household`/`HouseholdSettings`/`Account`/`Membership` rows in one
      transaction (FR-1.1); `createResidentProfile(displayName)` on a household account, which
      creates the `ResidentProfile` (`status: "prepared"`) but **does not** call
      `auth.admin.createUser` — no `Account`/`Membership` exists for it until someone actually
      signs up against it (a later, out-of-F1-acceptance-scope claim step is a natural F2 follow-on
      but is not required by any F1 acceptance scenario — FR-1.5 only requires the profile to
      exist and never be occupied by the household account, which `prepared`'s definition already
      guarantees); `signIn(identifier, password)` resolving either the household's own
      `(email, password)` or a resident's `(household, display_name, password)` — the latter via
      T015's derived-email mapping — then calling `supabase.auth.signInWithPassword` and creating
      exactly one `Session` row with `acting_profile_id` set once, per ADR-013/FR-1.6.
- [X] T024 [US1] Enforce the `manage_settings`/registration-time permission default from `spec.md`'s
      Assumptions: the household account's created-for-self resident profile's `Membership` gets
      `permissions` including `close_round` at creation (not every later-created profile) — the
      F1-requirements.md §8 recommendation `spec.md` adopted as-is.
- [X] T025 [US1] Build the registration route `src/app/(auth)/register/page.tsx` (screen A1): a
      form for `email`+`password`, with the shared-address notice rendered unconditionally above
      the fields — not behind a tooltip, accordion, or scroll (AC-1.2, "visible without scrolling
      or interaction"); submitting with either field empty shows an inline error naming the missing
      field without a network round-trip succeeding (AC-1.1, FR-1.1/FR-1.2). Styled against
      `docs/09-Design-System.md`'s tokens; `prototype/`'s A1 screen used for visual reference only
      (never copied as code, per feedback memory).
- [X] T026 [US1] Build the sign-in route `src/app/(auth)/sign-in/page.tsx`: two entry modes —
      household `(email, password)` and resident `(household, display_name, password)` — routed to
      T023's `signIn`; on success, the interface states which identity is signed in (household name
      vs. resident display name) per AC-1.6/FR-1.6, with no control anywhere that changes the
      acting identity without a full sign-out.
- [X] T027 [US1] Run T013–T020 and confirm all pass.

**Checkpoint**: User Story 1 is independently functional — a household can register, create a
resident profile, and sign in as either identity, with the fixed-identity invariant enforced and
guarded.

---

## Phase 4: User Story 2 - Define the rooms being cast for (Priority: P2)

**Goal**: A moderator creates, renames, and removes rooms; each room's state is independent of
every other room's and of any round covering it.

**Independent Test**: Create multiple rooms, set one to `occupied`, confirm the other rooms and any
round covering them are unaffected.

### Tests for User Story 2

- [X] T028 [P] [US2] Test in `tests/unit/casting/room-transitions.test.ts`: after migration, all
      six states (`planned`, `open`, `promised`, `occupied`, `on_hold`, `not_available`) exist as
      valid enum values (FR-1.10); the F1-reachable subset of transitions
      (`—→planned`, `planned→open`, `open→on_hold`, `on_hold→open`,
      `{open,on_hold}→not_available`) succeed; `promised`/`occupied` and their reverses (driven by
      `Application.state`, out of F1's scope) are declared in the table for completeness but
      asserted unreachable by anything F1's repository exposes.
- [X] T029 [P] [US2] Test in `tests/integration/policy/room-independence.test.ts`: given a round
      covering rooms A, B, C, setting A to `occupied` leaves the round's `status` unchanged and B/C
      unchanged (AC-1.7, FR-1.11).
- [X] T030 [P] [US2] Test (same file or a sibling): removing a room while a round covering it is
      `open` is refused; setting it `not_available` instead succeeds (EC-1.6).
- [X] T031 [P] [US2] Test in `tests/unit/casting/room-rename.test.ts`: renaming succeeds at every
      room state and every round state (including with an `open` round covering it), and produces
      exactly one `ActivityEvent` of a `room.renamed`-shaped `event_type` (Clarifications, Session
      2026-09-17).
- [X] T032 [P] [US2] Guarded test pair (household-scoping, policy + raw SQL) for `room` in `tests/
      integration/{policy,raw-sql}/room-household-scoping.test.ts`, same shape as T019/T020.

### Implementation for User Story 2

- [X] T033 [US2] Extend `src/modules/casting/schema.ts` with `Room` (`data-model.md` "Room"): `id`
      (`uuid`, PK), `household_id` (`uuid`, `NOT NULL`), `label` (`text`, `NOT NULL`), `status`
      (`pgEnum("room_status", ["planned", "open", "promised", "occupied", "on_hold",
      "not_available"])`, `NOT NULL`), `current_resident_profile_id` (`uuid`, nullable),
      `created_at` (`timestamptz`, default now), `deleted_at` (`timestamptz`, nullable).
      Household-isolation `pgPolicy`, same shape as F0's `Application`.
- [X] T034 [US2] Implement `src/modules/casting/room-transitions.ts`: the F1-reachable subset of
      `docs/domain/zustandsmaschinen.md` §3.3's table (T028's five pairs), `assertTransitionAllowed`
      / `InvalidTransitionError` — a separate file from `transitions.ts` (`Application`-only, F0's
      existing convention: one state machine per file).
- [X] T035 [US2] Extend `src/modules/casting/repository.ts` with room CRUD: `createRoom`,
      `renameRoom` (writes `room.renamed` `ActivityEvent`, unrestricted by round/room state per
      T031), `transitionRoomStatus` (via T034, writes an `ActivityEvent` per FR-1.20), `removeRoom`
      (refuses while any `open` round's `room_ids` includes it, per EC-1.6 — the round-coverage
      check this needs is available once T041 exists; if T041 isn't done yet when this task is
      picked up, stub the check against an empty round set and revisit before T054's full-gate run).
- [X] T036 [US2] Build the rooms route `src/app/(org)/rooms/page.tsx` (screen O14): list rooms with
      state and rename/remove/status-change actions, gated on `manage_rooms` (per
      `docs/domain/identity.md` §2.1's permission note — "vorbelegt bei `household_admin` **und**
      `moderator`").
- [X] T037 [US2] Run T028–T032 and confirm all pass.

**Checkpoint**: User Stories 1 and 2 both work independently — identity and rooms are both
functional without either depending on the other's UI.

---

## Phase 5: User Story 3 - Open a casting round with a frozen voter list and rules (Priority: P3)

**Goal**: Opening a round atomically snapshots eligible residents into `RoundParticipation` and
freezes the four locked `HouseholdSettings` fields into `settings_snapshot`; while any round is
`open`, those four settings are locked; a profile-less session sees a round's identity/lifecycle
but nothing derived from `Application`.

**Independent Test**: Open a round with a known number of eligible residents and a known rule set,
then confirm the exact snapshot count and frozen values persist even after the household's live
settings change afterward.

### Tests for User Story 3

- [X] T038 [P] [US3] Test in `tests/unit/casting/round-open-preconditions.test.ts`: opening with no
      rooms selected (EC-1.1), with every covered room already `occupied`/`not_available` (EC-1.2),
      or with zero eligible residents (EC-1.3) is each refused, naming what's missing; opening with
      exactly one eligible resident succeeds (EC-1.4, `ceil(0.5 × 1) = 1`).
- [X] T039 [P] [US3] Test in `tests/integration/policy/round-open-atomicity.test.ts`: opening a
      round with 7 eligible residents produces exactly 7 `RoundParticipation` rows marked
      `source = "snapshot_at_open"` (AC-1.8, FR-1.14); a `settings_snapshot` copy of the four locked
      `HouseholdSettings` fields is stored at the same moment (FR-1.15).
- [X] T040 [P] [US3] Test (same file): a forced mid-transaction failure during `draft → open`
      leaves the round `draft` with **zero** `RoundParticipation` rows and no `settings_snapshot`
      — both effects or neither (AC-1.10, FR-1.16).
- [X] T041 [P] [US3] Test in `tests/unit/casting/quorum-denominator.test.ts`: changing
      `HouseholdSettings.quorum_share` after a round opens does not change the value read from that
      round's own `settings_snapshot` (AC-1.9, C-1.1 — "a copy, never a reference"); a resident
      joining the household after opening does not change the denominator until a moderator adds
      them, and that addition is marked `source = "added_manually"` (AC-1.11/AC-1.12, FR-1.17/
      FR-1.18).
- [X] T042 [P] [US3] Test in `tests/integration/policy/procedure-lock.test.ts`: while any round is
      `open`, attempting to change `scale_weights`, `favorite_budget_factor`,
      `hide_results_until_voted`, or `quorum_share` is refused, naming the open round (AC-1.13,
      FR-1.21); with no round `open` (all `draft`/`closed`/`archived`), the same change succeeds
      (AC-1.15, invariant I-7). Forcing the change through a raw-SQL administrative bypass path
      still records an `ActivityEvent` and the round subsequently shows a "procedure changed"
      notice (AC-1.14, FR-1.22).
- [X] T043 [P] [US3] Test in `tests/unit/casting/round-participant-list.test.ts`: the participant-
      list read path returns names only for every participant — no join-date, contact detail, or
      action controls in the payload it returns (AC-1.18, FR-1.19, FR-1.28's "neither shall link to
      the other's data").
- [X] T044 [P] [US3] Guarded test **G-D15** (policy layer) in `tests/integration/policy/
      round-visibility-household-account.test.ts`: for a session with `profileId = null`, every
      read path on `CastingRound` returns `id, household_id, title, status, room_ids, opened_at,
      closed_at, phase_deadline_at`, and the three retention fields — and **no** value derived from
      `Application` (there are none on `CastingRound` itself in F1's scope, so this test also
      asserts the repository exposes no method that would return one — see `research.md` §3).
- [X] T045 [P] [US3] Guarded test **G-D15** (raw SQL) in `tests/integration/raw-sql/
      round-visibility-household-account.test.ts`: the same assertion querying the base
      `casting_round` table directly (not the admin view from T049) under the application role with
      `app.profile_id` unset — confirming the guarantee holds even bypassing the view, per
      `research.md` §3's "the raw-SQL half must query the base table."
- [X] T046 [P] [US3] Guarded test pair (household-scoping, policy + raw SQL) for `castinground` and
      `roundparticipation` in `tests/integration/{policy,raw-sql}/round-household-scoping.test.ts`,
      same shape as T019/T020.

### Implementation for User Story 3

- [X] T047 [US3] Extend `src/modules/casting/schema.ts` with `CastingRound` (`data-model.md`
      "CastingRound"): `id` (`uuid`, PK), `household_id` (`uuid`, `NOT NULL`), `title` (`text`, `NOT
      NULL`), `status` (`pgEnum("casting_round_status", ["draft", "open", "paused", "closed",
      "archived"])`, `NOT NULL`, default `"draft"`), `room_ids` (`uuid[]`, `NOT NULL`),
      `settings_snapshot` (`jsonb`, nullable — set only at `draft → open`), `opened_at`
      (`timestamptz`, nullable), `closed_at` (`timestamptz`, nullable), `phase_deadline_at`
      (`timestamptz`, nullable), `quorum_denominator_frozen` (`int`, nullable),
      `retention_until` (`date`, nullable), `retention_extensions` (`jsonb`, default `[]`),
      `retention_warned_at` (`timestamptz`, nullable), `created_at` (`timestamptz`, default now).
      Household-isolation `pgPolicy` — this is the row-level half; T049 adds the column-restriction
      half for a profile-less session.
- [X] T048 [US3] In the same file, add `RoundParticipation` (`data-model.md`
      "RoundParticipation"): `id` (`uuid`, PK), `round_id` (`uuid`, `NOT NULL`), `household_id`
      (`uuid`, `NOT NULL` — denormalized per T005's cited `Application.household_id` precedent),
      `resident_profile_id` (`uuid`, `NOT NULL`), `source`
      (`pgEnum("round_participation_source", ["snapshot_at_open", "added_manually"])`, `NOT NULL`),
      `can_vote` (`bool`, `NOT NULL`), `added_at` (`timestamptz`, default now), `removed_at`
      (`timestamptz`, nullable). Household-isolation `pgPolicy`.
- [X] T049 [US3] Create the Postgres view `casting_round_admin_view` (migration, per `research.md`
      §3) exposing exactly `id, household_id, title, status, room_ids, opened_at, closed_at,
      phase_deadline_at, retention_until, retention_extensions, retention_warned_at` from
      `casting_round`. Implement the application-layer policy object in
      `src/modules/casting/repository.ts` so a profile-less session's read calls resolve against
      this view — and the repository simply has no method returning an `Application`-derived value
      for such a session (ADR-014, G-D15 — the column restriction lives here, not in RLS, per
      `research.md` §3's citation of ADR-004's V-4 precedent).
- [X] T050 [US3] Implement `createRound`/room-selection in `src/modules/casting/repository.ts`
      (FR-1.12) and the `draft → open` transaction: validates EC-1.1/EC-1.2/EC-1.3 preconditions
      (T038), then in one transaction writes one `RoundParticipation` row per eligible
      `ResidentProfile` (`source: "snapshot_at_open"`, `can_vote` copied from
      `Membership.is_resident`) and the `settings_snapshot` copy of `HouseholdSettings`'s four
      locked fields, and flips `status`/`opened_at` — all four effects or none (FR-1.14/FR-1.15/
      FR-1.16, T039/T040).
- [X] T051 [US3] Implement `addResidentToRound` (FR-1.18): inserts a `RoundParticipation` row with
      `source: "added_manually"` for an already-`open` round, never touching existing snapshot
      rows.
- [X] T052 [US3] Implement the procedure lock in `src/modules/identity/repository.ts`'s
      `HouseholdSettings` update path: reject a write to `scale_weights`, `favorite_budget_factor`,
      `hide_results_until_voted`, or `quorum_share` if any `CastingRound` in the household has
      `status = 'open'`, naming that round in the error (FR-1.21, T042). Add a raw-SQL
      administrative bypass path used only by T042's forced-change test, which still writes an
      `ActivityEvent` and sets a `procedure_changed` notice flag the round view surfaces (FR-1.22).
- [X] T053 [US3] Implement the participant-list read (`getRoundParticipants`, FR-1.19/FR-1.28):
      returns `display_name` only, joined from `RoundParticipation` × `ResidentProfile`, no other
      column — a distinct query path from T063's resident-list read, and neither links to the
      other's underlying rows (FR-1.28).
- [X] T054 [US3] Build the round-creation route `src/app/(org)/rounds/new/page.tsx` (screen O2):
      room-selection checklist, an "Open" action calling T050, and inline refusal messages for
      EC-1.1/EC-1.2/EC-1.3.
- [X] T055 [US3] Build (or extend) the org dashboard `src/app/(org)/dashboard/page.tsx` (screen O1)
      to show at most one "active" round per EC-1.5 ("one round is active, others reachable only
      via a round list") — for a profile-less session, rendered from T049's admin view only.
- [X] T056 [US3] Run T038–T046 and confirm all pass.

**Checkpoint**: User Stories 1–3 are all independently functional — a round can be opened with an
atomic, frozen snapshot, the procedure lock holds, and the ADR-014 boundary is enforced and
guarded.

---

## Phase 6: User Story 4 - Maintain an accountable resident list under the administration boundary (Priority: P4)

**Goal**: The resident list is fully available to administration, read-only to a moderator, and
unreachable by anyone else; a profile-less session cannot reach casting content beyond the ADR-014
`CastingRound` exception already built in Phase 5.

**Independent Test**: Exercise the resident list as administration (full access), as a moderator
profile (read-only), and as a non-moderator profile (no route reaches it) — and confirm a
profile-less session cannot reach casting rounds' `Application`-derived data, applications, votes,
slots, appointments, or casting notes by any route.

### Tests for User Story 4

- [X] T057 [P] [US4] Test in `tests/integration/policy/resident-list-access.test.ts`:
      administration's read returns display name, join date, contact detail (if present), and
      status per member, plus action availability (remove/moved_out/reactivate/join-code) (FR-1.25/
      FR-1.26); a moderator profile's read returns the same list with **zero** action controls in
      the response shape (AC-1.20, FR-1.27); a non-moderator profile's request is refused —
      asserted against every read function the repository exposes for this list, not just one
      (AC-1.21, FR-1.27, "not reachable at all — by any route").
- [X] T058 [P] [US4] Test in `tests/unit/identity/resident-list-empty-state.test.ts`: a household
      where administration is the only member returns a payload whose shape leads with the
      join-code action rather than an empty member array (AC-1.22, FR-1.29).
- [X] T059 [P] [US4] Test in `tests/integration/policy/resident-list-audit.test.ts`: removing a
      member, setting `moved_out`, or reactivating writes exactly one `ActivityEvent` naming both
      `actor_account_id` and `actor_profile_id` (AC-1.23, FR-1.30).
- [X] T060 [P] [US4] Test in `tests/integration/policy/admin-boundary.test.ts`: a profile-less
      session's request for anything derived from `Application` — via any repository method that
      exists as of this feature — is refused (AC-1.16, FR-1.23), confirming the boundary holds for
      every entity F1 actually builds (the full `Application`/`Vote`/`Slot`/`Appointment`/
      `CastingNote` list is F3–F5's concern and is re-asserted as each lands, per `quickstart.md`
      §4's note — this test doesn't restate that list, `spec.md` already does).
- [X] T061 [P] [US4] Test in `tests/unit/identity/subject-access-export-stub.test.ts`: a profile-
      less session can trigger a subject-access export action without its return value being
      rendered back to that session (AC-1.17, FR-1.24) — a stub/interface-level test, since the
      export's actual content generation is out of F1's scope (compliance features, later).

### Implementation for User Story 4

- [X] T062 [US4] Implement `EC-1.11` and the last-`Jonas`/moderator-recovery interaction directly:
      confirm (via T014's transition table plus T057's read-only-for-moderator test) that a
      moderator has no code path to set `moved_out` on any profile, including the last one created
      via FR-1.5 — this falls out of FR-1.27 already being enforced, so this task is verification +
      a regression test, not new production code.
- [X] T063 [US4] Implement `getResidentList`/`removeMember`/`setMovedOut`/`reactivateMember`/
      `shareOrRotateJoinCode` in `src/modules/identity/repository.ts`, each gated on `manage_members`
      for administration-only actions, each write producing an `ActivityEvent` naming both
      `actor_account_id` and `actor_profile_id` (FR-1.30); `getResidentList` itself branches its
      returned shape by caller role (full for administration, read-only-shaped for a moderator, an
      authorization error for anyone else) rather than filtering columns client-side.
- [X] T064 [US4] Build the resident-list route `src/app/(org)/members/page.tsx` (screen O16): reads
      via T063, leads with the join-code action when the member array is empty (T058), renders no
      action controls when the caller is a moderator (not administration).
- [X] T065 [US4] Build the household-settings route `src/app/(org)/settings/page.tsx` (screen O20):
      the four procedure-lock-governed fields plus retention (the two named FR-1.24 exceptions
      administration keeps), wired to T052's guarded update path with the "which round is open"
      error surfaced inline.
- [X] T066 [US4] Run T057–T061 and confirm all pass.

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T067 Add `data-inventory.yml` rows for every new 🟠 field this feature introduces (`Account.
      email`, `ResidentProfile.display_name`, `Membership.{role,permissions}`, etc. — per
      `docs/domain/personenbezogene-felder.md` §9.3 and `data-model.md`'s per-entity Class column),
      per C-1.6/G-F1 — the CI gate fails without this once wired up.
- [X] T068 [P] Extend `scripts/lint/rls-coverage.ts`'s scope confirmation: run it against the
      complete post-F1 schema and confirm zero failures (it's generic already, per F0's T037
      precedent — this task is the verification run, not new lint logic).
- [X] T069 Run `bash tools/check-refs.sh --quiet` and confirm it still exits 0.
- [X] T070 Confirm no `.skip`/`.only`/commented-out body exists in any file containing a `[GUARDED]`
      test — T016, T017, T044, T045 at minimum (G-D's own CI check, `scripts/lint/
      guarded-tests.ts` from F0's T045).
- [X] T071 [P] Flip `test/guarded.manifest.json`'s `G-D14` and `G-D15` entries from T011's
      registered-but-failing state to `"implemented"` with their real `testFiles`, once T016/T017
      and T044/T045 are green.
- [X] T072 Run `quickstart.md`'s full validation sequence (§1–§5) end to end and confirm every
      `Expected` outcome holds, including `npm run verify` and `npm run build` (F0's Phase 9 found
      that neither `vitest run` nor the four `npm run verify` scripts alone catch a `tsc`
      strict-mode failure — run the full build too, not just tests).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all four user stories** — T003/T004 in
  particular, since every later story's tests construct a `SessionContext`; T005–T010's six
  `identity` tables are the base every story reads or writes through.
- **User Story 1 (Phase 3)**: depends on Foundational only.
- **User Story 2 (Phase 4)**: depends on Foundational only — does not depend on US1's own tasks,
  though a real round-open flow (US3) will later reference both `Room` and `ResidentProfile`.
- **User Story 3 (Phase 5)**: depends on Foundational, on US1's `ResidentProfile`/`Membership`
  (T009/T010, for the snapshot) and on US2's `Room` (T033, for `room_ids`/EC-1.1–EC-1.3) — the one
  real cross-story dependency, same shape as F0's US3→US2 `ActivityEvent` dependency. Independently
  *testable* per its own Independent Test once those tables exist, regardless of whether US1/US2's
  own UI routes are built.
- **User Story 4 (Phase 6)**: depends on Foundational and on US1's `ResidentProfile`/`Membership`
  (the resident list operates on them) and, for T060's boundary test, on whatever US2/US3 tables
  exist by then (there is more to test against the more of F1 is done, but T060 is written to pass
  regardless of exactly which subset lands first — see its own note on not restating F3–F5's list).
- **Polish (Phase 7)**: depends on all four user stories being complete.

### Parallel Opportunities

- T001–T002 (Setup) in parallel.
- T005–T010 (Foundational schema tables) in parallel with each other, after T003/T004.
- T013–T020 (US1 tests) in parallel with each other.
- T028–T032 (US2 tests) in parallel with each other, and with US1's tests if staffed separately
  (both depend only on Foundational).
- T038–T046 (US3 tests) in parallel with each other, once T033/T009/T010 exist.
- T057–T061 (US4 tests) in parallel with each other.

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → Phase 3 (User Story 1). Nothing else in this feature — rooms,
rounds, the resident list — has an owner without registration and the fixed-identity model existing
first (`spec.md`'s own "why this priority" for US1).

**Incremental delivery**: Setup + Foundational → US1 (identity, MVP) → US2 (rooms) → US3 (round
open + procedure lock, depends on US1+US2's tables) → US4 (resident list + administration
boundary) → Polish.

---

## Phase 8: Amendments (2026-09-17, post-implementation review)

Found during a user review of `spec.md` after T001–T072 were all implemented and verified
end-to-end: two design corrections, plus one already-decided fix (`U-27`) surfaced while
implementing the first two. See `spec.md`'s Clarifications, Session 2026-09-17 (second pass), for
the full reasoning trail.

- [X] T073 Rename/extend `round_participation_source` (`src/modules/casting/schema.ts`) with a
      third value `joined_after_open` (migration `drizzle/0009_*.sql`). Add a
      `SECURITY INVOKER` trigger `membership_auto_join_open_rounds` on `membership` (AFTER INSERT)
      that, when the new row has `is_resident = true` and a `resident_profile_id`, inserts a
      `RoundParticipation` row (`source = joined_after_open`) plus a matching `ActivityEvent` for
      every currently `open` round in that household (`drizzle/0010_*.sql`). Lives as a DB trigger,
      not application code, because `identity` may import nothing (kontextgrenzen.md §4) and the
      natural call site (`claimResidentProfile`) is itself identity-owned code (FR-1.18, revised).
- [X] T074 [P] Update `tests/unit/casting/quorum-denominator.test.ts` to assert the new automatic
      behavior (a claim during an open round auto-joins it, marked `joined_after_open`) instead of
      the old moderator-gated one; keep a case exercising `addResidentToRound` as the remaining
      manual-correction path (AC-1.11, AC-1.12).
- [X] T075 `src/modules/identity/repository.ts`: broaden the resident-list permission model to full
      parity — new `assertIsAdministrationOrModerator` (role ∈ {household_admin, moderator}),
      used by `removeMember`/`setMovedOut`/`reactivateMember`/`rotateJoinCode`; `getResidentList`'s
      `canAct` is now `isAdmin || isModerator`. `assertIsAdministration` (strict) is kept
      separately for `triggerSubjectAccessExport`, which FR-1.24 names as administration's
      specifically, unaffected by this change (FR-1.27, revised).
- [X] T076 Implement U-27's two-tier removal properly (found incomplete during T075 — the original
      `removeMember` was a plain one-click revoke, not the confirmed hard tier, and neither tier
      touched `Membership` access, missing V-3's immediate-revocation requirement): add
      `["moved_out", "active"]` to `identity/transitions.ts`'s declared table (reactivation is now
      a real transition, not a raw `UPDATE`); rewrite `removeMember` to require a
      `confirmDisplayName` parameter matching the target's exact display name
      (`DisplayNameConfirmationMismatchError` otherwise), transition the profile to `moved_out`,
      and revoke the `Membership` (`membership.removed_as_intruder` event); add `setMovedOut` (the
      soft tier — same `Membership` revocation, `membership.revoked` event); `reactivateMember`
      now reverses either tier (transitions back to `active`, un-revokes `Membership`).
- [X] T077 [P] Rewrite `tests/integration/policy/resident-list-audit.test.ts` to cover both tiers
      distinctly (`setMovedOut` → `membership.revoked`; `removeMember` with the correct name →
      `membership.removed_as_intruder`; wrong name → `DisplayNameConfirmationMismatchError`, no
      event). Update `tests/integration/policy/resident-list-access.test.ts`: a moderator now gets
      `canAct = true` and can actually call `setMovedOut` successfully (parity, not just a flag).
- [X] T078 New `FR-1.31`/`AC-1.24`/`U-30`: `getCurrentHouseholdMembers` in
      `src/modules/identity/repository.ts` — every resident (`context.profileId !== null`) reads
      current (`status = active`) members' display names only; refused for a profile-less
      (household-account) session. New test
      `tests/unit/identity/current-household-members.test.ts`.
- [X] T079 [P] Build the new resident-facing route `src/app/(org)/who-lives-here/page.tsx` (screen
      `B5`, `docs/screens/B-start.md`) — no actions, current members only; a profile-less session
      sees an explanatory message instead of the list (not an uncaught `PermissionDeniedError`).
      Wire `remove-member-form.tsx` (typed-confirmation client component) and `setMovedOutAction`
      into `src/app/(org)/members/page.tsx`; link `/who-lives-here` from the dashboard for resident
      sessions only.
- [X] T080 Update maßgeblich docs to record all of the above as decisions, not restated wording:
      `docs/backlog/requirements/F1-requirements.md` (`FR-1.18`/`FR-1.26`/`FR-1.27` revised;
      `FR-1.31`/`AC-1.24` new; `EC-1.11`/`C-1.10` annotated superseded/partially-restored),
      `docs/08-UX-Entscheidungen.md` (new `U-30`; `U-22` annotated), `docs/02-SRD.md` (`S-05`
      updated), `docs/screens/O-organisation.md` (O16 table + two-tier-removal parity note),
      `docs/screens/B-start.md` (new screen `B5`). `spec.md`/`data-model.md` updated to match.
- [X] T081 Run the full gate end to end: `npm run verify` (all tests), `npm run build`,
      `bash tools/check-refs.sh --quiet` — all clean.

**Checkpoint**: all three requested/discovered corrections implemented, tested, documented, and
verified against the live database.

---

## Phase 9: Convergence (2026-09-17, /speckit-converge)

Found by inspecting `src/app/` against `spec.md`'s own acceptance scenarios: several FR-1.*
paths are implemented and tested at the repository/auth layer only (unit or integration tests
call the function directly) — no route in the running application reaches them, so the
corresponding acceptance scenario cannot actually be exercised end to end today.

- [X] T082 Build the UI path for creating and claiming a resident profile: a form letting the
      signed-in household account call `createResidentProfile`
      (`src/modules/identity/repository.ts`) to create a profile for itself, plus a claim/sign-up
      route where a person enters that profile's household + display name and sets a password,
      calling `claimResidentProfile` (`src/modules/identity/auth.ts`) — the step that creates the
      resident's actual Supabase Auth account and Membership. Neither function is called from any
      route today, so `sign-in`'s "Resident" mode (`src/app/(auth)/sign-in/sign-in-form.tsx`) can
      never succeed for any household — no resident account can be created through any reachable
      path in the deployed app. Per FR-1.5, US1/AC3 (missing).
- [X] T083 After `registerHouseholdAction` (`src/app/(auth)/register/actions.ts`) succeeds, sign
      the new household account in via `setSessionCookie` and `redirect()` (to `/dashboard`, or
      to T082's new resident-profile step), matching the pattern `sign-in/actions.ts` already
      uses. Today a successful registration returns silently with no navigation and no visible
      confirmation. Per US1's registration flow (partial).
- [X] T084 Build a round-detail view, reachable from the dashboard's active-round card
      (`src/app/(org)/dashboard/page.tsx`), that calls `getRoundParticipants`
      (`src/modules/casting/repository.ts`) to render participant display names. This is the read
      path residents must be able to reach per FR-1.19/US3 Acceptance Scenario 5 — implemented
      and unit-tested (`tests/unit/casting/round-participant-list.test.ts`) but never called from
      any route (missing).
- [X] T085 On the same round-detail view, surface `hasProcedureChangedNotice`
      (`src/modules/casting/repository.ts`) as the "procedure was changed" notice FR-1.22/US3
      Acceptance Scenario 7 requires when a locked setting was force-changed while the round was
      open. Implemented and tested at the repository layer
      (`tests/integration/policy/procedure-lock.test.ts`) but never read by any route today
      (missing).

- [X] T086 Show the household's current `join_code` on `/members` (`src/app/(org)/members/page.tsx`)
      for administration and a moderator (parity, U-30) whenever the member list is non-empty —
      found while re-checking FR-1.26 ("share or rotate the join code"): the empty-state branch
      already showed it, but the regular member-list view offered only a blind "Rotate" button
      with no code ever visible to actually share (partial).

**Checkpoint**: re-run `/speckit-converge` after T082–T086 land — US1's and US3's own
Independent Tests should then be exercisable through the running application, not only via
direct repository/auth calls in tests.

---

## Phase 10: Convergence (2026-09-17, second /speckit-converge pass)

- [X] T087 Fix a real race condition in `openRound` (`src/modules/casting/repository.ts`): the
      initial read of the `CastingRound` row used a plain `SELECT`, so two concurrent opens could
      both read `status = draft` before either wrote, producing two duplicate
      `RoundParticipation` snapshot batches and two `settings_snapshot` writes — violating EC-1.9
      ("exactly one opening takes effect"). Changed to `SELECT ... FOR UPDATE` so the second
      transaction blocks until the first commits, then correctly re-reads `status = open` and
      refuses. New test: `round-open-atomicity.test.ts`'s concurrent-open case. Per EC-1.9
      (contradicts — the requirement was explicit and the implementation violated it under
      concurrency, previously untested).
- [X] T088 Implement the "appoint it moderator" action EC-1.7 requires and which never existed in
      any form reachable by application code — every test and the schema itself assumed a
      `Membership.role` of `"moderator"` was reachable, but the only way it was ever set was a
      raw `tx.update(membership).set({role: "moderator"})` inside test fixtures
      (`resident-list-access.test.ts`), never through `identity/repository.ts` or any route. Added
      `setMemberRole` (household_admin-only, per EC-1.7's own wording; refuses to touch the
      `household_admin` role itself), wired a "Make moderator"/"Make member" toggle into
      `/members` (admin-only), and registered `membership.role_changed` in the audit payload
      allowlist (FR-1.20). Without this, the entire U-30 moderator-parity correction from this
      session was unreachable by any real household. New test:
      `tests/integration/policy/member-role-appointment.test.ts`. Per EC-1.7 (missing).

**Checkpoint**: re-run `/speckit-converge` after T087–T088 land.
