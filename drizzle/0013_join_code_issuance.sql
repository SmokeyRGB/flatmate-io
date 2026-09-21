-- join-code-protections (O-18): replaces Household's single rotating join_code with the
-- JoinCodeIssuance entity (domain/identity.md §2.1) — a household issues several links at once,
-- each with its own expiry, cap and count. Hand-written (drizzle-kit generate --custom), because
-- step order matters and a plain schema diff would not sequence the data copy correctly.
--
-- design.md Decision 4: five steps, IN THIS ORDER. Step 2 (copy) MUST precede step 4 (drop) in
-- this same migration, or a deploy that landed between them would leave a household with no link
-- at all.
--
-- *** ROLLBACK WARNING (design.md Decision 4 / "Migration Plan") ***
-- This migration is destructive and rollback is NOT clean once step 4 has run: every household's
-- code exists only in join_code_issuance after that point, and household.join_code no longer
-- exists to roll back to. This is acceptable only because flatmate-io-dev is this project's one
-- and only deployment and is disposable. It would NOT be acceptable against a real household's
-- data — do not copy this migration's shape for a destructive change once a production deployment
-- exists without first designing an actual rollback path.

-- Step 1: create the table, RLS-scoped on household_id like every other household-scoped table
-- (schema.ts's HOUSEHOLD_MATCH policy). No `status` column — domain/identity.md §2.1 forbids it
-- by name; a link's state is derived from deleted_at / expires_at / uses < max_uses.
CREATE TABLE "join_code_issuance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "join_code_issuance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE INDEX "join_code_issuance_household_id_idx" ON "join_code_issuance" USING btree ("household_id");
--> statement-breakpoint
-- Unique ACROSS ALL households (not scoped per household) — resolving a presented code is the
-- only input a stranger supplies, so the code alone must identify at most one row (FR-2.9).
CREATE UNIQUE INDEX "join_code_issuance_code_idx" ON "join_code_issuance" USING btree ("code");
--> statement-breakpoint
CREATE POLICY "join_code_issuance_household_isolation" ON "join_code_issuance" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));
--> statement-breakpoint

-- Step 2: copy each existing household's current join_code into ONE single-use issuance row,
-- expiring seven days out. Both expires_at and max_uses are NOT NULL on the new table (proposal.md
-- Assumption 2 / spec.md "There SHALL be no such thing as an unlimited link") — there is no
-- "unlimited" state to migrate into, by design. This TIGHTENS every existing link (was: no expiry,
-- no cap, no count); uses = 0 is the only honest starting value, because the old model never
-- counted redemptions at all.
INSERT INTO "join_code_issuance" (household_id, code, expires_at, max_uses, uses, created_by_account_id)
SELECT h.id, h.join_code, now() + interval '7 days', 1, 0, h.owner_account_id
FROM "household" h
WHERE h.deleted_at IS NULL;
--> statement-breakpoint

-- Step 3: membership.joined_via_code (text, declared since F1, never written) becomes
-- joined_via_issuance_id (uuid) — a reference to the issuing row, not a copy of the code itself
-- (storing the code on this row a second time would undercut G-A5). Never written, so there is no
-- data to convert; a plain rename + retype is safe.
ALTER TABLE "membership" RENAME COLUMN "joined_via_code" TO "joined_via_issuance_id";
--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "joined_via_issuance_id" TYPE uuid USING "joined_via_issuance_id"::uuid;
--> statement-breakpoint

-- Step 4: only NOW, after step 2 has copied every household's code forward, drop the columns F1
-- shipped on household. This is the point of no return — see the rollback warning above.
ALTER TABLE "household" DROP COLUMN "join_code";
--> statement-breakpoint
ALTER TABLE "household" DROP COLUMN "join_code_rotated_at";
--> statement-breakpoint

-- Step 5: the two SECURITY DEFINER functions a code-presenting stranger's request resolves
-- through — no session, no household_id yet, which is exactly what resolving a code is for.
-- Structure and comment style follow drizzle/0005_identity_login_bootstrap_function.sql, this
-- project's one prior "deliberate hole" in the RLS wall.
--
-- *** DEPENDENCY WARNING, read this before calling either function from a new route ***
-- These functions take a stranger's string with no rate limiting of their own. They are
-- defensible ONLY because there is, as of this migration, no public route that can call them —
-- change 1 of F2's four ships no join route. FR-2.28 (join-code-protections's change 2) MUST add
-- an attempt limit on whatever route calls claim_join_code/resolve_join_code before that route
-- goes live, or a shortened code (FR-2.26, less entropy than the uuid it replaced) becomes an
-- oracle against the whole estate (domain/identity.md §2.1). This is not a note to delete once
-- change 2 ships — it is the reason change 2's rate limit is not optional.
--
-- resolve_join_code: STABLE, non-consuming — FR-2.9 requires showing the household's name before
-- any input is requested, so *looking* at a link must not spend one of its uses. Returns the same
-- three columns as claim_join_code below (household_id, issuance_id, household_name) so both
-- resolve to the one JoinCodeResolution shape the repository layer never lets branch on a reason
-- (design.md Decision 2/3).
CREATE FUNCTION resolve_join_code(p_code text) RETURNS TABLE (household_id uuid, issuance_id uuid, household_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT h.id, jci.id, h.name
  FROM "join_code_issuance" jci
  JOIN "household" h ON h.id = jci.household_id
  WHERE jci.code = p_code
    AND jci.deleted_at IS NULL
    AND jci.expires_at > now()
    AND jci.uses < jci.max_uses
    AND h.deleted_at IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_join_code(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_join_code(text) TO app_runtime;
--> statement-breakpoint

-- claim_join_code: VOLATILE — design.md Decision 1's single conditional UPDATE ... RETURNING.
-- One statement decides AND counts, so there is no window between the halves for a competitor to
-- slip through: Postgres re-evaluates the WHERE against the updated row when two writers contend
-- for the same one (EC-2.1). Returns no row when the code is expired, used up, deleted, or never
-- valid — refusal is one outcome, structurally incapable of saying which (FR-2.8).
CREATE FUNCTION claim_join_code(p_code text) RETURNS TABLE (household_id uuid, issuance_id uuid, household_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public VOLATILE AS $$
  WITH claimed AS (
    UPDATE "join_code_issuance"
       SET uses = uses + 1
     WHERE code = p_code
       AND deleted_at IS NULL
       AND expires_at > now()
       AND uses < max_uses
    RETURNING household_id, id AS issuance_id
  )
  SELECT h.id, claimed.issuance_id, h.name
  FROM claimed
  JOIN "household" h ON h.id = claimed.household_id
  WHERE h.deleted_at IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_join_code(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_join_code(text) TO app_runtime;
