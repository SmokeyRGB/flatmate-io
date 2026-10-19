-- Manual/dev tool — removes EVERYTHING on the database except the Demo-WG household
-- (found by its fixed contact email, so re-seeding it does not change this script) and the rows that must stay. NOT part of the app, NOT part
-- of the test suite. Sibling of scripts/cleanup-demo-household.sql (which removes one household);
-- this one removes all households but one.
--
-- *** HOW TO RUN IT: the Supabase SQL editor for flatmate-io-dev, as `postgres`. ***
-- Not through DATABASE_URL: that is `app_runtime`, RLS hides every other household from it, and each
-- DELETE would match zero rows and report success. The DO block refuses to run as app_runtime.
--
-- *** NEVER RUN IT AGAINST PRODUCTION. *** The guard is the keep-id below, not the environment.
--
-- Run STEP 1 first and read it. Run STEP 2 only when the preview shows nothing you want to keep.
-- STEP 2 is one DO block = one transaction: any error rolls the whole cleanup back.
--
-- What stays, and why:
--   * Demo-WG's own rows in every household-scoped table, and its Supabase Auth users (accounts).
--   * activity_event, ALL households: append-only (FR-0.13, RESTRICTIVE DELETE policy + FORCE RLS —
--     even `postgres` is refused) and the audit tombstone (06-Compliance-Anhang.md §5.6). Rows of
--     deleted households are inert; nothing reads them without the household.
--   * Schema, migrations (drizzle.__drizzle_migrations), roles, policies, functions: untouched.
-- What goes:
--   * Every other household and all rows scoped to it (no foreign keys, so each table is named).
--   * join_attempt (ephemeral rate-limit counters, no household_id; also resets a tripped limit).
--   * Every auth.users row that is not a Demo-WG account — including orphans left by failed tests,
--     which have no `account` row at all.

-- ============================== STEP 1: PREVIEW (read-only) ==============================

-- 1a. The household you are keeping must exist, or STEP 2 aborts.
SELECT id, name, contact_email FROM household WHERE id = (SELECT id FROM household WHERE contact_email = 'demo-household@example.test');

-- 1b. Per table: rows kept vs rows that STEP 2 deletes.
SELECT t AS table_name,
       count(*) FILTER (WHERE hid = (SELECT id FROM household WHERE contact_email = 'demo-household@example.test')) AS kept,
       count(*) FILTER (WHERE hid IS DISTINCT FROM (SELECT id FROM household WHERE contact_email = 'demo-household@example.test')) AS deleted
FROM (
  SELECT 'household' t, id hid FROM household
  UNION ALL SELECT 'account', household_id FROM account
  UNION ALL SELECT 'session', household_id FROM session
  UNION ALL SELECT 'resident_profile', household_id FROM resident_profile
  UNION ALL SELECT 'membership', household_id FROM membership
  UNION ALL SELECT 'household_settings', household_id FROM household_settings
  UNION ALL SELECT 'join_code_issuance', household_id FROM join_code_issuance
  UNION ALL SELECT 'room', household_id FROM room
  UNION ALL SELECT 'casting_round', household_id FROM casting_round
  UNION ALL SELECT 'round_participation', household_id FROM round_participation
  UNION ALL SELECT 'application', household_id FROM application
  UNION ALL SELECT 'vote', household_id FROM vote
) x
GROUP BY t ORDER BY t;

-- 1c. Auth users that STEP 2 deletes, split by address. Anything outside @example.test is a real
--     address (your own sign-up?) — check that list before going on.
SELECT CASE WHEN email LIKE '%@example.test' THEN 'synthetic (@example.test)' ELSE 'OTHER — check these' END AS kind,
       count(*) AS auth_users_to_delete
FROM auth.users
WHERE id NOT IN (SELECT id FROM account WHERE household_id = (SELECT id FROM household WHERE contact_email = 'demo-household@example.test'))
GROUP BY 1;

SELECT id, email, created_at
FROM auth.users
WHERE id NOT IN (SELECT id FROM account WHERE household_id = (SELECT id FROM household WHERE contact_email = 'demo-household@example.test'))
  AND email NOT LIKE '%@example.test'
ORDER BY created_at;

-- ============================== STEP 2: CLEANUP ==============================

DO $$
DECLARE
  v_keep    uuid;  -- Demo-WG, looked up by its fixed contact email below
  v_keep_ac uuid[];
  v_n       int;
BEGIN
  SELECT id INTO v_keep FROM household WHERE contact_email = 'demo-household@example.test';

  IF current_user = 'app_runtime' THEN
    RAISE EXCEPTION
      'Refusing to run as app_runtime: RLS would make every statement here match zero rows. Run it as postgres (the Supabase SQL editor).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM household WHERE id = v_keep) THEN
    RAISE EXCEPTION 'Household % not found — wrong database? Nothing was deleted.', v_keep;
  END IF;

  -- The Auth users to keep: Demo-WG's accounts (account.id IS the Auth user id, 1:1).
  SELECT array_agg(id) INTO v_keep_ac FROM account WHERE household_id = v_keep;
  IF v_keep_ac IS NULL THEN
    RAISE EXCEPTION 'Household % has no account rows — refusing, the auth cleanup would delete everyone.', v_keep;
  END IF;

  -- No foreign keys: each table is named. Order matters only where a trigger refuses otherwise:
  -- vote and application before casting_round (drizzle/0026 refuses to delete a round that still has
  -- applications). Same list as tests/helpers/identity.ts HOUSEHOLD_SCOPED_TABLES.
  DELETE FROM vote                WHERE household_id <> v_keep;
  DELETE FROM application         WHERE household_id <> v_keep;
  DELETE FROM round_participation WHERE household_id <> v_keep;
  DELETE FROM casting_round       WHERE household_id <> v_keep;
  DELETE FROM room                WHERE household_id <> v_keep;
  DELETE FROM resident_profile    WHERE household_id <> v_keep;
  DELETE FROM membership          WHERE household_id <> v_keep;
  DELETE FROM session             WHERE household_id <> v_keep;
  DELETE FROM account             WHERE household_id <> v_keep;
  DELETE FROM household_settings  WHERE household_id <> v_keep;
  DELETE FROM join_code_issuance  WHERE household_id <> v_keep;
  DELETE FROM household           WHERE id           <> v_keep;

  -- Auth users last. Cascades inside the auth schema (identities, sessions, refresh tokens).
  DELETE FROM auth.users WHERE id <> ALL (v_keep_ac);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Deleted % auth user(s).', v_n;

  -- Ephemeral, no household_id (see cleanup-demo-household.sql).
  DELETE FROM join_attempt;

  RAISE NOTICE 'Cleanup done; only household % remains.', v_keep;
END $$;

-- ============================== STEP 3: VERIFY ==============================
-- Expect: every count is Demo-WG's own, household = 1, auth_users = number of Demo-WG accounts.
SELECT 'household' AS item, count(*) FROM household
UNION ALL SELECT 'household rows not Demo-WG (expect 0)', count(*) FROM household WHERE id <> (SELECT id FROM household WHERE contact_email = 'demo-household@example.test')
UNION ALL SELECT 'account', count(*) FROM account
UNION ALL SELECT 'resident_profile', count(*) FROM resident_profile
UNION ALL SELECT 'membership', count(*) FROM membership
UNION ALL SELECT 'room', count(*) FROM room
UNION ALL SELECT 'casting_round', count(*) FROM casting_round
UNION ALL SELECT 'application', count(*) FROM application
UNION ALL SELECT 'vote', count(*) FROM vote
UNION ALL SELECT 'auth_users', count(*) FROM auth.users
UNION ALL SELECT 'join_attempt (expect 0)', count(*) FROM join_attempt
UNION ALL SELECT 'activity_event (kept on purpose)', count(*) FROM activity_event;
