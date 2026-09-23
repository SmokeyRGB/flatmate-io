-- final-member-removal design.md Decisions 2/3/8. This file must run in a LATER transaction than
-- 0016 (Postgres refuses "unsafe use of new value" for a value used in the same transaction that
-- added it). Every statement here is written re-runnable (IF EXISTS / IF NOT EXISTS / CREATE OR
-- REPLACE), because a human may run the whole file after an agent already ran part of it.

-- Step 1: backfill. A profile still `moved_out` whose LATEST membership-lifecycle audit event is
-- `membership.removed_as_intruder` becomes `removed` — U-27's hard tier, mistakenly landed in the
-- soft tier's status before this change. A profile whose latest such event is `membership.revoked`
-- (an actual move-out) or `membership.reactivated` (reactivated since, regardless of tier) is left
-- exactly as it is. Runs FIRST, before the index rebuild below: it only widens the set of statuses
-- the partial unique index excludes, so the index can never fail to build because of it.
--
-- G-D3: every ResidentProfile transition produces exactly one ActivityEvent — this migration
-- performs a transition, so it writes exactly one `resident_profile.status_changed` event per row
-- it promotes, attributed to the actor of the ORIGINAL removal (not to the migration itself), from
-- the same audit row the promotion is keyed on. Payload keys match PAYLOAD_ALLOWLIST's for
-- `resident_profile.status_changed` (audit/repository.ts) exactly, even though this raw SQL
-- bypasses the allowlist check itself.
--
-- Re-runnable: a second run's `promoted` CTE finds no `moved_out` row left to promote, so the
-- INSERT that follows selects zero rows.
-- backfill:begin
WITH last_membership_event AS (
  SELECT DISTINCT ON (m.resident_profile_id)
         m.resident_profile_id, ae.event_type, ae.actor_account_id, ae.actor_profile_id, m.household_id
  FROM membership m
  JOIN activity_event ae ON ae.subject_type = 'membership' AND ae.subject_id = m.id
  WHERE ae.event_type IN ('membership.revoked', 'membership.removed_as_intruder', 'membership.reactivated')
  ORDER BY m.resident_profile_id, ae.occurred_at DESC
), promoted AS (
  UPDATE resident_profile rp SET status = 'removed'
  FROM last_membership_event l
  WHERE rp.id = l.resident_profile_id AND rp.status = 'moved_out'
    AND l.event_type = 'membership.removed_as_intruder'
  RETURNING rp.id, rp.household_id, l.actor_account_id, l.actor_profile_id
)
INSERT INTO activity_event (household_id, event_type, subject_type, subject_id,
                            actor_account_id, actor_profile_id, payload)
SELECT household_id, 'resident_profile.status_changed', 'resident_profile', id,
       actor_account_id, actor_profile_id,
       jsonb_build_object('fromStatus', 'moved_out', 'toStatus', 'removed')
FROM promoted;
-- backfill:end
--> statement-breakpoint

-- Step 2: FR-1.4 as amended — the partial unique index now excludes `removed` as well as
-- `moved_out` (NAME_RELEASING_STATUSES, transitions.ts). Same name, so nothing else has to change;
-- dropped and recreated rather than altered, since Postgres has no ALTER INDEX ... WHERE.
DROP INDEX IF EXISTS "resident_profile_display_name_active_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resident_profile_display_name_active_idx" ON "resident_profile"
  USING btree ("household_id", "display_name") WHERE status NOT IN ('moved_out', 'removed');
--> statement-breakpoint

-- Step 3: the one guarantee U-27 calls "endgültig" enforced in the database, not only in
-- transitions.ts's application-code table (design.md Decision 2). Plain plpgsql, NOT SECURITY
-- DEFINER — this must apply to every caller including app_runtime itself, not bypass RLS for one.
-- Deliberately narrow: it blocks only OLD.status = 'removed' AND NEW.status <> 'removed', so every
-- other column of a removed row stays writable (a later redaction or F3+'s purge is not blocked),
-- and it does not touch DELETE (erasure may need that). It does not re-encode the whole transition
-- table in SQL either — transitions.ts remains the one declared table (ADR-002); this trigger
-- covers exactly the one move U-27 requires to be impossible.
CREATE OR REPLACE FUNCTION reject_resident_profile_unremoval() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'removed' AND NEW.status IS DISTINCT FROM 'removed' THEN
    RAISE EXCEPTION 'resident_profile % is removed; removal is final (U-27)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS resident_profile_unremoval_final ON "resident_profile";
--> statement-breakpoint
CREATE TRIGGER resident_profile_unremoval_final
  BEFORE UPDATE ON "resident_profile"
  FOR EACH ROW
  EXECUTE FUNCTION reject_resident_profile_unremoval();
