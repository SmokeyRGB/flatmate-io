# Quickstart: Validating F1 — Open a Casting Round

Proves the four user stories in `spec.md` hold, once implemented. Not a build guide — see
`tasks.md` (from `/speckit-tasks`) for implementation steps.

## Prerequisites

- F0 merged (`src/db/session-context.ts`, `src/modules/{casting,audit}`, the migration chain) —
  F1 extends it, doesn't replace it.
- Supabase project `flatmate-io` (`cjinhzzvjryojvhngjjn`, `eu-west-1`), transaction-mode pooler,
  `{ prepare: false }` — unchanged from F0's `quickstart.md` §prerequisites.
- Supabase Auth **admin** API key available server-side only (never in a browser bundle) — F1 is
  the first feature to actually call it (Research §2).

## 1. Household registration and fixed identity (US1, FR-1.1–FR-1.7, AC-1.1–AC-1.6)

```bash
vitest run tests/unit/identity
vitest run tests/integration/policy/household-scoping    # extended: Account/Membership rows too
vitest run tests/integration/raw-sql/household-scoping
```

**Expected**: registration with an empty email or password is refused and names the missing field
(AC-1.1); the shared-address notice renders before any submit action fires (AC-1.2, a UI check —
see manual step below); a resident profile created from the household account never becomes that
account's own acting identity (AC-1.3); a session's `acting_profile_id` is fixed at creation and
has no update path — the guarded test for this is **G-D14**, moving from `pending` to
`implemented` in `test/guarded.manifest.json` as part of this feature, not before.

```bash
grep -rn "acting_profile_id\s*=" src/modules/identity/ | grep -v "WHERE\|where("
```

**Expected**: no output outside the one INSERT that creates a `Session` row — any other assignment
is the ADR-013 violation G-D14 guards against.

**Manual UI check** (AC-1.2, "visible without scrolling or interaction" is not mechanically
testable from a unit test): open the registration route and confirm the shared-address notice
renders above the fold with no scroll or interaction required, at the smallest supported viewport
per `docs/09-Design-System.md`.

## 2. Rooms with independent state (US2, FR-1.9–FR-1.11, AC-1.7)

```bash
vitest run tests/unit/casting/room-transitions.test.ts
```

**Expected**: all six states exist after migration; setting room A to `occupied` in a household
with an open round covering A, B, C leaves the round `open` and B/C's states untouched (AC-1.7);
removing a room while a round covering it is `open` is refused (EC-1.6), `not_available` succeeds
in its place.

## 3. Opening a round: atomic snapshot + frozen rules (US3, FR-1.12–FR-1.22, AC-1.8–AC-1.14)

```bash
vitest run tests/integration/policy/round-open-atomicity.test.ts
vitest run tests/unit/casting/quorum-denominator.test.ts
```

**Expected**: opening a round with 7 eligible residents produces exactly 7
`RoundParticipation` rows marked `source = snapshot_at_open` (AC-1.8); changing
`HouseholdSettings.quorum_share` after opening does not change the now-`closed`-over
`settings_snapshot` value the open round reads (AC-1.9); a forced mid-open failure (simulated) — a
transaction rollback test — leaves the round in `draft` with zero `RoundParticipation` rows and no
`settings_snapshot` (AC-1.10, FR-1.16); a resident joining after an open round claims their
profile is added automatically, marked `joined_after_open`, growing the denominator immediately —
not gated on a moderator (AC-1.11/AC-1.12, revised 2026-09-17 — see `spec.md`'s Clarifications);
`addResidentToRound` remains as a moderator's manual-correction fallback, marked `added_manually`.
Attempting to change any of the four locked
settings while a round is `open` is refused and the error names the open round (AC-1.13); the same
change forced through an administrative bypass path is recorded as an `ActivityEvent` and
surfaces as a notice on the round (AC-1.14).

```bash
vitest run tests/integration/policy/round-visibility-household-account.test.ts
vitest run tests/integration/raw-sql/round-visibility-household-account.test.ts
```

**Expected**: a profile-less (household-account) session reads `id, title, status, room_ids,
opened_at, closed_at, phase_deadline_at`, retention fields — and nothing derived from
`Application` — for a round it can otherwise see (ADR-014). This is guarded test **G-D15**, moving
from `pending` to `implemented`. Both the policy-layer call and the raw-SQL query against the base
`casting_round` table (not the admin view — see `research.md` §3) must independently confirm no
`Application`-derived value is readable.

## 4. Resident list and the administration boundary (US4, FR-1.23–FR-1.30, AC-1.16–AC-1.23)

```bash
vitest run tests/integration/policy/resident-list-access.test.ts
vitest run tests/integration/policy/resident-list-audit.test.ts
```

**Expected**: administration and a moderator profile see identical full access — list plus
set-`moved_out`/typed-confirmation-`remove`/reactivate/join-code actions (AC-1.20, revised
2026-09-17 — full parity, U-30); a non-moderator profile's request is refused by every route
tried, not just the primary one (AC-1.21); a single-member household's resident-list screen leads
with the join-code action instead of an empty list (AC-1.22); every removal/`moved_out`/
reactivation writes an `ActivityEvent` naming both account and acting profile (AC-1.23).

```bash
vitest run tests/unit/identity/current-household-members.test.ts
```

**Expected**: a resident (any active profile) reads the reduced "who lives here" view (FR-1.31,
screen B5) — current (`active`) members' display names only, no actions, no contact detail, no
join dates; a profile-less session is refused.

```bash
vitest run tests/integration/policy/admin-boundary.test.ts
```

**Expected**: a profile-less session's request for `Application`, `Vote`, `Slot`, `Appointment`,
or `CastingNote` by any route is refused (AC-1.16) — none of these tables exist yet in this repo
(F3–F5), so this test asserts the *route/policy* refusal for the entities that do exist
(`CastingRound` is the one partial exception, governed by §3 above, not this boundary) and is
re-run against each new table as F3–F5 land, per the constitution's "cite, don't restate": this
quickstart does not restate FR-1.23's full entity list, `spec.md` already does.

## 5. Full gate

```bash
bash tools/check-refs.sh --quiet
npm run verify
```

**Expected**: both exit `0`. `npm run verify`'s guarded-tests check confirms `test/
guarded.manifest.json` shows **G-D14** and **G-D15** as `implemented` with real test files (not
just flipped by hand — the check reads the same file the CI gate does), and that no
`[GUARDED]`-marked test carries `.skip`/`.only`.
