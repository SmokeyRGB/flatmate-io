# Bug Assessment: `addResidentToRound` has no duplicate guard against the auto-join trigger

- **Slug**: round-participation-duplicate-on-manual-add
- **Created**: 2026-09-17
- **Source**: pasted text (PR review comment on `src/modules/casting/repository.ts:349-359`)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> This insert has no duplicate guard for an existing (roundId, residentProfileId) participation.
> With the new auto-join trigger, calling addResidentToRound for a resident who was already added
> after opening creates a second active denominator row, exactly the scenario described by the new
> quorum test's comment. Add a database uniqueness constraint for the active pairing and handle the
> conflict (or look up and return/update the existing row) before inserting.

## Symptom

`addResidentToRound(context, roundId, residentProfileId, actor)` unconditionally inserts a new
`round_participation` row (source `added_manually`). Since migration `0010`
(`membership_auto_join_open_rounds`), a resident claiming their profile while a round is `open`
already gets a `round_participation` row inserted automatically (source `joined_after_open`) by a
DB trigger on `membership` insert. If a moderator subsequently calls `addResidentToRound` for that
same `(roundId, residentProfileId)` pair — e.g. believing the auto-join missed them, or just
clicking "add" out of habit — a second, undeleted (`removed_at IS NULL`) row is created for the
same person in the same round. Every reader that counts active rows
(`getRoundParticipants`, and any future quorum denominator calculation) now double-counts that
resident.

Expected: the pairing `(round_id, resident_profile_id)` while active (`removed_at IS NULL`) is
unique — a second manual add either fails cleanly, or is treated as a no-op/idempotent update of
the existing row, never a second row.

## Reproduction

1. Open a round (`openRound`) with one eligible resident.
2. Claim a second resident's profile while the round is open → trigger `auto_join_open_rounds`
   inserts a `round_participation` row for them with `source = 'joined_after_open'`.
3. Call `addResidentToRound(context, roundId, thatResidentProfileId, actor)` for the same resident.
4. Query active participants for the round (`removed_at IS NULL`) → the resident now has **two**
   rows instead of one.

This is exactly the scenario the second test in
[quorum-denominator.test.ts:62-87](tests/unit/casting/quorum-denominator.test.ts#L62-L87) sets up
(its own comment at lines 78-80 says the manual call "must not create a duplicate entry ... for
the same profile pairing"), but the test only asserts `addedRow.source === "added_manually"` — it
never asserts the active-row count for that resident stays at 1, so it does not currently catch
the bug it describes.

## Suspected Code Paths

- [src/modules/casting/repository.ts:349-359](src/modules/casting/repository.ts#L349-L359) —
  `addResidentToRound`'s insert; no lookup or conflict handling for an existing active row.
- [drizzle/0010_membership_auto_join_open_rounds.sql:26-28](drizzle/0010_membership_auto_join_open_rounds.sql#L26-L28)
  — the trigger's own insert, which has the identical gap: nothing stops it from firing twice for
  the same `(round_id, resident_profile_id)` either (e.g. two membership rows, or a re-triggered
  insert), so a DB-level constraint is the fix that covers both insert sites at once.
- [src/modules/casting/schema.ts:165-190](src/modules/casting/schema.ts#L165-L190) — `roundParticipation`
  table definition; no unique index exists on `(round_id, resident_profile_id)` today (confirmed:
  no migration under `drizzle/` adds one).
- [tests/unit/casting/quorum-denominator.test.ts:62-87](tests/unit/casting/quorum-denominator.test.ts#L62-L87)
  — the test that names this exact scenario but doesn't assert on it.

## Root Cause Hypothesis

High confidence. `round_participation` was designed as one row per `(round, resident)` — every
comment and the domain model treat it that way (`schema.ts:153-154`: "one row per profile per
round") — but no constraint enforces it, and the codebase now has two independent insert paths
(the manual repository function and the new DB trigger) that can each fire for the same pairing
with no coordination between them. The gap was latent before migration `0010`; the trigger is
what turned it into a reachable duplicate-write path, since a moderator has no way to know whether
the trigger already ran.

## Proposed Remediation

**Preferred**: Add a partial unique index on `round_participation (round_id, resident_profile_id)
WHERE removed_at IS NULL` (a new drizzle migration, since `0004-0011`-style numbered migrations
are the existing pattern — check the latest migration number before naming it). Then:
- In `addResidentToRound`, `INSERT ... ON CONFLICT (round_id, resident_profile_id) WHERE removed_at
  IS NULL DO NOTHING`, then `SELECT` and return the existing row when the insert affected zero
  rows (Postgres partial-index `ON CONFLICT` requires the same predicate on the `DO` clause) —
  so the function stays idempotent and always returns a row.
- In the trigger (`auto_join_open_rounds`), add the same `ON CONFLICT ... DO NOTHING` to the
  `INSERT INTO round_participation`, and skip the `activity_event` insert when the conflict fired
  (guard on `new_participation_id IS NOT NULL`, since `RETURNING` won't populate it on conflict) —
  otherwise a race between the trigger and a manual add would still double-write the audit trail
  even with the constraint in place.

This is a DB constraint, not app-level locking, so it holds regardless of which of the two insert
sites runs, and regardless of concurrent transactions.

**Alternatives** (optional):
- Application-level check-then-insert (`SELECT ... FOR UPDATE` then conditional `INSERT`) in
  `addResidentToRound` alone. Rejected: doesn't close the gap in the trigger's own insert path, and
  is race-prone without the DB constraint anyway.

**Files likely to change**:
- `drizzle/00XX_round_participation_active_unique.sql` (new migration)
- `drizzle/meta/_journal.json`, `drizzle/meta/00XX_snapshot.json` (drizzle-kit generated)
- `src/modules/casting/schema.ts` (add the unique index to the table definition so it round-trips
  through drizzle-kit)
- `src/modules/casting/repository.ts` (`addResidentToRound`)
- `drizzle/0010_membership_auto_join_open_rounds.sql`'s logic — since that migration is presumably
  already applied/frozen history, the trigger fix likely needs its own follow-up migration that
  `CREATE OR REPLACE FUNCTION auto_join_open_rounds()` rather than editing file `0010` in place
  — confirm against this repo's migration-editing convention before writing it.
- `tests/unit/casting/quorum-denominator.test.ts` (strengthen the existing test to assert the
  active-row count, not just `source`)

**Tests to add or update**:
- Strengthen `quorum-denominator.test.ts`'s second test: after `addResidentToRound`, assert
  `activeParticipants(hh, round.id)` still has exactly one row for `r2.profileId` (currently only
  checks `addedRow.source`).
- A new test calling `addResidentToRound` twice in a row for the same resident and asserting only
  one active row results (covers the manual-path duplicate directly, independent of the trigger).
- A test inserting two `membership` rows with `is_resident = true` for the same resident/round
  combination (or otherwise re-firing the trigger) and asserting the constraint holds there too.

## Risks & Considerations

- Migration risk: adding a unique index requires no backfill (no existing duplicate rows expected
  yet, since this bug requires the new trigger from `0010` to be reachable), but should still be
  applied with a pre-check (`SELECT round_id, resident_profile_id, count(*) FROM round_participation
  WHERE removed_at IS NULL GROUP BY 1,2 HAVING count(*) > 1`) against any environment where `0010`
  has already been live, to avoid the migration failing on existing data.
- `0010`'s migration file may already be applied in some environments (frozen-history convention
  per `tools/frozen.sha256` applies to `docs/`, not `drizzle/`, but check whether drizzle migrations
  here are treated as immutable once merged) — editing it in place vs. adding a follow-up migration
  needs a decision before `/speckit-bug-fix` proceeds.
- FR-1.17/quorum correctness (P-3, legitimacy of the denominator) is the actual blast radius: this
  silently inflates the participation count used for any future quorum/AC-1.\* computation, not
  just the visible participant list.

## Open Questions

- [NEEDS CLARIFICATION: is `drizzle/0010_membership_auto_join_open_rounds.sql` already applied to a
  shared/production environment, making it immutable, or is it still safe to edit in place rather
  than adding a new migration on top of it?]
