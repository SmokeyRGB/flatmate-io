-- F3 change 3 (application-pipeline), design D8. `reverse_application_state` is the matrix's
-- "Application.status zurücknehmen" (03-PRD.md §4.0.1): a permission only the moderator's set
-- contains. This migration adds it to the moderator set, backfills the live moderators, widens the
-- moderator CHECK, and adds the CHECK that no other membership can hold it.
--
-- Re-runnable (CLAUDE.md "Migrations"): the backfill is idempotent and every CHECK is dropped and
-- re-added, so a human may run the whole file again after a partial apply.
--
-- Order, argued against the constraints live at each statement:
--   1. LOCK TABLE first, SHARE ROW EXCLUSIVE (as 0024 does): no appointment, demotion or
--      reactivation can land between the backfill and the CHECKs that rely on it.
--   2. A precondition: if any live non-moderator already holds the value, stop. None can today
--      (the value is new); it is never silently stripped.
--   3. The backfill, a sorted union (no stored value is dropped). At this statement the old
--      moderator CHECK (four values) is still live; a union keeps the four, so every row passes.
--   4. The moderator CHECK is dropped and re-added with five values. Valid because step 3 ran.
--   5. The moderator-only CHECK is dropped and added. Valid because step 2 proved no
--      non-moderator holds the value. Revoked rows hold no permissions, so they pass.
--
-- The array literals below are the constants of src/modules/identity/schema.ts
-- (MODERATOR_PERMISSIONS, MODERATOR_ONLY_PERMISSIONS);
-- tests/unit/identity/role-permissions-constants.test.ts keeps the two honest.

LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "membership"
    WHERE role <> 'moderator' AND permissions && ARRAY['reverse_application_state']::text[]
  ) THEN
    RAISE EXCEPTION 'a non-moderator membership already holds reverse_application_state';
  END IF;
END
$$;
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['reverse_application_state']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'moderator'
    AND NOT (permissions @> ARRAY['reverse_application_state']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'moderator' OR permissions @> ARRAY['manage_rooms', 'close_round', 'create_application', 'change_application_state', 'reverse_application_state']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_only_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_only_permissions" CHECK (role = 'moderator' OR NOT (permissions && ARRAY['reverse_application_state']::text[]));
