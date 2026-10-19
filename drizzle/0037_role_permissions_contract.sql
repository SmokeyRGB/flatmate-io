-- F3 change 2b follow-up (role-permissions-contract), design D1/D2. The CONTRACT half of 0029's
-- expand/contract: the lower bounds and the full holder rule, enforced by the database. After this
-- file a live household row holds exactly the household set, a live moderator the whole moderator
-- set, a live resident `vote`, a plain member nothing but `vote`, and no row holds a name the
-- Rechtematrix does not declare (the retired close_round and manage_settings are gone for good).
-- Applied only after every branch merged main (no code writes the old sets any more) and, on the
-- shared dev database, after the PR's review (design D5).
--
-- Re-runnable (CLAUDE.md "Migrations"): every backfill is WHERE NOT (permissions @> ...), every
-- strip is WHERE NOT (permissions <@ ...), every constraint is dropped IF EXISTS before it is
-- added. A human may run the whole file again after a partial apply; a second run changes nothing.
-- Every reference to the table is the quoted "membership", the DO block included: the replay test
-- (tests/integration/raw-sql/role-permissions-contract.test.ts) redirects only that spelling.
--
-- Order, argued against the constraints live at each statement (0029's, until step 6):
--   1. LOCK TABLE first, SHARE ROW EXCLUSIVE (as 0024/0027/0029): no registration, appointment,
--      demotion or reactivation lands between the data statements and the CHECKs that rely on them.
--   2. Report: five RAISE NOTICE counts before anything changes. Nothing aborts; the rows are
--      stripped or backfilled, and the counts tell the human what it touched.
--   3. manage_settings -> manage_voting_procedure again for live moderators (a row old code wrote
--      in the window). close_round -> manage_rounds needs no statement: step 4 gives every live
--      moderator manage_rounds. A household row gets manage_voting_procedure from step 4.
--   4. Backfills, each a sorted DISTINCT union: household the eight, moderator the eleven, live
--      is_resident rows `vote`. Unions add only values the group may hold, inside the household
--      ceiling 0029 still enforces, so none refuses.
--   5. Strips: every undeclared name from every row (removes close_round, manage_settings and any
--      test leftover), then live role = 'member' rows reduced to permissions ∩ {vote}. Removing a
--      value breaks no 0029 CHECK: the floors hold only values that are not stripped (household
--      manage_rooms; moderators are not role member), and the household ceiling still contains
--      manage_settings, which is only removed.
--   6. Constraints, dropped IF EXISTS then added, valid on every row by steps 4 and 5: household
--      exact, moderator the eleven, resident `vote`, moderator-only and administration widened, and
--      the new membership_declared_permissions.
--
-- The array literals below are the constants of src/modules/identity/schema.ts (ROLE_SETS,
-- PERMISSIONS); tests/unit/identity/role-permissions-constants.test.ts keeps the two honest.
--
-- Rollback (a note, not a script): drop membership_declared_permissions; re-add the four constraints
-- this file replaced as 0029 left them (moderator floor, moderator-only, administration, household
-- floor/ceiling) and 0024's resident CHECK with its empty floor. household_only and resident_only are
-- untouched. The data changes are not reverted: they only removed rights the matrix forbids and
-- added rights the sets require.

LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE
  n_retired integer;
  n_member integer;
  n_resident integer;
  n_short integer;
  n_undeclared integer;
BEGIN
  SELECT count(*) INTO n_retired FROM "membership"
    WHERE permissions && ARRAY['close_round', 'manage_settings']::text[];
  SELECT count(*) INTO n_member FROM "membership"
    WHERE revoked_at IS NULL AND role = 'member' AND NOT (permissions <@ ARRAY['vote']::text[]);
  SELECT count(*) INTO n_resident FROM "membership"
    WHERE revoked_at IS NULL AND is_resident AND NOT (permissions @> ARRAY['vote']::text[]);
  SELECT count(*) INTO n_short FROM "membership"
    WHERE revoked_at IS NULL
      AND ((role = 'household_admin' AND NOT (permissions @> ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link']::text[]))
        OR (role = 'moderator' AND NOT (permissions @> ARRAY['manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state']::text[])));
  SELECT count(*) INTO n_undeclared FROM "membership"
    WHERE NOT (permissions <@ ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state', 'vote']::text[]);
  RAISE NOTICE 'rows holding a retired name (close_round, manage_settings): %', n_retired;
  RAISE NOTICE 'live plain members holding anything but vote: %', n_member;
  RAISE NOTICE 'live residents without vote: %', n_resident;
  RAISE NOTICE 'live household or moderator rows short of their set: %', n_short;
  RAISE NOTICE 'rows holding an undeclared name: %', n_undeclared;
END
$$;
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['manage_voting_procedure']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'moderator'
    AND permissions @> ARRAY['manage_settings']::text[]
    AND NOT (permissions @> ARRAY['manage_voting_procedure']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'household_admin'
    AND NOT (permissions @> ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'moderator'
    AND NOT (permissions @> ARRAY['manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['vote']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND is_resident
    AND NOT (permissions @> ARRAY['vote']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions) AS p WHERE p = ANY(ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state', 'vote']::text[]) ORDER BY p
  )
  WHERE NOT (permissions <@ ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state', 'vote']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions) AS p WHERE p = 'vote' ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'member'
    AND NOT (permissions <@ ARRAY['vote']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_declared_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_declared_permissions" CHECK (permissions <@ ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state', 'vote']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'moderator' OR permissions @> ARRAY['manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_only_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_only_permissions" CHECK (role = 'moderator' OR NOT (permissions && ARRAY['manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_administration_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_administration_permissions" CHECK (role IN ('household_admin', 'moderator') OR NOT (permissions && ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_household_admin_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_household_admin_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'household_admin' OR (permissions @> ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link']::text[] AND permissions <@ ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_resident_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_resident_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR NOT is_resident OR permissions @> ARRAY['vote']::text[]);
