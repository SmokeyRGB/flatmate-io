# Feature Specification: F1 — Open a Casting Round

**Feature Branch**: `002-f1-casting-round`

**Created**: 2026-09-17

**Status**: Draft

**Input**: Implement the F1 packet as specified in
[`docs/backlog/requirements/F1-requirements.md`](../../docs/backlog/requirements/F1-requirements.md)
and [`docs/backlog/features/F1-open-a-casting-round.md`](../../docs/backlog/features/F1-open-a-casting-round.md):
household registration, resident profiles under the fixed-identity-per-session model (ADR-013),
rooms with independent state, casting rounds with room selection/voter snapshot/frozen settings,
the procedure lock while a round is open, the resident list (administration), and the
administration boundary (S-50).

## Clarifications

### Session 2026-09-17

- Q: Should a moderator be able to rename a room at any time, even after votes exist for a round
  covering it, or should renaming lock once a round covering that room is open? → A: Always allow
  renaming, at any round state; every rename is recorded as an `ActivityEvent` so residents can see
  that the room was renamed.

### Session 2026-09-17 (second pass — post-implementation review)

- Q: Should a resident joining after a round opens require a moderator to add them (FR-1.18 as
  originally written), or should they become vote-eligible automatically? → A: Automatic. The
  moment a resident claims their profile while a round is open, they join it — no moderator step.
  `FR-1.18`, `AC-1.11`, `AC-1.12` revised accordingly (source: `docs/backlog/requirements/
  F1-requirements.md`, 2026-09-17). The prior manual-add path (`addResidentToRound`) remains as a
  moderator correction tool for cases the automatic path missed, not as the primary path anymore.
- Q: Should a moderator's resident-list access stay read-only (`FR-1.27` as originally written), or
  should moderators get the same actions as administration? → A: Full parity — administration and
  moderator now see and can act on the resident list identically; only a profile-less
  non-moderator/non-admin account is still refused entirely. `FR-1.27`, `AC-1.20` revised; `U-22`
  (`docs/08-UX-Entscheidungen.md`) annotated as partially refined by the new `U-30`.
- Q: Should residents (non-moderator) regain any visibility into household membership, given `U-22`
  removed it entirely in favor of the join-code being the sole remaining protection? → A: Yes, but
  narrowly — a new, separate, read-only view (screen `B5`, `docs/screens/B-start.md`) shows only
  current (`active`) members' display names, no actions, no contact detail, no join dates, and does
  not link to or from the administration resident list or the round participant list. Purpose:
  lets a resident recognize and report — outside the app — someone who joined via the invite code
  without actually living there, partially restoring one of the two protection mechanisms `U-22`
  removed without reinstating the removal right. New `FR-1.31`/`AC-1.24`, new `U-30`.
- **Incidentally corrected while implementing the above:** `U-27`'s already-decided two-tier
  member removal (`docs/08-UX-Entscheidungen.md`, decided 2026-09-16 — soft `moved_out` for actual
  move-outs vs. a hard, typed-display-name-confirmation `removeMember` for join-code intruders,
  neither of which conflates with the other) had never actually been implemented correctly in this
  feature's first pass — `removeMember` was a plain one-click revoke, and `moved_out`/reactivate
  never touched `Membership` access at all, missing V-3's "access revoked immediately" requirement.
  Fixed as part of this session's changes, not a new decision — `U-27` already required it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register a household and become one of its residents (Priority: P1)

A household registers with an email address and a password, is told upfront that this address
will be visible to whoever else joins, and the person registering creates a resident profile for
themselves so they can take part in the casting rather than only administer it — using a
**separate sign-in** from the household account, per ADR-013's fixed-identity-per-session model.

**Why this priority**: Nothing else in this feature — rooms, rounds, voting — has an owner without
this. Per [`docs/backlog/requirements/F1-requirements.md`](../../docs/backlog/requirements/F1-requirements.md)
§7 (A-1.2), this is expected to be the *normal* path, not an edge case: the person who registers
almost always also lives there.

**Independent Test**: Can be fully tested by registering a household, confirming the notice
appears before submission, creating a resident profile from that account, and confirming a
sign-out/sign-in cycle is required to act as that resident — with the household account itself
never able to cast a vote.

**Acceptance Scenarios**:

1. **Given** the registration screen, **When** submitted with an empty email or empty password,
   **Then** the account is not created and the missing field is named (AC-1.1, FR-1.1).
2. **Given** the registration screen, **When** it is first displayed, **Then** the notice that the
   email will be shared with residents is visible without scrolling or interaction (AC-1.2,
   FR-1.2).
3. **Given** a registered household account, **When** it creates a resident profile for the
   person operating it, **Then** the household account itself never occupies that profile —
   whoever uses it signs in separately with `(household, display name) + password` (FR-1.5,
   FR-1.6, ADR-013).
4. **Given** I am signed in, **When** I open the avatar/identity menu, **Then** the interface
   states which identity I am signed in as, and no action anywhere changes the acting identity
   without ending the session (AC-1.6, FR-1.6).
5. **Given** I am signed in on the household account with no resident profile, **When** I attempt
   to cast a vote by any route, **Then** the attempt is refused and no vote is recorded (AC-1.5,
   FR-1.7).

---

### User Story 2 - Define the rooms being cast for (Priority: P2)

A moderator adds, renames, and removes the rooms a household is actually casting for, and each
room tracks its own state independently — filling one room must not affect any other room or the
round covering it.

**Why this priority**: A casting round cannot meaningfully open (User Story 3) without rooms to
select from. This is the smallest independently-testable slice ahead of that.

**Independent Test**: Can be fully tested by creating multiple rooms, setting one to `occupied`,
and confirming the other rooms and any round covering them are unaffected.

**Acceptance Scenarios**:

1. **Given** a household, **When** a moderator creates a room, **Then** it exists with exactly one
   state from `planned`, `open`, `promised`, `occupied`, `on_hold`, `not_available` (FR-1.9,
   FR-1.10).
2. **Given** an open round covering rooms A, B, and C, **When** room A becomes `occupied`, **Then**
   the round remains `open` and rooms B and C keep their own states (AC-1.7, FR-1.11).
3. **Given** a room is removed, **When** a casting round covering it is currently open, **Then**
   the removal is refused; the room may be set `not_available` instead (EC-1.6).

---

### User Story 3 - Open a casting round with a frozen voter list and rules (Priority: P3)

A moderator creates a casting round, selects which rooms it covers, and opens it. Opening takes an
atomic snapshot of who may vote and freezes the voting rules in force at that moment, so the
eventual ranking cannot be recomputed under different rules or a different voter list later.

**Why this priority**: This is the feature's actual payoff — per
[`docs/backlog/features/F1-open-a-casting-round.md`](../../docs/backlog/features/F1-open-a-casting-round.md),
"every later feature has something to hang off" once this exists. It depends on User Stories 1
and 2 (there must be residents and rooms to reference).

**Independent Test**: Can be fully tested by opening a round with a known number of eligible
residents and a known rule set, then confirming the exact snapshot count and frozen values persist
even after the household's live settings change afterward.

**Acceptance Scenarios**:

1. **Given** a household with 7 eligible residents and a round in `draft`, **When** the moderator
   opens the round, **Then** exactly 7 round-participation entries exist, each marked as
   originating from the opening snapshot (AC-1.8, FR-1.14).
2. **Given** a household whose quorum share is 0.5 and a round that has just been opened, **When**
   the household later changes its quorum share to 0.7, **Then** the open round still evaluates
   against 0.5 (AC-1.9, FR-1.15).
3. **Given** a round in `draft`, **When** opening it fails part-way for any reason, **Then** the
   round is still `draft` and no round-participation entries and no frozen rules exist for it
   (AC-1.10, FR-1.16 — the snapshot and the state change take effect together or not at all).
4. **Given** an open round with 7 participants, **When** an eighth resident claims their profile,
   **Then** the round's participation and quorum displays automatically divide by 8 from that
   point on, marked distinctly from the opening snapshot (AC-1.11, AC-1.12, FR-1.17, FR-1.18 —
   revised 2026-09-17: automatic, not moderator-gated).
5. **Given** I am a resident in an open round, **When** I open the participant list, **Then** I see
   participants' names only — no actions, contact details, or join dates (AC-1.18, FR-1.19).
6. **Given** a round in state `open`, **When** anyone attempts to change a rating weight, the
   favourite-budget factor, the quorum share, or the hidden-results setting, **Then** the change is
   refused and the reason names the open round (AC-1.13, FR-1.21).
7. **Given** a rating weight was nonetheless changed while a round was open through an
   administrative path, **When** any resident views that round, **Then** a notice states the
   procedure was changed, and an audit entry exists (AC-1.14, FR-1.22).
8. **Given** any casting-round or room state change, **When** the audit record is inspected,
   **Then** it names both the account and the acting profile (AC-1.19, FR-1.20).

---

### User Story 4 - Maintain an accountable resident list under the administration boundary (Priority: P4)

Administration keeps one authoritative list of who belongs to the household with their status,
which a moderator can read but not change, and which nobody without moderator rights can reach at
all. Separately, an account acting without an active resident profile — administration itself —
is confined to household setup and cannot reach casting content.

**Why this priority**: This hardens accountability and the administration/deliberation boundary
around the objects User Stories 1–3 create; it does not block them and can be validated
independently once a household, residents, and rooms exist.

**Independent Test**: Can be fully tested by exercising the resident list as administration and as
a moderator profile (both full access, since 2026-09-17 — U-30), as a non-moderator profile (no
route reaches it), and as any resident via the separate, reduced "who lives here" view (current
members' names only, no actions) — and by confirming a profile-less administration session reaches
only a casting round's identity/lifecycle fields, never applications, votes, slots, appointments,
casting notes, or anything else derived from `Application`, by any route (ADR-014).

**Acceptance Scenarios**:

1. **Given** a household with an active profile named "Jonas", **When** a moderator creates
   another profile named "Jonas", **Then** creation is refused with an inline message naming the
   collision; **When** the only "Jonas" is `moved_out`, creation of a new "Jonas" succeeds
   (AC-1.3, AC-1.4, FR-1.4).
2. **Given** the resident list, **When** administration or a moderator views it, **Then** both see
   the same per-member data — display name, join date, contact detail if present, and status —
   with the same actions: set `moved_out`, `remove` (typed-name confirmation, U-27, for a join-code
   intruder rather than a real move-out), reactivate, and share/rotate the join code (FR-1.25,
   FR-1.26, FR-1.27 — revised 2026-09-17: full parity, U-30).
3. **Given** a profile without moderator rights, **When** it requests the resident list by any
   route, **Then** the request is refused (AC-1.21, FR-1.27).
4. **Given** I am a resident, **When** I open the "who lives here" view, **Then** I see the
   display names of current (`active`) members only — no `moved_out`/`prepared` entries, no
   actions, no contact detail, no join dates — and this view neither links to nor is reachable
   from the administration resident list or the round participant list (FR-1.31, AC-1.24, U-30,
   screen `B5`).
5. **Given** a household where administration is the only member, **When** administration opens
   the resident list, **Then** the join-code action is shown and no empty list is displayed
   (AC-1.22, FR-1.29).
6. **Given** a member is removed, set `moved_out`, or reactivated on the resident list, **When**
   the audit record is inspected, **Then** it names both the account and the acting profile
   (AC-1.23, FR-1.30).
7. **Given** I am acting without a resident profile, **When** I request a casting round's identity
   or lifecycle fields (existence, `title`, `status`, `room_ids`, timestamps, retention fields),
   **Then** access is granted; **when** I request anything else — an application, a vote, a slot,
   an appointment, a casting note, or anything derived from `Application` including via a casting
   round (count, participation, score, ranking) — by any route, **then** access is refused
   (AC-1.16, FR-1.23, ADR-014).
8. **Given** I am acting without a resident profile, **When** I produce a subject-access export,
   **Then** the export is produced and its contents are not displayed to me (AC-1.17, FR-1.24).

### Edge Cases

Selected from [`docs/backlog/requirements/F1-requirements.md`](../../docs/backlog/requirements/F1-requirements.md)
§6 (maßgeblich for this packet's edge cases); not restated, only the required behavior is
summarized with its source ID:

- **EC-1.1 / EC-1.2 / EC-1.3**: Opening a round with no rooms selected, with every covered room
  already `occupied`/`not_available`, or with zero eligible residents is refused in each case —
  the reason names what's missing.
- **EC-1.4**: Opening a round with exactly one eligible resident is permitted (quorum of
  `ceil(0.5 × 1) = 1` is satisfiable).
- **EC-1.5**: A second round may exist at the data level while one is already open, but is never
  offered in the UI — one round is "active," others reachable only via a round list.
- **EC-1.7**: If the last moderator becomes unavailable, administration may *create* a resident
  profile and appoint it moderator — it never occupies that profile itself (ADR-013).
- **EC-1.8**: A resident made ineligible mid-round has that fact recorded on their
  round-participation entry; already-cast votes are unaffected by this feature.
- **EC-1.9**: Two moderators opening the same `draft` round simultaneously results in exactly one
  opening taking effect.
- **EC-1.10**: Households are not deduplicated by email — registering with an address already used
  elsewhere is permitted.
- **EC-1.11**: *Superseded 2026-09-17 by FR-1.27's moderator-parity revision.* Previously refused
  only because a moderator had no write access to the resident list at all; now that moderators
  have full parity with administration (U-30), a moderator setting `moved_out` on the last
  remaining resident profile created via FR-1.5 is the same case as administration doing it —
  permitted, with EC-1.7's fallback (administration creates a resident profile and appoints a
  moderator) available exactly as before if it leaves the household without an active resident.

## Requirements *(mandatory)*

### Functional Requirements

Quoted verbatim from their maßgeblich source,
[`docs/backlog/requirements/F1-requirements.md`](../../docs/backlog/requirements/F1-requirements.md)
§3 (the authoritative file for `FR-1.*` per `docs/README.md` §3's ID register) — not restated in
new prose, per the constitution's "cite, don't restate" principle. Grouped exactly as the source
groups them:

**Household and identity**

- **FR-1.1**: *"The system shall register a household from an email address and a password. Both
  are required."*
- **FR-1.2**: *"The registration screen shall display a notice that the email address will be
  shared with the household's residents, before submission."*
- **FR-1.3**: *"The system shall allow the household account to create resident profiles. Each
  profile has a display name."*
- **FR-1.4**: *"A resident profile's display name shall be unique within the household among
  profiles that are not `moved_out`."*
- **FR-1.5**: *"The household account shall be able to create a resident profile, including one
  intended for the person operating it. It shall never occupy that profile itself — whoever uses
  it signs in separately with `(household, display name) + password`."* (Source: ADR-013)
- **FR-1.6**: *"The acting identity of a session shall be fixed at sign-in and shall not be
  writable afterwards. Moving between administration and a resident identity shall require signing
  out and signing in again. The interface shall name the signed-in identity rather than offer a
  switch."* (Source: ADR-013)
- **FR-1.7**: *"The household account shall not be able to cast a vote."*
- **FR-1.8**: *"Membership shall carry voting eligibility and a role as independent attributes,
  plus individually grantable permissions (create applicant, change status, close round, confirm
  appointments)."*

**Resident list (administration)**

- **FR-1.25**: *"The household resident list shall show, per member: display name, join date,
  contact detail if present, and status."*
- **FR-1.26**: *"The resident list shall offer the actions: remove member, set `moved_out`,
  reactivate, and share or rotate the join code. **Two-tier removal (U-27, decided 2026-09-16,
  incorporated here 2026-09-17):** `moved_out` is the regular path for an actual move-out — votes
  and history are kept. 'Remove' is final, requires typing the exact display name to confirm (not
  a plain click), and is meant specifically for a person who joined falsely or maliciously via the
  join code — not for real move-outs."*
- **FR-1.27** *(Revised 2026-09-17)*: *"The resident list and its actions shall be fully available
  to administration and to a profile with moderator rights (full parity — the same rows, the same
  actions), and not reachable at all — by any route — by a profile without moderator rights."*
- **FR-1.28**: *"The resident list shall be a screen distinct from the round participant list
  (FR-1.19); neither shall link to the other's data."*
- **FR-1.29**: *"When administration is the only member of the household, the resident-list screen
  shall lead with the join-code action instead of displaying an empty list."*
- **FR-1.30**: *"Every removal, `moved_out` and reactivation on the resident list shall be recorded
  as an append-only audit entry naming both the account and the acting profile."*
- **FR-1.31** *(New 2026-09-17, U-30)*: *"Every resident (any profile with an active
  `ResidentProfile`, moderator rights or not) shall be able to see a read-only list of the
  household's current members — `status = active` only, no `moved_out` or `prepared` entries —
  showing display names only, no actions, no contact detail, no join dates. This is a screen
  distinct from both the administration resident list (FR-1.25–FR-1.30) and the round participant
  list (FR-1.19); none of the three shall link to either other's data."*

**Rooms**

- **FR-1.9**: *"The system shall allow a moderator to create, rename and remove rooms within the
  household."*
- **FR-1.10**: *"Each room shall have exactly one state from: `planned`, `open`, `promised`,
  `occupied`, `on_hold`, `not_available`."*
- **FR-1.11**: *"Changing one room's state to `occupied` shall not change the state of the casting
  round or of any other room."*
- **Room renaming** *(resolved by Clarifications, Session 2026-09-17 — not present in the source
  requirements packet, which left it open per its §8)*: A moderator may rename a room at any time,
  regardless of round state or whether votes already reference it — a room name is a label, not a
  scoring input (C-1.3). Each rename is recorded as an `ActivityEvent` entry so residents can see
  that the room was renamed.

**Casting round**

- **FR-1.12**: *"The system shall allow a moderator to create a casting round in state `draft` and
  select which rooms it covers."*
- **FR-1.13**: *"A casting round shall have exactly one state from: `draft`, `open`, `paused`,
  `closed`, `archived`."*
- **FR-1.14**: *"On the transition `draft → open`, the system shall record one round-participation
  entry per eligible resident profile, each marked as originating from the opening snapshot, and
  each carrying whether that profile may vote."*
- **FR-1.15**: *"On the transition `draft → open`, the system shall store a copy of the voting
  rules in force at that moment: the four rating weights, the quorum share, the hidden-results
  setting, and the favourite-budget settings."*
- **FR-1.16**: *"FR-1.14 and FR-1.15 shall take effect together with the state change, or not at
  all."*
- **FR-1.17**: *"The round-participation entries shall be the denominator for all participation
  and quorum displays for that round."*
- **FR-1.18** *(Revised 2026-09-17 — automatic, not moderator-gated)*: *"The system shall add a
  resident to every currently `open` round automatically, the moment that resident becomes
  `active` (claims their profile) — marked as `joined_after_open` rather than from the snapshot. A
  moderator may additionally add a resident by hand for correction cases the automatic path
  missed (marked `added_manually`), but the automatic path is the default, not a fallback for it."*
- **FR-1.19**: *"All residents taking part in a round shall be able to see a list of the round's
  participants, showing names only."*
- **FR-1.20**: *"The system shall record every casting-round and room state change as an
  append-only audit entry naming both the account and the acting profile."*

**Procedure lock**

- **FR-1.21**: *"While any casting round of the household is `open`, the system shall reject
  changes to the rating weights, the favourite-budget factor, the quorum share and the
  hidden-results setting."*
- **FR-1.22**: *"If such a change nevertheless occurs through an administrative path, the system
  shall record it as an audit entry and display it as a notice on the affected round."*

**Administration boundary**

- **FR-1.23**: *"An account acting without an active resident profile shall reach household
  administration only — rooms, members, join code, procedure rules, retention — plus a
  `CastingRound`'s identity and lifecycle only: existence, `title`, `status`, `room_ids`,
  timestamps and retention fields. It shall not reach anything derived from `Application` —
  explicitly including counts, participation, score or ranking — and shall not reach
  `Application`, `Slot`, `Appointment` or `CastingNote` at all."* (Source: S-50, as narrowed by
  ADR-014.)
- **FR-1.24**: *"Two exceptions to FR-1.23 remain available to administration: retention actions,
  and producing a subject-access export without displaying its contents."*

### Key Entities *(include if feature involves data)*

This spec does not restate schema — see `docs/domain/` (erläuternd) and the frozen
`docs/04-Domaenenmodell.md` (hash-locked; line-number citations permitted only there per the
constitution's Principle VI) for full field lists. Named here only to the extent needed to read
the user stories above:

- **Household / Account**: the registering entity (FR-1.1); never occupies a resident profile
  itself (FR-1.5, ADR-013).
- **ResidentProfile**: one per household member taking part in casting; display name unique among
  non-`moved_out` profiles (FR-1.4); status includes `moved_out`/reactivated (FR-1.26).
- **Membership**: carries voting eligibility (`is_resident`) and role as independent attributes,
  plus individually grantable permissions (FR-1.8, C-1.3).
- **Room**: one of six states (FR-1.10), independent of round state (FR-1.11).
- **CastingRound**: one of five states (FR-1.13), deliberately thin per C-1.2 — no round-level
  process-phase states.
- **RoundParticipation**: one row per profile per round, sourced from the opening snapshot,
  automatically upon claiming a profile while a round is open, or added manually by a moderator as
  a correction (FR-1.14, FR-1.18); the quorum/participation denominator (FR-1.17).
- **settings_snapshot**: the frozen copy of voting rules taken at `draft → open` (FR-1.15); a copy,
  never a reference (C-1.1) — consumed later by F5's score function.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of household registrations with a missing email or password are rejected with
  the specific missing field named — zero silent failures (AC-1.1).
- **SC-002**: 100% of round-opening operations that snapshot voters and freeze settings do so
  atomically — a failure at any point during opening leaves zero partial round-participation
  entries and zero partial frozen-settings records (AC-1.10, FR-1.16).
- **SC-003**: A frozen round's evaluation is unaffected by 100% of subsequent changes to the
  household's live voting-rule settings, verified for every one of the four rating weights, the
  quorum share, the hidden-results setting, and the favourite-budget settings (AC-1.9, C-1.1).
- **SC-004**: Zero routes exist through which a profile without moderator rights can reach the
  resident list, and zero routes exist through which a profile-less administration session can
  reach an application, a vote, a slot, an appointment, a casting note, or anything derived from
  `Application` — a profile-less session is limited to a casting round's identity/lifecycle fields
  only (AC-1.21, AC-1.16, ADR-014).
- **SC-005**: 100% of casting-round, room, and resident-list state changes produce an audit entry
  naming both the acting account and the acting profile (AC-1.19, AC-1.23).

## Assumptions

- **Default round-opening permission**: `docs/backlog/requirements/F1-requirements.md` §8 leaves
  the default assignee of the "open a round" permission (FR-1.8) unspecified but recommends: *"the
  household account's own resident profile holds it initially, and it is grantable from there."*
  Adopted as-is — a clear, reasoned recommendation from the maßgeblich source, not an invented
  default.
- **Synthetic data only**: per A-1.4, this slice runs on synthetic data; no data-processing
  agreement, privacy-notice page, or retention automation is required for this feature to be
  built. Those gate the first real household (v0.2).
- **One active round at a time**: per A-1.1, parallel rounds exist at the data level for a v2
  edge case (the landlord persona) but are deliberately never surfaced in this slice's UI
  (EC-1.5).
- **Small room counts**: per A-1.3, room count is single digits, so no pagination, bulk import, or
  hierarchy is needed.
- **Out of scope** (per `docs/backlog/requirements/F1-requirements.md` §1 and
  `docs/backlog/features/F1-open-a-casting-round.md`): room plans, floor plans, rent, tenancy
  agreements; organisations above households; SSO; ownership transfer as its own mechanism; role
  hierarchies or user-defined roles; parallel rounds offered in the UI; anything about
  applications, votes, or scheduling (those are F3–F5).
- **Room renaming after votes exist**: resolved via `/speckit-clarify` (see Clarifications, Session
  2026-09-17) — renaming stays unrestricted at any round state, matching the source's own lean (a
  room is a label, not a scoring input), plus one addition beyond that lean: each rename is now
  recorded as an `ActivityEvent` for resident visibility.
