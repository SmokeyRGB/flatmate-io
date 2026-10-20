-- F3 change 4 (application-deletion), design D1/D2. Adds `delete_application`, held only by the
-- moderator (FR-3.17, matrix row „Application löschen"), to the three exact membership CHECKs that
-- 0037 derived from PERMISSIONS, and gives every live moderator the new permission. The column
-- drop is NOT here: it is 0039, applied after the merge (expand/contract on the shared dev database).
-- Applied by a human on the shared dev database before the PR's merge (design D8): from then on
-- the floor refuses a write of the eleven-permission moderator set.
--
-- Re-runnable (CLAUDE.md "Migrations"): the backfill is WHERE NOT (permissions @> ...), every
-- constraint is dropped IF EXISTS before it is added. A second run changes nothing.
-- Every reference to the table is the quoted "membership", the DO block included: the replay test
-- (tests/integration/raw-sql/delete-application-permission.test.ts) redirects only that spelling.
--
-- Order, argued against the constraints live at each statement (0037's, until each is replaced):
--   1. LOCK TABLE first, SHARE ROW EXCLUSIVE (as 0037): no appointment or join lands between the
--      backfill and the floor.
--   2. Report: RAISE NOTICE counts before anything changes. Nothing aborts.
--   3. membership_declared_permissions re-added with delete_application. This only widens the list,
--      so it is valid on every row. It must come before step 5, or the backfill would store an
--      undeclared name and be refused.
--   4. membership_moderator_only_permissions re-added with delete_application. Valid because no row
--      holds the name yet; doing it before the backfill means nothing can ever give it to a
--      non-moderator.
--   5. Backfill: every live moderator gets a sorted DISTINCT union with delete_application. The
--      CHECKs widened in steps 3 and 4 accept it. Revoked rows hold nothing (0037), so they are
--      not touched.
--   6. membership_moderator_holds_role_permissions re-added with the twelve. Valid after step 5.
--
-- The array literals below are the constants of src/modules/identity/schema.ts (ROLE_SETS,
-- PERMISSIONS); tests/unit/identity/role-permissions-constants.test.ts keeps the two honest.
--
-- Rollback (a note, not a script): re-add the three constraints as 0037 wrote them (without
-- delete_application) and strip delete_application from every row first. The backfill is not
-- reverted by anything else: it only added a right the moderator set now requires.

LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE
  n_short integer;
  n_other integer;
BEGIN
  SELECT count(*) INTO n_short FROM "membership"
    WHERE revoked_at IS NULL AND role = 'moderator'
      AND NOT (permissions @> ARRAY['delete_application']::text[]);
  SELECT count(*) INTO n_other FROM "membership"
    WHERE role <> 'moderator' AND permissions && ARRAY['delete_application']::text[];
  RAISE NOTICE 'live moderators that will receive delete_application: %', n_short;
  RAISE NOTICE 'non-moderator rows already holding delete_application (expected 0): %', n_other;
END
$$;
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_declared_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_declared_permissions" CHECK (permissions <@ ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state', 'delete_application', 'vote']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_only_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_only_permissions" CHECK (role = 'moderator' OR NOT (permissions && ARRAY['manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state', 'delete_application']::text[]));
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['delete_application']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'moderator'
    AND NOT (permissions @> ARRAY['delete_application']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'moderator' OR permissions @> ARRAY['manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'manage_rounds', 'manage_round_participation', 'create_application', 'change_application_state', 'reverse_application_state', 'delete_application']::text[]);
