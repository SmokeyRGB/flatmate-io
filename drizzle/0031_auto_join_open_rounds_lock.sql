-- HUMAN HAND-OFF. Run this whole file in the Supabase SQL editor on flatmate-io-dev
-- as the migration role (postgres). Do not apply it through DATABASE_URL (app_runtime).
-- Re-runnable: CREATE OR REPLACE FUNCTION, same signature as drizzle/0012. Run it twice.
--
-- A resident who becomes active while a round is opening must still join that round.
-- openRoundTx holds the round FOR UPDATE and writes status = 'open' before it commits.
-- Under READ COMMITTED the old body selected only status = 'open' with no lock, so it saw
-- the committed 'draft' and skipped the round. A row whose snapshot version fails the
-- WHERE is never locked, so the WHERE has to include 'draft'. FOR SHARE then waits for
-- the opener, and Postgres re-reads the row: only a status that is still 'open' after
-- that wait is joined.
--
-- LOCK ORDER: the membership INSERT already holds the new membership row; this function
-- then takes casting_round FOR SHARE and does not lock household_settings. That follows
-- membership -> household_settings -> casting_round. openRoundTx holds settings FOR SHARE
-- and the round FOR UPDATE, then reads memberships with no lock, so the two do not cycle.
--
-- Not SECURITY DEFINER. The only policy on casting_round is permissive FOR ALL on
-- household_id, and the membership insert runs with that household set. FOR SHARE needs
-- the UPDATE policy and UPDATE privilege; both already hold for that session (app_runtime
-- has UPDATE, and FOR ALL is the UPDATE policy). A definer would skip RLS.

CREATE OR REPLACE FUNCTION auto_join_open_rounds() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  new_participation_id uuid;
BEGIN
  IF NEW.is_resident AND NEW.resident_profile_id IS NOT NULL THEN
    FOR r IN
      SELECT id, status FROM casting_round
      WHERE household_id = NEW.household_id AND status IN ('draft', 'open')
      ORDER BY id
      FOR SHARE
    LOOP
      -- r.status is the version visible after the lock wait, not the pre-lock snapshot.
      IF r.status <> 'open' THEN
        CONTINUE;
      END IF;

      new_participation_id := NULL;

      INSERT INTO round_participation (round_id, household_id, resident_profile_id, source, can_vote)
      VALUES (r.id, NEW.household_id, NEW.resident_profile_id, 'joined_after_open', true)
      ON CONFLICT (round_id, resident_profile_id) WHERE removed_at IS NULL DO NOTHING
      RETURNING id INTO new_participation_id;

      IF new_participation_id IS NOT NULL THEN
        INSERT INTO activity_event (household_id, event_type, subject_type, subject_id, actor_account_id, actor_profile_id, payload)
        VALUES (
          NEW.household_id,
          'casting_round.participant_added',
          'round_participation',
          new_participation_id,
          NEW.account_id,
          NEW.resident_profile_id,
          jsonb_build_object('source', 'joined_after_open')
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
