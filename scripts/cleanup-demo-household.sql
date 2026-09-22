-- Manual/dev tool — removes the demo household that scripts/seed-demo-household.ts creates, so
-- repeated hand-testing runs do not accumulate. NOT part of the app, NOT part of the test suite
-- (the suite cleans up after itself in afterEach — tests/helpers/identity.ts).
--
-- *** HOW TO RUN IT: the Supabase SQL editor for flatmate-io-dev. ***
-- Do NOT run it through this project's own DATABASE_URL. That connection is `app_runtime`, and
-- under RLS app_runtime sees only the household named by current_setting('app.household_id'),
-- which this script never sets — so every statement below would match zero rows and the script
-- would report "nothing to clean up" while the demo household sat there untouched. A no-op that
-- looks like a success is the worst outcome available here, so the DO block refuses to run as
-- app_runtime rather than letting that happen.
--
-- The SQL editor connects as `postgres`, which owns these tables and is therefore exempt from
-- their policies. Any other postgres-role connection works too.
--
-- *** NEVER RUN IT AGAINST PRODUCTION ***
-- It matches on a fixed synthetic address, so it cannot touch a real household by accident — but
-- the guard is the address, not the environment. flatmate-io-dev is the intended target.
--
-- Safe to run when no demo household exists: it raises a notice and changes nothing. Safe to run
-- twice.

DO $$
DECLARE
  v_demo_email  text := 'demo-household@example.test';  -- must match DEMO_EMAIL in the seed script
  v_household   uuid;
  v_accounts    uuid[];
  v_deleted     int;
BEGIN
  -- Fail loudly rather than silently doing nothing — see the header. Without this guard, running
  -- the script on the project's own DATABASE_URL prints "No demo household found" and exits 0.
  IF current_user = 'app_runtime' THEN
    RAISE EXCEPTION
      'Refusing to run as app_runtime: RLS would make every statement here match zero rows and this script would report success while deleting nothing. Run it as postgres (the Supabase SQL editor for flatmate-io-dev).';
  END IF;

  SELECT id INTO v_household
  FROM household
  WHERE contact_email = v_demo_email;

  IF v_household IS NULL THEN
    RAISE NOTICE 'No demo household found for % — nothing to clean up.', v_demo_email;
    RETURN;
  END IF;

  -- Collect the Auth user ids BEFORE deleting the rows that name them. Account.id IS the Supabase
  -- Auth user id (1:1, see identity/auth.ts), so this one array covers the household account and
  -- every resident account — including any created by joining through a link.
  SELECT array_agg(id) INTO v_accounts
  FROM account
  WHERE household_id = v_household;

  RAISE NOTICE 'Cleaning up demo household % (% auth users).',
    v_household, coalesce(array_length(v_accounts, 1), 0);

  -- There are NO foreign keys in this schema (the two-Supabase-project split), so nothing cascades
  -- and deleting `household` alone would silently orphan every row below it. That is how the
  -- production project accumulated 1.9k rooms and 1.5k rounds before anyone noticed. Order does not
  -- matter without FKs; the list is what matters, and it is the same list as
  -- tests/helpers/identity.ts's cleanup CTE.
  DELETE FROM round_participation  WHERE household_id = v_household;
  DELETE FROM casting_round        WHERE household_id = v_household;
  DELETE FROM room                 WHERE household_id = v_household;
  DELETE FROM application          WHERE household_id = v_household;
  DELETE FROM resident_profile     WHERE household_id = v_household;
  DELETE FROM membership           WHERE household_id = v_household;
  DELETE FROM session              WHERE household_id = v_household;
  DELETE FROM account              WHERE household_id = v_household;
  DELETE FROM household_settings   WHERE household_id = v_household;
  DELETE FROM join_code_issuance   WHERE household_id = v_household;
  DELETE FROM household            WHERE id           = v_household;

  -- The Auth users last: until they are gone, re-running the seed fails at Supabase Auth's "email
  -- already registered" rather than at anything in this database. Deleting from auth.users cascades
  -- within the auth schema (identities, sessions, refresh tokens) — those FKs do exist.
  IF v_accounts IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_accounts);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % auth user(s).', v_deleted;
  END IF;

  RAISE NOTICE 'Demo household removed.';
END $$;

-- join_attempt has no household_id at all (join-by-link design.md Decision 3: the FR-2.28 limit is
-- estate-wide, because a guessed code is tested against every live link at once). So it cannot be
-- scoped to the demo household and is simply emptied — the rows are ephemeral counters with a
-- 24-hour retention that record_join_attempt() prunes on every call anyway. Emptying it also resets
-- a rate limit you tripped while testing, which is the other reason to want this line.
DELETE FROM join_attempt;

-- activity_event is deliberately NOT deleted. FR-0.13 makes it append-only, enforced by RESTRICTIVE
-- policies plus FORCE ROW LEVEL SECURITY (drizzle/0000) — FORCE means even the table owner is held
-- to them, so the DELETE would be refused rather than merely inadvisable. It is also correct that
-- the rows survive: 06-Compliance-Anhang.md §5.6 keeps the audit record as a tombstone after the
-- thing it describes is gone. Demo runs therefore leave audit rows behind, by design, and that is
-- the one thing this script does not clean.

-- What is left, so you can see it worked. Every count should be 0 except activity_event.
SELECT 'household'          AS table_name, count(*) FROM household
UNION ALL SELECT 'account',              count(*) FROM account
UNION ALL SELECT 'session',              count(*) FROM session
UNION ALL SELECT 'resident_profile',     count(*) FROM resident_profile
UNION ALL SELECT 'membership',           count(*) FROM membership
UNION ALL SELECT 'household_settings',   count(*) FROM household_settings
UNION ALL SELECT 'join_code_issuance',   count(*) FROM join_code_issuance
UNION ALL SELECT 'join_attempt',         count(*) FROM join_attempt
UNION ALL SELECT 'room',                 count(*) FROM room
UNION ALL SELECT 'casting_round',        count(*) FROM casting_round
UNION ALL SELECT 'round_participation',  count(*) FROM round_participation
UNION ALL SELECT 'application',          count(*) FROM application
UNION ALL SELECT 'activity_event (kept)', count(*) FROM activity_event
ORDER BY table_name;
