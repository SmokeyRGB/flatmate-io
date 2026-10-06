-- Manual/dev tool — resets the casting activity of the existing demo household, keeping the
-- household itself. NOT part of the app, NOT part of the test suite. Run it, then
-- `DEMO_PASSWORD=... npm run seed:demo-round` (scripts/seed-demo-round.ts) re-creates a round.
-- scripts/cleanup-demo-household.sql is the heavier tool: it removes the whole household.
--
-- Deletes ONLY the demo household's vote, application, round_participation, casting_round and
-- room rows, and clears resident_profile.room_id (a profile's room points at a deleted room
-- otherwise). Household id, WG-Kennung, accounts, profiles, memberships, sessions, join links and
-- settings stay. activity_event stays (append-only, FR-0.13).
--
-- *** HOW TO RUN IT: the Supabase SQL editor for flatmate-io-dev. ***
-- Do NOT run it through this project's own DATABASE_URL. That connection is `app_runtime`, and
-- under RLS app_runtime sees only the household named by current_setting('app.household_id'),
-- which this script never sets — every statement would match zero rows and report success. The DO
-- block refuses to run as app_runtime rather than letting that happen. The SQL editor connects as
-- `postgres`, which owns these tables and is exempt from their policies.
--
-- *** NEVER RUN IT AGAINST PRODUCTION ***
-- It matches on a fixed synthetic address, so it cannot touch a real household by accident — but
-- the guard is the address, not the environment. flatmate-io-dev is the intended target.
--
-- Safe to run when no demo household exists: it raises a notice and changes nothing. Safe to run
-- twice.

DO $$
DECLARE
  v_demo_email  text := 'demo-household@example.test';  -- must match DEMO_EMAIL in the seed scripts
  v_household   uuid;
BEGIN
  IF current_user = 'app_runtime' THEN
    RAISE EXCEPTION
      'Refusing to run as app_runtime: RLS would make every statement here match zero rows and this script would report success while deleting nothing. Run it as postgres (the Supabase SQL editor for flatmate-io-dev).';
  END IF;

  SELECT id INTO v_household
  FROM household
  WHERE contact_email = v_demo_email;

  IF v_household IS NULL THEN
    RAISE NOTICE 'No demo household found for % — nothing to reset.', v_demo_email;
    RETURN;
  END IF;

  RAISE NOTICE 'Resetting the casting activity of demo household %.', v_household;

  -- No foreign keys, so nothing cascades. Order: vote and application before casting_round
  -- (drizzle/0026 refuses to delete a round that still has applications). Rooms go too, so the
  -- next round starts from two fresh `open` rooms whatever state earlier testing left them in.
  DELETE FROM vote                 WHERE household_id = v_household;
  DELETE FROM application          WHERE household_id = v_household;
  DELETE FROM round_participation  WHERE household_id = v_household;
  DELETE FROM casting_round        WHERE household_id = v_household;
  -- resident_profile.room_id would point at a deleted room, so clear it first (no foreign keys).
  UPDATE resident_profile SET room_id = NULL WHERE household_id = v_household AND room_id IS NOT NULL;
  DELETE FROM room                 WHERE household_id = v_household;

  RAISE NOTICE 'Demo casting activity reset.';
END $$;

-- What is left, for the demo household only, so you can see it worked: the five counts and the
-- profiles with a room_id are 0, the household id is unchanged and the resident count did not move.
SELECT 'vote' AS item, count(*)::text AS value
  FROM vote v JOIN household h ON h.id = v.household_id WHERE h.contact_email = 'demo-household@example.test'
UNION ALL SELECT 'application', count(*)::text
  FROM application a JOIN household h ON h.id = a.household_id WHERE h.contact_email = 'demo-household@example.test'
UNION ALL SELECT 'round_participation', count(*)::text
  FROM round_participation r JOIN household h ON h.id = r.household_id WHERE h.contact_email = 'demo-household@example.test'
UNION ALL SELECT 'casting_round', count(*)::text
  FROM casting_round c JOIN household h ON h.id = c.household_id WHERE h.contact_email = 'demo-household@example.test'
UNION ALL SELECT 'room', count(*)::text
  FROM room r JOIN household h ON h.id = r.household_id WHERE h.contact_email = 'demo-household@example.test'
UNION ALL SELECT 'resident_profile with room_id', count(*)::text
  FROM resident_profile p JOIN household h ON h.id = p.household_id WHERE h.contact_email = 'demo-household@example.test' AND p.room_id IS NOT NULL
UNION ALL SELECT 'household id (unchanged)', h.id::text
  FROM household h WHERE h.contact_email = 'demo-household@example.test'
UNION ALL SELECT 'resident_profile (unchanged)', count(*)::text
  FROM resident_profile p JOIN household h ON h.id = p.household_id WHERE h.contact_email = 'demo-household@example.test'
ORDER BY item;
