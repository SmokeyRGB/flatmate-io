## Context

See proposal.md for why. The plan and the human's decisions (Q-1…Q-8, the Q-5 addendum) are in
`~/.claude/plans/f4-screen-and-vote.md`; this design turns Part 3 §1 into decisions and corrects
one of them (D5 there, D3 here) against `docs/domain/kontextgrenzen.md` §4.

What exists and is reused, not rebuilt (all on `main` = `3401c94`):
- **Rounds.** `openRoundTx` is today's **only** writer of `casting_round.status` (draft → open,
  `FOR UPDATE`). It freezes `settings_snapshot = {scaleWeights, favoriteBudgetFactor,
  hideResultsUntilVoted, quorumShare}` and snapshots `round_participation` with `can_vote =
  membership.is_resident`. No code path pauses, closes or archives a round, and **nothing writes
  `round_participation.removed_at` or `can_vote` after insert**. A partial unique index keeps one
  active participation per (round, profile).
- **`can_vote` is always `true`, and no path makes it `false`** (human confirmation 2026-09-30:
  there is no scenario, and likely never will be, in which a resident has no voting right).
  - ADR-013 plus the CHECK `membership_resident_pairing` (`drizzle/0020`) make `is_resident =
    (resident_profile_id IS NOT NULL)`.
  - Only profiles get participations, and the household account has none.
  - All three writers set `true`: `openRoundTx` copies `is_resident`, the auto-join trigger, and
    `addResidentToRound`.
  - Nothing updates the column.

  The column and its check stay, because `docs/domain/invarianten.md`'s `can_vote` formula
  requires *„p.can_vote = true"* and openspec may not silently redefine it. Every test of
  `can_vote = false` is therefore an **invariant guard** on a state that only owner SQL can build,
  not a regression test. AC-4.14's reachable cases are a removed participation and a voter who
  moved out. A register row records the finding (task 1.3).
- **Which eligibility refusals are reachable in v0.1.**
  - `removed_at` has no writer either, so a removed participation is an invariant guard too.
  - A moved-out voter loses their membership and their sessions in the same transaction
    (`revokeMembershipForProfileTx`). A stale context is therefore refused by
    `assertAccountCanVote` first (D5).
  - The trigger's profile check (D6 step 4) is reachable only by a vote **in flight** while the
    move-out commits (task 6.4), or by raw SQL.

  Tests are labelled accordingly (pre-mortem H4).
- **Profile status writers.** `removeMember`, `setMovedOut`, `reactivateMember` and
  `transitionResidentProfileStatus` UPDATE `resident_profile` (a row lock) and, for a claimed
  profile, revoke or restore the membership in the same transaction.
- **Application writers.** `captureApplication` (membership `FOR SHARE` → round `FOR SHARE`),
  `updateApplication` and `transitionApplication` (membership `FOR SHARE` → application `FOR
  UPDATE`). The pairing trigger `application_round_same_household` (0025) locks the round `FOR
  SHARE`. `casting_round_keeps_applications` (0026) guards round deletion. Nothing sets
  `application.deleted_at`, and F3 change 4 drops that column, so **no new read or trigger names
  it** (F3 change 3 D1).
- **Start.** `getStartOverview` computes T-5 in casting with a `notVotedByViewer()` stub (`TRUE`).
  `dashboard-view.ts` owns `pendingVoteCount`/`shouldOpenScreening`. `/casting` redirects to
  `/casting/screening` while something awaits, and both pages are placeholders.
- **Patterns.** `ProfileRequiredError` refuses before any query (G-D15). The 0018 RESTRICTIVE
  policy uses `nullif(current_setting('app.profile_id', true), '')`. 0025 has the non-definer
  trigger with `FOR SHARE` and a named constraint. Transaction-taking `...Tx` helpers serve cross-module
  calls (`insertCapturedApplicationTx`; hazards file, "One pooled connection per call chain").
  `SubmitButton` has a `pending` override. `<details>` is used for the avatar menu.

## Goals / Non-Goals

**Goals:**
- The vote rules hold in the database for every writer, and the repository only maps them to
  typed codes. The rules are round open, eligible voter, votable and paired application, not the
  voter's own application, and the voter's own profile.
- One definition of "awaiting my vote", used by the deck and by T-5.
- Deliberation never joins casting tables in SQL, and casting never imports deliberation.
- A C1 that reads well in the pitch: one card, four buttons, a deck that moves.

**Non-Goals:**
- Withdrawal, vote ActivityEvents, digit shortcuts, B1's acknowledgement (change 2).
- Who may **read** other residents' votes: V-1, `hideResultsUntilVoted` and G-D1 stay F5's. The
  database allows it household-wide for now; see Risks.
- Deleting votes with their application (F3 change 4), V-2 RLS (F3 change 6), telemetry.
- A round picker, a skip button, offline buffering (G-D11 stays `pending`).

## Decisions

### D1 · A `deliberation` module that owns `vote` and nothing else

`src/modules/deliberation/` holds three files:
- `schema.ts` (table, enums, policies);
- `repository.ts`, the only file there that touches the client;
- `scale-weights.ts`, a pure parser.

`drizzle.config.ts` gains its schema. **Why:** ADR-001 and `kontextgrenzen.md` put `Vote` in
deliberation. Parking it in casting would give casting a table it is not allowed to own, and would
later force a move of live data (SRP, one owner per table). **Alternative rejected:** a `vote`
table in `casting/schema.ts`. It is cheaper today, but a second migration and a boundary violation
later.

The navigation state machine is UI logic, not domain logic. It lives beside the screen as a pure
module, `src/app/(resident)/casting/screening/deck-state.ts`, and is unit-tested.

### D2 · Casting exports two self-guarding query ports; no statement crosses the boundary

`kontextgrenzen.md` §4 rule 1: *„Ein SQL-Statement fasst nie Tabellen zweier Kontexte an. Lesen
über die Grenze geht über einen **Query-Port**, der ein DTO liefert."* Two new exports in
`casting/repository.ts`, both taking the caller's `tx`, so one pass reads in one transaction on one
connection:

- **`listVoterRoundsTx(tx, context, { roundId?: string })`** returns `{ roundId, title, status,
  phaseDeadlineAt, createdAt, settingsSnapshot }[]`. These are the rounds in which the session's
  profile has an **active participation** (`removed_at IS NULL`) with `can_vote`, and its
  `resident_profile.status = 'active'`. Every predicate carries `household_id =
  context.householdId`. Ordered `created_at DESC`. Status is returned rather than filtered, so the
  deck can name a non-open state (AC-4.13). A `draft` round normally has no participations;
  `addResidentToRound` has no status check, so one can, which is harmless because the deck
  refuses it as `round_not_open`.
- **`listVoteCandidatesTx(tx, context, roundIds, { withCard: boolean })`** returns `{
  applicationId, roundId, createdAt, card? }[]`, where `card = { applicantName, age, messageRaw,
  attributes }`. These are the rounds' applications in `new`/`screened` with `became_resident_id IS
  DISTINCT FROM context.profileId`, ordered `created_at, id`. **The port re-applies D2's voter
  predicate itself**: a round id for which the viewer is no active voting participant contributes
  no row. So the port cannot leak card data to a caller that forgot the eligibility check
  (hazards: "Authorization lives in the repository function, not the route that happens to call it
  today"). Contact columns, `collected_from`, `source` and audit columns are **never selected**
  (Q-2).

Both throw `ProfileRequiredError` for a profile-less context before any query. Neither takes a
lock (D7 explains why reads don't need one).

- **Callers.** Both are `...Tx` primitives that trust the `context` they are given. The only
  caller is deliberation's repository, whose context comes from the session.
  `authorization-matrix.test.ts` gains the same "no `src/app` file calls it" assertion it already
  makes for `insertCapturedApplicationTx` (pre-mortem M9). Their `NOT_APPLICABLE_CASTING` reason
  names the tests that cover their visibility (6.5).
- **The personal-columns comments.** The comments at `APPLICATION_LIFECYCLE_COLUMNS` and
  `getOrganisationApplication` say that no other read returns an application's personal columns.
  They are updated to name `listVoteCandidatesTx` as the second, voter-gated one.
- **A boundary precedent, recorded rather than hidden** (pre-mortem M10). The voter predicate joins
  `resident_profile`, an identity table, inside casting SQL, and so strictly breaks §4 rule 1.
  Casting already does this:
  - `getRoundParticipants` joins `resident_profile`;
  - `openRoundTx` joins `resident_profile` and `membership`.

  The import direction casting → identity is allowed. Routing one status predicate through an
  identity port would cost a round-trip and a second copy of the "active" rule, for no gain (YAGNI,
  DRY). Task 1.3 files a register row, so that a later context split finds all three places. The
  trigger (D6) is covered by §4's documented migration exception.

**Alternative rejected:** one SQL with `NOT EXISTS (SELECT … FROM vote)` inside casting, as in the
plan's D5 and start-screen D9. It breaks rule 1 and makes casting import deliberation's table,
against *„`casting` darf nicht `deliberation`"*. The cost of the port is a second statement per read.

### D3 · Deliberation owns "awaiting my vote", once

A private `awaitingVoteTx(tx, context, roundIds, { withCard })` in `deliberation/repository.ts`
does two steps:
1. It calls `listVoteCandidatesTx`.
2. It removes every candidate for which `vote` holds a row with `resident_profile_id =
   context.profileId AND stage = 'invite' AND withdrawn_at IS NULL AND household_id =
   context.householdId` (one query, `application_id = ANY(...)`).

Two exports build on it:
- **`getAwaitingVoteCounts(context): Promise<Map<string, number>>`**. A profile-less context gets
  an empty map with **no query** (start spec, "No application-derived number for the household
  account"). Otherwise one transaction runs `listVoterRoundsTx` (open rounds only), then
  `awaitingVoteTx` (ids only, `withCard: false`), and counts per round.
- **`getScreeningPass(context, roundId: string | null): Promise<ScreeningPass>`** (D4).

**Start changes shape:**
- `getStartOverview` loses the grouped T-5 query and `notVotedByViewer`, and
  `StartOpenRound.voteCount` is removed.
- The dashboard, `/casting` and the screening page call `getAwaitingVoteCounts` beside it.
- `buildDashboardView(overview, awaitingVotes, organisationTaskCount, access, now)` and
  `pendingVoteCount(overview, awaitingVotes)` take the map.
- `taskViewFor` links to `/casting/screening?round=<roundId>` (start spec, "Two rounds").

The two reads run in separate transactions (`Promise.all`, never nested). A round opening or
closing between them only changes which map key is read, and a missing key counts 0.

**Why here and not in casting:** "voted" is a fact about a `Vote`. Whoever owns the vote table
owns the predicate (DRY). The deck and T-5 cannot drift because both call `awaitingVoteTx`.

### D4 · `getScreeningPass` decides the screen's state; the client holds the deck

The result is a union:
- `{ kind: "deck", round: { id, title }, weights: ScaleWeights, cards: Card[] }`;
- `{ kind: "empty" }`;
- `{ kind: "refused", reason: "not_eligible" | "rules_invalid" }`;
- `{ kind: "refused", reason: "round_not_open", status }`.

Order, in one transaction:
1. A profile-less context throws `ProfileRequiredError` before any query.
2. `roundId === null`: read `listVoterRoundsTx(open)`, then take the newest round whose awaiting
   set is non-empty. If there is none, the result is `empty`. This is also what a non-participant
   gets (EC-4.3, V1.1: nothing about any round is shown).
3. With a `roundId`: a malformed id or no voter row gives `not_eligible`, **without the title**.
   Status ≠ `open` gives `round_not_open` with its status.
4. `parseScaleWeights(settingsSnapshot?.scaleWeights)` must yield exactly the four keys `no,
   rather_not, good, definitely`, each a finite number ≥ 0. Otherwise the result is
   `rules_invalid`, with no fallback (EC-4.11). The weights come only from the round row read in
   step 2 or 3, never from `household_settings` (C-4.4, AC-4.9).
5. `awaitingVoteTx(withCard: true)` for that round. An empty result is `empty`.

The page passes the result to a client component that keeps the deck for the rest of the pass
(FR-4.4: fixed at pass start, and a reload is a new pass). Nothing about the pass is stored (G-J4).
Every write is re-validated by D5 and D6.

**Alternative rejected:** a server-side pass record. It makes AC-4.4 a storage problem for no
gain, since A-4.1 says the deck is low tens of cards.

### D5 · `castVote` writes once; the trigger decides; the repository maps

`castVote(context, { roundId, applicationId, value })`:
1. A profile-less context throws `ProfileRequiredError` before any query (G-D15).
2. `roundId`/`applicationId` must be UUIDs, and `value` one of `VOTE_VALUES`. Otherwise it throws
   `VoteError("invalid_input")`, still without a query (pre-mortem M1: input is validated before
   step 3, which queries).
3. `assertAccountCanVote(context, context.accountId)`, the FR-1.7 check that "every vote-casting
   route calls". It is outside the transaction, never nested. Its `HouseholdAccountCannotVoteError`
   (no live membership: a stale context after a move-out or removal) is caught and rethrown as
   `VoteError("not_eligible")`, so the action never sees it raw (pre-mortem H4).
4. One `withSessionContext` runs one statement:
   `INSERT INTO vote (household_id, round_id, application_id, resident_profile_id, stage, value)
   VALUES (ctx.household, roundId, applicationId, ctx.profile, 'invite', value)
   ON CONFLICT (application_id, resident_profile_id, stage)
   DO UPDATE SET value = EXCLUDED.value, withdrawn_at = NULL`.
   `updated_at` is set by the trigger (D6).
5. The trigger's refusals map by constraint name to `VoteError` codes (table in D6).
   - The constraint name and the detail are read from `err.cause.constraint_name` and
     `err.cause.detail`, the postgres.js error Drizzle wraps, the way `toApplicationWriteError`
     reads them.
   - `vote_round_open` carries the status in `DETAIL`. It becomes `VoteError.roundStatus` only if
     it is one of the round-status enum values, and is dropped otherwise.
   - **Any other error is wrapped** in `VoteWriteError`, whose message names the SQLSTATE and
     constraint only, and whose `cause` is kept. Drizzle's "Failed query … params" message holds
     the vote value (a personal field) and the ids, so it must never reach a log or the client
     (pre-mortem M5; capture D4: "No value leaves in an error").

The server action `screening/actions.ts` resolves the session itself, never trusts client
identity, calls `castVote` and returns `{ ok: true }` or `{ ok: false, code, roundStatus? }`. Codes
only, never applicant data. It calls **no** `revalidatePath`, and the client calls no
`router.refresh()`: a re-render with a fresh deck would break FR-4.4 (pre-mortem M13).

**Why the repository does not pre-check round or eligibility:** the trigger already decides both
under lock. A pre-check would be a second copy of the rule that can drift from it, and a break
test would then fail on only one of the two (PR #41 lesson). This is DRY by design. Only the
profile refusal comes early, because it must issue no query at all.

### D6 · Migration `0028_vote.sql`: table, policies and the `vote_guard` trigger

**Table.** `vote(id uuid pk default gen_random_uuid(), household_id uuid not null, round_id uuid
not null, application_id uuid not null, resident_profile_id uuid not null, stage vote_stage not
null, value vote_value not null, created_at timestamptz not null default now(), updated_at
timestamptz not null default now(), withdrawn_at timestamptz)`. Enums: `vote_stage (invite,
offer)` and `vote_value (no, rather_not, good, definitely)`. `UNIQUE (application_id,
resident_profile_id, stage)` is the only uniqueness (C-4.5). There is an index on `household_id`
and one on `(round_id)`. There is no weight column (spec, "no derived weight"). There are no
foreign keys, like every table here.

**Policies**, each with `DROP POLICY IF EXISTS` first, and mirrored as `pgPolicy` in `schema.ts`
(the rls-coverage lint). The profile predicates are **imported** from `src/db/rls-predicates.ts`
(`PROFILE_PRESENT`), never re-typed, because *"the `nullif` is the part a copy loses"* (that
file's own comment; pre-mortem M19). A new `OWN_PROFILE` export sits beside it: `resident_profile_id
= (select nullif(current_setting('app.profile_id', true), '')::uuid)`. It is wrapped in `(select
…)` for the RLS performance advisor, and an unset or empty setting yields NULL, so it fails closed.
- `vote_household_isolation`: PERMISSIVE, FOR ALL, `HOUSEHOLD_MATCH`, the same as every table.
- `vote_requires_resident_profile`: RESTRICTIVE, FOR ALL, `PROFILE_PRESENT` (G-D15 (b)).
- `vote_own_profile_insert`: RESTRICTIVE, FOR INSERT, `WITH CHECK (OWN_PROFILE)`.
- `vote_own_profile_update`: RESTRICTIVE, FOR UPDATE, `OWN_PROFILE` as `USING` and `WITH CHECK`.

SELECT and DELETE stay household-plus-profile. F5 decides who reads others' votes. F3 change 4's
`deleteApplication` must delete other residents' votes, which an own-only DELETE policy would
forbid. The test teardown also deletes with a synthetic profile id (tests/helpers/identity.ts).

**Ordering against RLS** (pre-mortem M4): BEFORE row triggers run **before** the policies' `WITH
CHECK`, so a raw write the trigger refuses never reaches a policy. Which layer answers depends on
the case:
- a raw INSERT naming another profile gets 42501 only when that profile is an eligible
  participant; otherwise the trigger answers with 23514;
- a profile-less raw INSERT is refused by trigger step 5, which cannot see the application under
  0018, as `vote_application_paired`;
- the profile policy's own test is the `count(*)`.

**`vote_guard()`** is `RETURNS trigger`, `LANGUAGE plpgsql`, **not** `SECURITY DEFINER`, and has
`SET search_path = pg_catalog, public`. It fires `BEFORE INSERT OR UPDATE ON vote FOR EACH ROW`.
It runs as the caller, so every read inside it is household-scoped by RLS, and the explicit
`household_id = NEW.household_id` predicates hold even for a caller that bypasses RLS.

On `INSERT … ON CONFLICT DO UPDATE` it runs **twice**:
1. BEFORE INSERT, on the proposed row, before conflict detection;
2. BEFORE UPDATE, after the existing vote row is locked.

The second run re-takes locks it already holds. In order:

| # | Check (locks in this order) | Refusal constraint → `VoteError` code |
|---|---|---|
| 0 | `INSERT`: normalise, don't trust. `NEW.created_at := clock_timestamp()`, `NEW.updated_at := NEW.created_at`, `NEW.withdrawn_at := NULL`. `UPDATE`: `(id, household_id, round_id, application_id, resident_profile_id, stage, created_at)` unchanged vs `OLD`, else refuse; then `NEW.updated_at := clock_timestamp()` | `vote_identity_immutable` → (bug; wrapped) |
| 1 | `casting_round` `WHERE id = NEW.round_id AND household_id = NEW.household_id FOR SHARE`: missing → | `vote_application_paired` → `not_found` |
| 2 | its `status <> 'open'` → (`DETAIL` = status) | `vote_round_open` → `round_not_open` |
| 3 | `round_participation WHERE round_id, resident_profile_id = NEW.resident_profile_id, household_id, removed_at IS NULL AND can_vote FOR SHARE`: missing → | `vote_voter_eligible` → `not_eligible` |
| 4 | `resident_profile WHERE id = NEW.resident_profile_id AND household_id AND status = 'active' FOR SHARE`: missing → | `vote_voter_eligible` → `not_eligible` |
| 5 | `application WHERE id = NEW.application_id AND household_id = NEW.household_id FOR SHARE`: missing, or `round_id <> NEW.round_id` → | `vote_application_paired` → `not_found` |
| 6 | `became_resident_id = NEW.resident_profile_id` → | `vote_not_own_application` → `own_application` |
| 7 | `state NOT IN ('new','screened')` → | `vote_application_votable` → `not_votable` |

Every refusal is `RAISE EXCEPTION … USING ERRCODE = '23514', CONSTRAINT = '<name>'`. The trigger
names no `deleted_at` column. F3 change 4 drops it, and a plpgsql body that names a dropped column
fails at run time, not at `DROP`.

Step 0 on INSERT ignores client- or raw-SQL-supplied timestamps and withdrawal. On the conflict
path, `EXCLUDED` then carries the normalised values, and the repository's `DO UPDATE SET` writes
only `value` and `withdrawn_at = NULL`.

**Relationships this trigger joins through, and what enforces them** (hazards, "The relationship a
predicate joins through must itself be enforced"):
- vote ↔ application ↔ round: step 5's `round_id` equality. It checks which rows pair up. One
  application has one round, because `application.round_id` is NOT NULL.
- vote ↔ participation: step 3. At most one active participation per (round, profile) exists,
  from the partial unique index `round_participation_active_pairing_idx`, so the lookup cannot be
  ambiguous.
- vote ↔ voter: the own-profile policies. Uniqueness is the vote's unique key, so there is one row
  per voter, application and stage.
- vote ↔ household: each step's `household_id` predicate plus the PERMISSIVE policy's `WITH
  CHECK`.
- **The parent side, enforced, not just named** (PR #39 lesson 1; pre-mortem M17):
  - **Application moved to another round.** `updateApplication` never exposes `round_id` or
    `household_id` (`CORRECTABLE_FIELDS`). The 0023/0025 pairing trigger, however, **accepts** a
    raw-SQL move to another round of the same household, which would leave its votes with a stale
    `round_id`. 0028 therefore adds a second, non-definer trigger, `application_keeps_votes`: BEFORE
    UPDATE OF `round_id, household_id` ON `application`, which refuses (`23514`, constraint
    `application_keeps_votes`) when the value changes and a `vote` row with `application_id =
    OLD.id AND household_id = OLD.household_id` exists. This is 0026's shape, applied one level
    down.

    It serialises with a vote because the UPDATE holds the application row lock while its trigger
    runs, and a concurrent vote waits at step 5 for that lock. If the vote committed first, the
    trigger's query (a fresh READ COMMITTED snapshot per plpgsql statement) sees it. It reads
    `vote` under RLS, and a profile-less session is already refused by 0018 before it gets there.
  - **Round deleted or re-homed.** A round cannot be deleted or re-homed while applications point
    at it (0026). A round with votes has applications, so it stays.
  - **Application deleted.** F3 change 4's `deleteApplication` deletes the application's votes in
    the same transaction, in D7's order (AC-3.16; Part 5 obligation). The cleanup-inventory test
    forces `vote` into the delete set.

**Statement order and re-runnability** (the migration-shape lint applies after 0017):
1. The enums, each in a `DO $$ … IF NOT EXISTS (pg_type) … CREATE TYPE … $$`. A new *type* may be
   used in the same transaction; only `ALTER TYPE … ADD VALUE` needs its own file.
2. `CREATE TABLE IF NOT EXISTS`, then `CREATE UNIQUE INDEX IF NOT EXISTS` and the indexes.
3. `ENABLE ROW LEVEL SECURITY`, then the policies.
4. `CREATE OR REPLACE FUNCTION vote_guard()` and `application_keeps_votes()`. Neither return type
   ever changes, so no `DROP FUNCTION` is needed.
5. `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`, for both.

The table is new and empty, so no statement changes data under a constraint.
`application_keeps_votes` is added while `vote` is empty, so it cannot refuse an existing row. It
has no `SECURITY DEFINER` and no `DROP COLUMN`. Its `DROP … IF EXISTS` statements are the kind the
agent already applied in 0025, so the agent may apply it (plan, "Human hand-offs: none").

### D7 · Serialization: every writer of the guarded state, pairwise

The trigger's `FOR SHARE` locks make each check-then-insert wait for any in-flight writer of the
state it read, and re-read that state's committed outcome. The writers of the guarded states:

| Guarded state | Writers in the codebase | Lock they take | Serialized with a vote because |
|---|---|---|---|
| `casting_round.status` | `openRoundTx` (draft→open); future pause/close/archive | `FOR UPDATE` on the row (the schema.ts obligation) | step 1's `FOR SHARE` conflicts with it; a vote either sees the new status or commits first (EC-4.4/4.5: then it stands) |
| participation `removed_at` / `can_vote` | none today; `openRoundTx`, auto-join (0010/0012) and `addResidentToRound` only **insert**, always with `can_vote = true` (Context) | an UPDATE's row lock | step 3's `FOR SHARE`. A future removal must UPDATE the row, never delete and re-insert. A `can_vote` writer is not expected to exist (human, 2026-09-30) |
| `resident_profile.status` | `removeMember`, `setMovedOut`, `reactivateMember`, `transitionResidentProfileStatus` | UPDATE row lock | step 4's `FOR SHARE`. A move-out committed first is seen, and one in flight is waited for |
| `application.state` / `became_resident_id` | `transitionApplication`, `updateApplication` (no state), `applyTransitionTx` | `FOR UPDATE` | step 5's `FOR SHARE` |
| `application.round_id` / `household_id` | no code path (`CORRECTABLE_FIELDS` excludes both); raw SQL only | UPDATE row lock | `application_keeps_votes` refuses while votes exist; step 5 waits on the row lock (D6) |
| `vote` row itself | `castVote`, and raw SQL | unique key + ON CONFLICT row lock | two casts on one key: the second waits for the first, then takes the UPDATE path, so the last writer wins (EC-4.6). Two different keys don't conflict |

**Lock order and deadlock argument** (corrected by pre-mortem H1). Postgres runs BEFORE INSERT
row triggers on the proposed row **before** conflict detection, and only then locks the existing
row and runs BEFORE UPDATE. So a vote's lock order depends on the statement:
- **the upsert, both paths:** round → participation → profile → application, all `FOR SHARE`, in
  the INSERT run of `vote_guard`. On the conflict path the existing vote row is locked next, and
  then the UPDATE run re-takes the same shared locks it already holds.
- **a plain `UPDATE vote`** (change 2's `withdrawVote`, or raw SQL) takes the vote row lock
  **first**, then the four shared locks in the UPDATE run.

Shared locks never conflict with each other, so a cycle needs an exclusive lock held on one of
these rows while waiting for another that the vote already holds. The exclusive writers today:
- `transitionApplication` holds the application exclusively and then only writes `activity_event`.
- The profile writers hold the profile, then membership and session, which a vote never takes.
- `openRoundTx` holds a `draft` round, and a vote on a draft round refuses at step 2. It reads
  profile and membership without locks.
- `application_keeps_votes` (D6) runs while its UPDATE holds the application row, and reads
  `vote` without locking.

So no cycle exists today. **Obligations, stated identically in the plan's Part 5, the 0028
header comment and the F4 packet's dependencies:**
- **F3 change 4 `deleteApplication`** locks the application `FOR UPDATE` **first**, then deletes
  its votes.
  - Against the upsert this is safe: the upsert waits at step 5 before it holds any vote row, and
    afterwards finds the application gone (`not_found`).
  - The reverse order (votes first) deadlocks: the upsert holds the application SHARE and waits
    for the deleted vote row, while the delete waits for the application.
- **Change 2 `withdrawVote`**, and every future repository `UPDATE vote`, reads the application
  `FOR SHARE` **before** touching the vote row, so it takes the application before the vote, as
  the upsert does.
- A **raw** `UPDATE vote` cannot be ordered. Against a concurrent delete it can deadlock, and
  Postgres aborts one side with 40P01. That is safe, since both are refused or retried and neither
  commits a half-state, and it is accepted.

**Reads take no locks.** The deck and the count are snapshots for display. Every write
re-validates under lock, so a stale card at worst produces a typed refusal.

### D8 · Entry paths for each invariant

| Invariant | Repository | Raw SQL as `app_runtime` | SECURITY DEFINER functions | Concurrent request | Test |
|---|---|---|---|---|---|
| voter = session profile | `castVote` uses `context.profileId` | own-profile policies | none writes `vote` (grep `drizzle/` for `SECURITY DEFINER`: join codes, login bootstrap, 0026). A definer would bypass the policies but not the trigger | n/a | raw-sql insert naming another **eligible** profile → 42501 (otherwise the trigger answers first, D6 "Ordering against RLS"); raw update of another's vote → 0 rows |
| round open | trigger step 2 | trigger | the trigger fires regardless of definer or RLS | step 1 `FOR SHARE` vs `FOR UPDATE` writers | repo + raw SQL for paused/closed/archived, asserting `round_not_open` + status |
| eligible voter | trigger 3/4 | trigger | same | steps 3/4 `FOR SHARE` | reachable: a vote in flight while a move-out commits (`holdTransaction`, 6.4) and raw SQL under a moved-out profile (6.2). Invariant guards (unreachable, Context): `removed_at` set, `can_vote=false`. A stale context after a move-out is refused by `assertAccountCanVote` (D5 step 3) |
| not own application | trigger 6; deck via the port predicate | trigger | same | step 5 `FOR SHARE` | repo + raw SQL (AC-4.3's DB half) |
| paired and votable | trigger 1/5/7; `application_keeps_votes` for the parent | trigger | same | step 5 | cross-round (voter participates in both rounds, else step 3 answers first), `invited`, a raw move of a voted application; cross-household is also held by RLS, so it is an invariant guard for step 5 |
| one per key | unique index | unique index | unique index | ON CONFLICT | `holdTransaction` two-writer test |
| no profile, no vote | early `ProfileRequiredError` | RESTRICTIVE profile policy for reads; a raw insert is refused by trigger step 5 first (`vote_application_paired`, D6) | — | — | count(*) = 0 with unset and `''` profile; raw insert asserts `vote_application_paired` |
| household isolation | `household_id` from context | PERMISSIVE policy | — | — | G-C7 pair `vote_via_policy`/`vote_via_raw_sql` |
| card data only to eligible voters | `listVoteCandidatesTx` re-applies the voter predicate | **not enforced** (V-2 RLS, F3 change 6, Q-1) | — | — | repo tests for a non-participant (a round built without their participation) and a moved-out profile called directly; `removed_at`/`can_vote=false` as invariant guards; register row |

**Sibling paths:**
- `withdrawVote` (change 2) is an UPDATE, so the trigger fires and a withdrawal in a paused round
  would be refused. Change 2 decides whether that is right, and changes `vote_guard` if not.
- Existing reads that return application personal columns: `getOrganisationApplication` and
  `listOrganisationApplications` (permission-gated), and now the port (voter-gated). No read
  returns vote rows except deliberation's own-vote filter.

### D9 · The screen: server page, one client deck, CSS motion, Pointer Events

- **`screening/page.tsx`** (server) does, in order:
  - it resolves the session and redirects a profile-less one (unchanged);
  - it reads `searchParams.round` (an array or a non-UUID counts as absent), then calls
    `getScreeningPass`;
  - it renders one of: the deck, the empty state „Nichts wartet auf dich" (with a link to Start),
    or a calm refusal naming the state (`round_not_open` uses the round-status labels in
    `de.status`), `rules_invalid` or `not_eligible`.

  `loading.tsx` becomes a card-shaped skeleton: a thin progress bar, one tall card, and a row of
  four button pills at the bottom.
- **Layout (mobile first):**
  - at the top, a thin **progress bar** filled to `n / N`, with the text „n von N" beside it, both
    exposed as one `role="progressbar"` with `aria-valuenow`/`aria-valuemax` and `aria-valuetext`
    „n von N";
  - then the card stack, which scrolls internally for a long message;
  - at the bottom, the four rating buttons **side by side in one row** (a 4-column grid, fixed to
    the bottom edge on mobile with safe-area padding). Each button stacks its icon above its label,
    so „Eher nicht" fits a quarter of a 360 px screen.
  - The back chevron and „(?)" sit in the top bar next to the progress.
- **`screening-deck.tsx`** (client) holds `deck-state.ts`'s reducer, `{ cards, index, ratings:
  Record<id, VoteValue>, pending: id | null, phase }`, with the actions:
  - `submitted(id)` sets `pending`. While `pending` is set, `back`, `forward` and a second
    `submitted` are no-ops. So ←/→ or a swipe during the round-trip cannot move the deck under the
    vote (pre-mortem M6).
  - `rated(id, value)` records the rating, clears `pending`, and moves to `indexOf(id) + 1`, **not**
    `index + 1`. When no card remains unrated it sets `phase = "done"`.
  - `failed(id)` clears `pending` and keeps the card.
  - `back()` stops at 0.
  - `forward()` works only if `ratings[cards[index].id]` is set and `index < N - 1`.
  - `dropped(id)` removes the card, clears `pending`, clamps the index, and sets `done` when the deck
    is empty or no unrated card remains. Otherwise the pass would stick at the last index.

  The reducer has no action that rates from a gesture, so a swipe maps to `back`/`forward` only.

  The deck is initialised **once** from the server's props (`useReducer`'s initialiser) and
  ignores later prop changes. Together with "no revalidation" (D5), that is FR-4.4.

  On `done` the client calls `router.push("/casting")`. The existing redirect then sends a
  resident with new arrivals into a fresh pass (AC-4.5).
- **Refusal codes in the client** (pre-mortem M7):

  | Code | Effect on the deck |
  |---|---|
  | `not_found`, `not_votable`, `own_application` | `dropped` — the card can never be rated again. `not_votable` is reachable in v0.1: a moderator moves the card `screened → invited` mid-pass |
  | `round_not_open` | ends the pass with the refusal view naming the state |
  | `not_eligible` | ends the pass with the refusal view |
  | `invalid_input`, or an unexpected failure | `failed` plus a calm inline message „Das hat nicht geklappt — nichts ist verloren. Nochmal?", with the card kept |
- **Rating buttons.** One `<form>` whose `onSubmit` runs `startTransition(castVoteAction)`, with
  four `SubmitButton`s.
  - `onSubmit` calls `preventDefault` and **returns early while `pending` is set**, since an
    implicit submit through an aria-disabled button is still a submit.
  - The tapped button gets `pending={pending === id && chosen === v}`, and the others get
    `disabled={pending !== null}`.
  - The form reads the submitter's value. So there is no plain submit button, and the
    pending-feedback lint holds.
  - The selected rating (on a card you went back to) gets the Design System's selected choice
    style (solid primary) **plus a non-colour signal**: `aria-pressed="true"` and a small check
    glyph (`Check`) beside the label. The level is thus never shown by colour alone (FR-4.19,
    pre-mortem M15).
  - The icons are lucide `X`, `ArrowDown`, `ArrowUp` and `Star`. The labels come from `de.ts`,
    with no numbers on the buttons.
- **„(?)" is a pop-over** (the spec's wording). It is the native HTML popover: a `type="button"`
  with `popovertarget`, labelled for assistive technology („Punkte der Stufen anzeigen"), and a
  `<div popover>` panel. The panel lists the four labels with `weights[v]`, „= dein Favorit"
  beside Unbedingt, and the non-linearity sentence. Light dismiss and Esc are native, and there is
  no JS state and no focus-trap code (YAGNI). If the typecheck lacks the attribute types, a
  one-line module augmentation is allowed, but no library.
- **Navigation:**
  - the ← and → keys, on `window` `keydown`, ignored with a modifier key, while the pop-over is
    open, or when the event target is an input or a textarea;
  - „Zurück" as a `type="button"` with text on `md:` and up, and an icon-only chevron with an
    `aria-label` below `md:`. Both are hidden at index 0.
  - **Swipe** uses Pointer Events on the top card only, `pointerType === "touch"`, and
    `touch-action: pan-y` so vertical scrolling stays native. After a 10 px slop the gesture
    counts only if `|dx| > 1.5 × |dy|`. While dragging, the card translates with the finger.
    Release past 25 % of the card width, or 80 px, triggers back/forward. Otherwise, or if
    `forward` is not allowed, the card springs back.
- **Animation.** The deck is a CSS grid that stacks cards in one cell. The next card sits beneath
  at `scale(.96)` with a slight offset. A `data-dir` attribute (`forward`/`back`) picks the
  keyframes: the leaving card slides out left and the next rises, and back reverses both. About
  220 ms, transform and opacity only. `@media (prefers-reduced-motion: reduce)` swaps the slide for
  a 150 ms opacity crossfade. The buttons, progress bar and „(?)" sit outside the animated
  element, so they never move. The classes live in `src/app/globals.css` next to the Design
  System tokens.
- **Strings.** All of them live in `de.ts` `screening`, replacing the placeholder keys: the four
  labels, `progress(n, total)`, the weights panel, the empty state, the refusals and the back
  labels. `casting` gets `rankingHeading` „Rangliste" and one sentence. No text evaluates a person
  (C-4.11), and no text mentions revising (C1 decision 2026-09-15).
- **`/casting`** keeps its redirect via `shouldOpenScreening(overview, awaitingVotes)` and renders
  the D1 shell: heading, one sentence, the back link.
- **One pass, one round, and a malformed snapshot.** With `roundId = null`, the newest awaiting
  round wins even when its snapshot is malformed (`rules_invalid`). An older valid round is then
  reachable through Start's per-round link. This is accepted: a malformed snapshot is itself a
  defect to fix, never a case to route around.

### D10 · Plumbing that the lints and the inventory test force

- **`VOTE_VALUES`** lives in a pure `src/modules/deliberation/vote-values.ts` (a readonly tuple
  plus the `VoteValue` type), imported by `schema.ts` for the enum, by the repository and by the
  client deck. So the client never imports `drizzle-orm/pg-core` or the schema (pre-mortem M11).
  `ScaleWeights`/`parseScaleWeights` stay pure in `scale-weights.ts`.
- `data-inventory.yml` gets a `vote` block with the table's context `deliberation`.
  `resident_profile_id` and `value` are personal (⚫, `personenbezogene-felder.md` rows 27/28).
  The purpose and legal basis follow the file's existing blocks for deliberation content, citing
  `06-Compliance-Anhang.md`. Retention is **180 days after `CastingRound.closed_at`**
  (`aufbewahrung.md`). The rest is technical.
- `HOUSEHOLD_SCOPED_TABLES` gets `vote`, **before** `application` in the CTE list (order doesn't
  matter for a one-statement CTE, but it reads as the dependency). `scripts/cleanup-demo-household.sql`
  deletes `vote` rows too. `undoRegisterHousehold` is untouched, because registration writes no
  vote.
- `test/guarded.manifest.json`:
  - `visibilityInvariants` gets `vote_via_policy` and `vote_via_raw_sql`, set to `implemented`
    only after both tests exist and pass;
  - G-D15's `testFiles` gets the vote profile-less test files (6.3), so the guarded-tests lint
    protects them (pre-mortem M12);
  - G-D1 and G-D11 stay `pending`.
- `authorization-matrix.test.ts` gets a third set-coverage block for `deliberation/repository.ts`.
  - `castVote` is a case that refuses the household account (`ProfileRequiredError`), and a plain
    resident who has **no** participation in a round built without them (`insertTestRound`, no
    participations). The result is `not_eligible`. A claimed member is otherwise a participant of
    every open round (snapshot plus auto-join; pre-mortem M3).
  - The reads are listed as not applicable, with their reasons.
  - The two new casting ports go into `NOT_APPLICABLE_CASTING` as reads, each naming its covering
    test, plus the "no `src/app` caller" assertion (D2).
- Comments: `assertAccountCanVote` "(F3)" becomes F4, `castVote` (handover 5g). The `removeMember`
  header comment about U-27's vote purging ("has nothing to act on yet") becomes: votes now exist
  and are kept; excluding a removed member's votes from the score is F5's (register row, task
  1.3). `APPLICATION_LIFECYCLE_COLUMNS` and `getOrganisationApplication` get the D2 note.
- `docs/`: the V1.1 corrections (proposal, first bullet) land as **the first commit**, before any
  code. They include F3's forward contract (`F3-requirements.md` AC-3.16: "is tested in F4" →
  tested with F3 change 4's `deleteApplication`, in D7's order). `check-refs.ts` must stay green.
  No frozen file changes, and `docs/` gets no pointer into `openspec/`: the dependency text cites
  `docs/` and the guardrails only, never this design.

## Risks / Trade-offs

- **[V-2 at the database is not enforced]**: any `app_runtime` statement can read every
  application of the household. → Human decision Q-1: repository plus trigger now, RLS in F3
  change 6, and a register row due before the first real household. The demo data is synthetic,
  and `app_runtime` credentials live only on the server.
- **[Other residents' votes are readable and deletable household-wide at the database]** (SELECT
  and DELETE policies). → No code path reads or deletes them. F5 (V-1, hidden results, G-D1) and
  F3 change 4 (the delete path) own the rule. A register row is added, the same gate as Q-1.
- **[The trigger is the only place the vote rules live]**: a bug there is a bug everywhere. →
  Every refusal has a repository test and a raw-SQL test that asserts the constraint name.
- **[Database-side breaks need the owner]** (pre-mortem H2). `app_runtime` owns nothing (G-C2,
  `table-ownership.test.ts`), and the suite has no owner connection, so a break inside a test
  transaction is impossible. → The breaks of the trigger, the policies and the `FOR SHARE` locks run
  **as owner through the Supabase MCP on `flatmate-io-dev`**, with the human told first:
  1. apply the broken `CREATE OR REPLACE` or `DROP POLICY`, committed, so the vitest run sees it;
  2. run the one test file and record the failure;
  3. restore by re-running 0028's own statement;
  4. verify the restore by comparing `md5(pg_get_functiondef('vote_guard'::regproc))` with the
     value taken before the break, and `pg_policies` for `vote`.

  The window is one test file (~1 min). Dev is shared, but nothing else writes votes. **No
  database-side break may be "argued" instead of run.**
- **[Moving T-5 out of `getStartOverview` breaks its tests and callers]**. → They are rewritten in
  the same task. The count's assertions move to a deliberation test. Their cases (f5) V-1
  walk-back and (g) are ported explicitly. The start-screen "voteCount = raw count" pin is deleted
  with a note, since F4 is the change it was waiting for. The new definition includes rows with
  `deleted_at` set, which (g) excluded. Nothing sets `deleted_at` (F3 change 3 D1), so (g) is
  ported as a note, not a test.
- **[A tap waits a round-trip (~150–400 ms to EU dev)]**. → Pending state on the button. The pitch
  runs on dev, so this is accepted rather than adding an optimistic path with rollback.
- **[Swipe feel on real phones]**. → Thresholds are constants in the deck component, tuned in the
  walkthrough, and the chevron always works.
- **[Deadlock with F3 change 4's delete or change 2's withdraw]**. → See D7's obligations.

## Migration Plan

1. Write `0028` with `drizzle-kit generate` for the table and policies. Check that the generated
   SQL holds **only** vote objects, and stop on unrelated drift. Then hand-edit it to be
   re-runnable and add both triggers. The journal and snapshot come from `generate`.
2. Before applying, confirm that no other open branch or PR carries a migration (`gh pr list`, `git
   branch -r`), and tell the human.
3. Apply to `flatmate-io-dev` through the Supabase MCP `apply_migration`, never production.
4. Check as owner that:
   - the table exists, with all four policies;
   - `vote_guard` fires on INSERT and UPDATE;
   - `application_keeps_votes` exists on `application`;
   - `app_runtime` holds INSERT/SELECT/UPDATE/DELETE on `vote` (default privileges depend on which
     role applies the migration).
5. **Rollback:** the table is new. The human runs this in the SQL editor: `DROP TRIGGER
   application_keeps_votes ON application; DROP FUNCTION application_keeps_votes(); DROP TABLE
   vote; DROP FUNCTION vote_guard(); DROP TYPE vote_value, vote_stage;`. No other table's data
   changes.
6. CI's disposable stack applies `0028` from `drizzle/` alone.
