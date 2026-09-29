-- F3 change 2 (application-capture), design D2/D3. Roles are only names for fixed sets of stored
-- permissions; this migration makes a membership that contradicts its roles a refused write.
--
-- Re-runnable (CLAUDE.md "Migrations"): every backfill is idempotent and every CHECK is dropped
-- and re-added, so a human may run the whole file again after a partial apply.
--
-- Order, argued against the constraints live at each statement:
--   1. LOCK TABLE first, SHARE ROW EXCLUSIVE: no registration, claim, role change, move-out or
--      reactivation can land between a backfill and the CHECK that relies on it. Plain reads
--      still run.
--   2. membership_admin_has_no_profile stands alone (dev holds no violating row, checked
--      2026-09-28), so it can come before the backfills.
--   3. The backfills, before the role CHECKs, because each CHECK is valid only once its backfill
--      ran: (a) revoked rows keep nothing, (b) live moderators gain the moderator set (a union:
--      no stored value is dropped), (c) the live administering membership gets the household set
--      outright, because that set is exact, (d) live residents gain the resident set (a no-op
--      while that set is empty, kept so F4's widening is a one-line change).
--   4. The four role CHECKs.
--
-- The array literals below are the constants of src/modules/identity/schema.ts
-- (HOUSEHOLD_PERMISSIONS, RESIDENT_PERMISSIONS, MODERATOR_PERMISSIONS);
-- tests/unit/identity/role-permissions-constants.test.ts keeps the two honest.

LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_admin_has_no_profile";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_admin_has_no_profile" CHECK (role <> 'household_admin' OR resident_profile_id IS NULL);
--> statement-breakpoint
UPDATE "membership"
  SET role = CASE WHEN role = 'moderator' THEN 'member'::membership_role ELSE role END,
      permissions = '{}'::text[]
  WHERE revoked_at IS NOT NULL AND (role = 'moderator' OR cardinality(permissions) > 0);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['manage_rooms', 'close_round', 'create_application', 'change_application_state']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'moderator'
    AND NOT (permissions @> ARRAY['manage_rooms', 'close_round', 'create_application', 'change_application_state']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY['manage_rooms', 'manage_settings']::text[]
  WHERE revoked_at IS NULL AND role = 'household_admin'
    AND NOT (permissions @> ARRAY['manage_rooms', 'manage_settings']::text[]
             AND permissions <@ ARRAY['manage_rooms', 'manage_settings']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || '{}'::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND is_resident
    AND NOT (permissions @> '{}'::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'moderator' OR permissions @> ARRAY['manage_rooms', 'close_round', 'create_application', 'change_application_state']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_household_admin_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_household_admin_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'household_admin' OR (permissions @> ARRAY['manage_rooms', 'manage_settings']::text[] AND permissions <@ ARRAY['manage_rooms', 'manage_settings']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_resident_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_resident_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR NOT is_resident OR permissions @> '{}'::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_revoked_holds_nothing";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_revoked_holds_nothing" CHECK (revoked_at IS NULL OR (cardinality(permissions) = 0 AND role <> 'moderator'));
