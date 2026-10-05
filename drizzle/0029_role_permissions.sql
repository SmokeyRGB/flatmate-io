-- F3 change 2b (role-permissions), design D1-D3. One permission per row of the Rechtematrix
-- (03-PRD.md §4.0.1): manage_voting_procedure (renames manage_settings), manage_join_codes,
-- create_resident_profile, appoint_moderator, manage_members, export_subject_access,
-- issue_password_reset_link, manage_rounds (renames close_round), manage_round_participation and
-- vote (the resident set's first permission). This is the EXPAND half of expand/contract: it must
-- not refuse anything that branches without this change still write to the shared dev database
-- (old registration writes the household's two values, old appointment the moderator's five,
-- old claim/join the empty resident set). The lower bounds come with the contract migration.
--
-- Re-runnable (CLAUDE.md "Migrations"): every backfill is WHERE NOT (permissions @> ...), every
-- constraint is dropped IF EXISTS before it is added, and the precondition passes on a migrated
-- table. A human may run the whole file again after a partial apply.
--
-- Order, argued against the constraints live at each statement:
--   1. LOCK TABLE first, SHARE ROW EXCLUSIVE (as 0024/0027 do): no registration, appointment,
--      demotion or reactivation can land between the backfills and the CHECKs that rely on them.
--   2. A precondition: if a row outside a holder group already holds one of that group's new
--      values (manage_rounds, manage_round_participation, issue_password_reset_link, the six
--      administration values, vote on a row without is_resident), stop. None can today (the values
--      are new); they are never silently stripped.
--   3. Drop the household CHECK and the moderator-only CHECK. The household CHECK (<@ the old two
--      values) would refuse step 4; the moderator-only CHECK is re-added wider in step 8.
--   4. Household backfill: sorted union with the eight values. Live at this statement:
--      membership_admin_has_no_profile, membership_revoked_holds_nothing (live rows only) and the
--      moderator CHECK (does not apply to a household row).
--   5. Rename backfills, one statement per REPLACED_PERMISSIONS entry, each limited to the roles the
--      target's holders allow: close_round -> manage_rounds for live moderators;
--      manage_settings -> manage_voting_procedure for live household rows (already covered by step 4)
--      and for live moderators individually granted it. A plain member holding an old name (test
--      data on dev only) carries nothing over: residents hold no organising permission. The old
--      names stay on every row for now; the contract migration strips them.
--   6. Moderator backfill: union with manage_join_codes, create_resident_profile, appoint_moderator,
--      manage_members, export_subject_access and manage_round_participation (manage_voting_procedure
--      comes from step 5, for moderators granted manage_settings only). The moderator CHECK (the old
--      five) is still live; a union keeps the five.
--   6a. Resident backfill: union with vote for live is_resident rows. Live: the resident CHECK
--      (@> '{}') and the moderator CHECK, both unchanged by a union; membership_admin_has_no_profile
--      guarantees no household row is is_resident, so the household ceiling is never touched.
--   7. Drop and re-add the moderator CHECK at the FLOOR (the four values old and new sets share):
--      a relaxation, valid on every row.
--   8. Add the household CHECK (floor manage_rooms, ceiling the eight plus the retired
--      manage_settings), the widened moderator-only CHECK and, dropping first, the household-only,
--      administration and resident-only CHECKs. Valid by step 2 plus the backfills, which add each
--      value only to rows its group allows (manage_rounds to moderators only, step 5).
--
-- The array literals below are the constants of src/modules/identity/schema.ts (PERMISSIONS,
-- ROLE_SETS, the *_UNTIL_CONTRACT bounds); tests/unit/identity/role-permissions-constants.test.ts
-- keeps the two honest.
--
-- Rollback (only before code depends on it; a note, not a script): array_remove the new values,
-- drop the five new CHECKs, re-add the old exact household CHECK, the five-value moderator CHECK
-- and the one-value moderator-only CHECK.

LOCK TABLE "membership" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "membership"
    WHERE (role <> 'moderator' AND permissions && ARRAY['manage_rounds', 'manage_round_participation']::text[])
       OR (role <> 'household_admin' AND permissions && ARRAY['issue_password_reset_link']::text[])
       OR (role NOT IN ('household_admin', 'moderator')
           AND permissions && ARRAY['manage_voting_procedure', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access']::text[])
       OR (NOT is_resident AND permissions && ARRAY['vote']::text[])
  ) THEN
    RAISE EXCEPTION 'a membership outside its holder group already holds one of the new permissions';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_household_admin_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_only_permissions";
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
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['manage_rounds']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'moderator'
    AND permissions @> ARRAY['close_round']::text[]
    AND NOT (permissions @> ARRAY['manage_rounds']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['manage_voting_procedure']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role IN ('household_admin', 'moderator')
    AND permissions @> ARRAY['manage_settings']::text[]
    AND NOT (permissions @> ARRAY['manage_voting_procedure']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'manage_round_participation']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND role = 'moderator'
    AND NOT (permissions @> ARRAY['manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'manage_round_participation']::text[]);
--> statement-breakpoint
UPDATE "membership"
  SET permissions = ARRAY(
    SELECT DISTINCT p FROM unnest(permissions || ARRAY['vote']::text[]) AS p ORDER BY p
  )
  WHERE revoked_at IS NULL AND is_resident
    AND NOT (permissions @> ARRAY['vote']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_moderator_holds_role_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'moderator' OR permissions @> ARRAY['manage_rooms', 'create_application', 'change_application_state', 'reverse_application_state']::text[]);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_household_admin_holds_role_permissions" CHECK (revoked_at IS NOT NULL OR role <> 'household_admin' OR (permissions @> ARRAY['manage_rooms']::text[] AND permissions <@ ARRAY['manage_voting_procedure', 'manage_rooms', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access', 'issue_password_reset_link', 'manage_settings']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_moderator_only_permissions" CHECK (role = 'moderator' OR NOT (permissions && ARRAY['manage_rounds', 'manage_round_participation', 'reverse_application_state']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_household_only_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_household_only_permissions" CHECK (role = 'household_admin' OR NOT (permissions && ARRAY['issue_password_reset_link']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_administration_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_administration_permissions" CHECK (role IN ('household_admin', 'moderator') OR NOT (permissions && ARRAY['manage_voting_procedure', 'manage_join_codes', 'create_resident_profile', 'appoint_moderator', 'manage_members', 'export_subject_access']::text[]));
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT IF EXISTS "membership_resident_only_permissions";
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_resident_only_permissions" CHECK (is_resident OR NOT (permissions && ARRAY['vote']::text[]));
