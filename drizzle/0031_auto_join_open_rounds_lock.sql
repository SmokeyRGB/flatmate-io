-- HUMAN HAND-OFF. Run this whole file in the Supabase SQL editor on flatmate-io-dev
-- as the migration role (postgres). Do not apply it through DATABASE_URL (app_runtime).
-- Re-runnable: CREATE OR REPLACE FUNCTION (same signature as drizzle/0012), then
-- DROP TRIGGER IF EXISTS and CREATE TRIGGER. Run the file twice.
--
-- A resident who becomes a live resident while a round is opening must still join that
-- round. Live means is_resident, a resident_profile_id, and revoked_at IS NULL
-- (membership_resident_pairing makes the first two the same fact). openRoundTx holds the
-- round FOR UPDATE and writes status = 'open' before it commits. Under READ COMMITTED a
-- select of only status = 'open' with no lock sees the committed 'draft' and skips the
-- round. A row whose snapshot version fails the WHERE is never locked, so the WHERE has
-- to include 'draft'. FOR SHARE then waits for the opener, and Postgres re-reads the row:
-- only a status that is still 'open' after that wait is joined.
--
-- The trigger also fires when an UPDATE turns a membership into that live state
-- (reactivateMember clears revoked_at). An UPDATE of an already-live membership does not
-- join again. INSERT has no OLD row; the OLD comparison runs only for TG_OP = 'UPDATE'.
--
-- LOCK ORDER: the membership INSERT or UPDATE already holds that membership row; this
-- function then takes casting_round FOR SHARE and does not lock household_settings.
-- That follows membership -> household_settings -> casting_round. openRoundTx holds
-- settings FOR SHARE and the round FOR UPDATE, then reads memberships with no lock, so
-- the two do not cycle. A transition that is not into the live state returns before the
-- lock, so a revocation does not wait on an opener.
--
-- Not SECURITY DEFINER. The only policy on casting_round is permissive FOR ALL on
-- household_id. reactivateMember runs in the acting admin or moderator's session, which
-- has that household set. FOR SHARE needs the UPDATE policy and UPDATE privilege; both
-- already hold for app_runtime. A definer would skip RLS.

CREATE OR REPLACE FUNCTION auto_join_open_rounds() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  new_participation_id uuid;
BEGIN
  -- Live resident membership: is_resident, a profile, and not revoked.
  IF NOT (NEW.is_resident AND NEW.resident_profile_id IS NOT NULL AND NEW.revoked_at IS NULL) THEN
    RETURN NEW;
  END IF;

  -- INSERT always has a new row. UPDATE joins only the transition into live.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_resident AND OLD.resident_profile_id IS NOT NULL AND OLD.revoked_at IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS membership_auto_join_open_rounds ON membership;

CREATE TRIGGER membership_auto_join_open_rounds
  AFTER INSERT OR UPDATE OF is_resident, resident_profile_id, revoked_at ON membership
  FOR EACH ROW
  EXECUTE FUNCTION auto_join_open_rounds();
