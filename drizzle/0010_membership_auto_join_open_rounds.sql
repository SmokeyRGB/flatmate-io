-- FR-1.18 (revised 2026-09-17): a resident becoming active while a round is open joins it
-- automatically, no moderator step. Lives as a trigger, not application code, because `identity`
-- is the bounded-context root and may import nothing (docs/domain/kontextgrenzen.md §4) -- this
-- behavior reaches from identity's own event (a new is_resident Membership row, from
-- claimResidentProfile) into casting-owned data (casting_round, round_participation). The same
-- reasoning already used for the procedure lock (kept in casting/repository.ts, since casting may
-- import identity, never the reverse) doesn't help here, because the natural trigger point
-- (claimResidentProfile) is itself identity-owned code. A DB trigger sidesteps the import
-- direction entirely -- the same category of mechanism already used this session for the RLS
-- bootstrap function and the acting_profile_id immutability trigger.
--
-- SECURITY INVOKER (the default -- no SECURITY DEFINER here): runs under the same role and
-- app.household_id session context as whichever transaction inserted the Membership row, so RLS
-- on both casting_round and round_participation applies exactly as it would to a manual insert.
CREATE FUNCTION auto_join_open_rounds() RETURNS trigger
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
      INSERT INTO round_participation (round_id, household_id, resident_profile_id, source, can_vote)
      VALUES (r.id, NEW.household_id, NEW.resident_profile_id, 'joined_after_open', true)
      RETURNING id INTO new_participation_id;

      -- Mirrors what addResidentToRound's manual path records (casting/repository.ts), so the
      -- automatic and manual join paths leave the same shape of audit trail (FR-1.20).
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
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER membership_auto_join_open_rounds
  AFTER INSERT ON membership
  FOR EACH ROW
  EXECUTE FUNCTION auto_join_open_rounds();
