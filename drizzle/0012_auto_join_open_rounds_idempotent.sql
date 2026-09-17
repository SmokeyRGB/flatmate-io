-- speckit-bug-fix round-participation-duplicate-on-manual-add: the unique index added in 0011
-- would otherwise make this trigger raise on a resident who was already added manually for the
-- same round -- ON CONFLICT DO NOTHING keeps the trigger idempotent, and skips the activity_event
-- write when there was nothing to insert (RETURNING leaves new_participation_id NULL on conflict).
CREATE OR REPLACE FUNCTION auto_join_open_rounds() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  new_participation_id uuid;
BEGIN
  IF NEW.is_resident AND NEW.resident_profile_id IS NOT NULL THEN
    FOR r IN
      SELECT id FROM casting_round
      WHERE household_id = NEW.household_id AND status = 'open'
    LOOP
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
