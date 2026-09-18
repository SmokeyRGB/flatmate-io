# Bug Fix: `addResidentToRound` has no duplicate guard against the auto-join trigger

- **Slug**: round-participation-duplicate-on-manual-add
- **Fixed**: 2026-09-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added a partial unique index on `round_participation (round_id, resident_profile_id) WHERE
removed_at IS NULL`, made both writers into that table (`addResidentToRound` and the
`auto_join_open_rounds` DB trigger) conflict-safe against it, and strengthened the test that
already named this scenario to actually assert on row count.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/casting/schema.ts` | modified | Added `uniqueIndex("round_participation_active_pairing_idx")` on `(roundId, residentProfileId)` with a `removed_at IS NULL` predicate. |
| `drizzle/0011_round_participation_active_pairing_unique.sql` | added | Generated via `drizzle-kit generate`; creates the unique index. |
| `drizzle/meta/0011_snapshot.json`, `drizzle/meta/_journal.json` | added/modified | drizzle-kit generated bookkeeping. |
| `drizzle/0012_auto_join_open_rounds_idempotent.sql` | added | `CREATE OR REPLACE FUNCTION auto_join_open_rounds()` with `ON CONFLICT (round_id, resident_profile_id) WHERE removed_at IS NULL DO NOTHING`; skips the `activity_event` insert when the conflict fired. Custom migration (`drizzle-kit generate --custom`), matching the pattern already used for `0006`/`0008`/`0010` (no schema snapshot). |
| `src/modules/casting/repository.ts` | modified | `addResidentToRound` now does `.onConflictDoNothing({ target: [roundId, residentProfileId], where: isNull(removedAt) })`; on conflict, looks up and returns the existing active row instead of writing a duplicate or throwing. |
| `tests/unit/casting/quorum-denominator.test.ts` | modified | Strengthened the existing "manual correction" test to assert active-row count stays at 1 for that resident (it previously only checked `source`, which didn't catch the bug it was written to describe). Added a new test calling `addResidentToRound` twice directly for the same never-auto-joined resident, asserting the second call returns the same row and no duplicate is created. |

## Diff Highlights

`src/modules/casting/schema.ts`:
```ts
uniqueIndex("round_participation_active_pairing_idx")
  .on(t.roundId, t.residentProfileId)
  .where(sql`removed_at IS NULL`),
```

`src/modules/casting/repository.ts` (`addResidentToRound`):
```ts
const [inserted] = await tx
  .insert(roundParticipation)
  .values({ roundId, householdId: context.householdId, residentProfileId, source: "added_manually", canVote: true })
  .onConflictDoNothing({
    target: [roundParticipation.roundId, roundParticipation.residentProfileId],
    where: isNull(roundParticipation.removedAt),
  })
  .returning();

if (!inserted) {
  const [existing] = await tx.select().from(roundParticipation).where(/* same active pairing */);
  return existing;
}
```

`drizzle/0012_auto_join_open_rounds_idempotent.sql` (trigger function):
```sql
INSERT INTO round_participation (round_id, household_id, resident_profile_id, source, can_vote)
VALUES (r.id, NEW.household_id, NEW.resident_profile_id, 'joined_after_open', true)
ON CONFLICT (round_id, resident_profile_id) WHERE removed_at IS NULL DO NOTHING
RETURNING id INTO new_participation_id;

IF new_participation_id IS NOT NULL THEN
  INSERT INTO activity_event (...) VALUES (...);
END IF;
```

## Tests Added or Updated

- `tests/unit/casting/quorum-denominator.test.ts` — "addResidentToRound remains available as a
  moderator's manual correction path": now asserts exactly one active `round_participation` row
  for the resident after the manual call, and that the returned row is the trigger's original
  (`source: "joined_after_open"`), not a second row.
- `tests/unit/casting/quorum-denominator.test.ts` — new test "addResidentToRound called twice for
  the same resident does not duplicate the row": calls the manual path twice directly (no trigger
  involved) and asserts idempotency.

## Local Verification

- `npx tsc --noEmit -p .` → my changes introduce no new type errors (the one pre-existing error at
  `src/modules/casting/repository.ts:525` belonged to other, since-committed work
  (`396454c`/`forceChangeSettingWhileRoundOpen`'s permission check) and is gone from this branch now).
- `npx drizzle-kit generate` — produced the expected single `CREATE UNIQUE INDEX` statement with no
  unrelated schema drift; `npx drizzle-kit generate --custom` produced the trigger migration shell.
- **Applying the migrations to the live Supabase DB** turned out not to be possible through
  `drizzle-kit` at all in this environment:
  - `drizzle-kit migrate` tried to replay the full migration history from `0000`, but this
    database was actually bootstrapped via ad-hoc SQL (no `drizzle.__drizzle_migrations` table
    exists), so it failed silently (exit 1, no error text) on already-existing objects.
  - `drizzle-kit push` against the configured pooler port (`6543`, Supavisor transaction mode)
    hung indefinitely at "Pulling schema from database" — transaction-mode pooling doesn't support
    the session-level introspection `push` needs (confirmed: switching to the same host's port
    `5432`, session mode, let it proceed).
  - `push` then failed with `must be owner of view casting_round_admin_view` — a raw-SQL view from
    migration `0008` that isn't modeled in `schema.ts`, owned by a different role than the one
    `push` connects as.
  - Given both tools fought the existing ad-hoc-applied schema, the user applied both migrations'
    SQL directly via the Supabase SQL Editor instead (the same path `0008`/`0010`'s raw SQL was
    presumably applied through originally).
  - The first attempt at `CREATE UNIQUE INDEX ...` (migration `0011`) failed with
    `23505 duplicate key value` — this bug had **already produced real duplicates**: 28 pairs, each
    a `joined_after_open` row followed ~1–2s later by an `added_manually` row, all timestamped
    across repeated local runs of `quorum-denominator.test.ts` before this fix existed. Resolved by
    soft-removing (`removed_at = now()`, not deleted — keeps the audit trail per P-4) the later row
    in each duplicate pair, keeping the earliest as the active one, then re-running the `CREATE
    UNIQUE INDEX` successfully.
- `npm test` — full suite, run against that same live Supabase project (per this project's own
  testing convention, confirmed in `vitest.config.ts`'s comment: "this project tests against the
  live database/services throughout"): **50 files / 95 tests passed**, including the 3 tests in
  `quorum-denominator.test.ts`.

## Deviations from Assessment

- The assessment's open question ("is `0010` already applied/immutable?") is resolved by
  observation rather than by asking: `0010` already ships as a normal, non-frozen `drizzle/`
  migration (frozen-file protection per `CLAUDE.md` only covers `docs/04-Domaenenmodell.md`,
  `docs/05-ADRs.md`, `docs/07-Screen-Inventar.md`, not `drizzle/`), and this repo's own convention
  (migrations `0006`/`0008` are custom trigger/view migrations layered on top of earlier ones,
  never edited in place) is to add a new migration rather than rewriting an old one. Fixed the
  trigger via a new `0012` migration (`CREATE OR REPLACE FUNCTION`) instead of editing `0010`
  in place, matching that pattern and avoiding any risk to environments where `0010` already ran.
- Assessment suggested `INSERT ... ON CONFLICT ... DO NOTHING` then a separate lookup in the
  repository function; implemented as proposed, using Drizzle's `.onConflictDoNothing()` query
  builder method rather than raw SQL, since it maps 1:1 onto the same behavior and is what the
  rest of `repository.ts` already uses for querying.

## Follow-ups

- If this project ever moves to a real `drizzle-kit migrate`-tracked history (a
  `drizzle.__drizzle_migrations` table), that first run will need to be reconciled against what's
  already live in each environment — right now schema changes here are applied ad hoc, which is
  exactly what made this fix's own rollout harder than it should have been.
- Any other environment (staging/prod, if any exist yet) that has had migration `0010` live should
  run the same duplicate-detection query from **Local Verification** before migration `0011` is
  applied there, since this fix confirms the bug is not theoretical — it already happened here.
