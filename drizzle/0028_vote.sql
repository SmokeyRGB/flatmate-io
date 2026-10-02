-- F4 change 1 (screening-pass): the `vote` table, its policies, and two non-definer triggers.
-- Neither trigger runs with definer rights, and nothing is dropped, so an agent may apply this file.
--
-- The vote rules live here, in the database, for every writer (the repository, raw SQL as
-- app_runtime, a future definer-rights function); castVote only maps the refusals to typed codes.
--   * `vote_guard` (BEFORE INSERT OR UPDATE ON vote) refuses, in this order and with the shared
--     locks taken in this order: a round that is missing or not open, a voter without an active
--     voting participation, a voter whose profile is not active, an application that is missing
--     or not paired with the round, the voter's own application, an application that is not in
--     `new`/`screened`. Step 0 normalises the timestamps on INSERT and pins the identity columns
--     on UPDATE. Every refusal is SQLSTATE 23514 with a named constraint.
--   * `application_keeps_votes` (BEFORE UPDATE OF round_id, household_id ON application) is the
--     parent side of the pairing: it refuses moving an application that already has votes to
--     another round or household, which the pairing trigger of 0023/0025 would accept.
--
-- Policies: household isolation (PERMISSIVE), the RESTRICTIVE resident-profile policy (G-D15 (b)),
-- and two RESTRICTIVE own-profile policies for INSERT and UPDATE. SELECT and DELETE stay
-- household plus profile: who may read other residents' votes is F5's, and F3 change 4's
-- deleteApplication must delete other residents' votes.
--
-- Order of statements, against the constraints live at each one: enums (a new TYPE may be used in
-- the same transaction), table, indexes, RLS and policies, then the two functions, then the
-- triggers. The table is new and empty, so no statement changes data under a constraint.
--
-- Re-runnable: guarded enum creates, IF NOT EXISTS on the table and indexes, DROP POLICY IF EXISTS
-- before each policy, CREATE OR REPLACE for the functions (their return type never changes),
-- DROP TRIGGER IF EXISTS before each CREATE TRIGGER.
--
-- vote_guard runs TWICE on INSERT ... ON CONFLICT DO UPDATE: BEFORE INSERT on the proposed row
-- (before conflict detection), then BEFORE UPDATE after the existing row is locked. The second run
-- re-takes shared locks it already holds. Lock order of an upsert: round, participation, profile,
-- application (all FOR SHARE), then the vote row. A plain UPDATE of a vote row locks the vote row
-- first.
--
-- Lock-order obligations for later writers (these deadlock otherwise):
--   * deleteApplication (F3 change 4) locks the application FOR UPDATE FIRST, then deletes its
--     votes.
--   * Every repository UPDATE of a vote (withdrawVote, change 2) reads the application FOR SHARE
--     BEFORE it touches the vote row.
--   A raw UPDATE of a vote cannot be ordered and may lose a deadlock (40P01); that is safe.
--
-- The function names no soft-delete column: F3 change 4 drops it, and a plpgsql body that names
-- a dropped column fails at run time, not at DROP.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vote_stage' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "public"."vote_stage" AS ENUM('invite', 'offer');
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vote_value' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "public"."vote_value" AS ENUM('no', 'rather_not', 'good', 'definitely');
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"resident_profile_id" uuid NOT NULL,
	"stage" "vote_stage" NOT NULL,
	"value" "vote_value" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "vote" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vote_household_id_idx" ON "vote" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vote_round_id_idx" ON "vote" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vote_application_profile_stage_idx" ON "vote" USING btree ("application_id","resident_profile_id","stage");--> statement-breakpoint
DROP POLICY IF EXISTS "vote_household_isolation" ON "vote";--> statement-breakpoint
CREATE POLICY "vote_household_isolation" ON "vote" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
DROP POLICY IF EXISTS "vote_requires_resident_profile" ON "vote";--> statement-breakpoint
CREATE POLICY "vote_requires_resident_profile" ON "vote" AS RESTRICTIVE FOR ALL TO public USING ((select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL) WITH CHECK ((select nullif(current_setting('app.profile_id', true), '')) IS NOT NULL);--> statement-breakpoint
DROP POLICY IF EXISTS "vote_own_profile_insert" ON "vote";--> statement-breakpoint
CREATE POLICY "vote_own_profile_insert" ON "vote" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (resident_profile_id = (select nullif(current_setting('app.profile_id', true), '')::uuid));--> statement-breakpoint
DROP POLICY IF EXISTS "vote_own_profile_update" ON "vote";--> statement-breakpoint
CREATE POLICY "vote_own_profile_update" ON "vote" AS RESTRICTIVE FOR UPDATE TO public USING (resident_profile_id = (select nullif(current_setting('app.profile_id', true), '')::uuid)) WITH CHECK (resident_profile_id = (select nullif(current_setting('app.profile_id', true), '')::uuid));--> statement-breakpoint
CREATE OR REPLACE FUNCTION vote_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  round_status text;
  app_round uuid;
  app_became_resident uuid;
  app_state text;
BEGIN
  -- 0. INSERT: normalise, do not trust what the writer supplied. UPDATE: the identity of the row
  --    is immutable, and updated_at is stamped here.
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := clock_timestamp();
    NEW.updated_at := NEW.created_at;
    NEW.withdrawn_at := NULL;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.household_id IS DISTINCT FROM OLD.household_id
       OR NEW.round_id IS DISTINCT FROM OLD.round_id
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.resident_profile_id IS DISTINCT FROM OLD.resident_profile_id
       OR NEW.stage IS DISTINCT FROM OLD.stage
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'vote identity columns are immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'vote_identity_immutable';
    END IF;
    NEW.updated_at := clock_timestamp();
  END IF;

  -- 1. The round exists in this household. FOR SHARE waits for a writer of its status.
  SELECT status::text INTO round_status FROM casting_round
    WHERE id = NEW.round_id AND household_id = NEW.household_id
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vote must name an application of a round of the same household'
      USING ERRCODE = '23514', CONSTRAINT = 'vote_application_paired';
  END IF;

  -- 2. The round is open. DETAIL carries the status for the caller.
  IF round_status <> 'open' THEN
    RAISE EXCEPTION 'the round is not open'
      USING ERRCODE = '23514', CONSTRAINT = 'vote_round_open', DETAIL = round_status;
  END IF;

  -- 3. The voter holds an active participation with the right to vote.
  PERFORM 1 FROM round_participation
    WHERE round_id = NEW.round_id
      AND resident_profile_id = NEW.resident_profile_id
      AND household_id = NEW.household_id
      AND removed_at IS NULL
      AND can_vote
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the voter is not an eligible participant of the round'
      USING ERRCODE = '23514', CONSTRAINT = 'vote_voter_eligible';
  END IF;

  -- 4. The voter's profile is active.
  PERFORM 1 FROM resident_profile
    WHERE id = NEW.resident_profile_id
      AND household_id = NEW.household_id
      AND status = 'active'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the voter is not an eligible participant of the round'
      USING ERRCODE = '23514', CONSTRAINT = 'vote_voter_eligible';
  END IF;

  -- 5. The application exists in this household and belongs to this round. A session with no
  --    resident profile cannot see application rows (drizzle/0018) and lands here.
  SELECT round_id, became_resident_id, state::text
    INTO app_round, app_became_resident, app_state
    FROM application
    WHERE id = NEW.application_id AND household_id = NEW.household_id
    FOR SHARE;
  IF NOT FOUND OR app_round <> NEW.round_id THEN
    RAISE EXCEPTION 'vote must name an application of a round of the same household'
      USING ERRCODE = '23514', CONSTRAINT = 'vote_application_paired';
  END IF;

  -- 6. Not the voter's own application.
  IF app_became_resident = NEW.resident_profile_id THEN
    RAISE EXCEPTION 'a resident does not vote on their own application'
      USING ERRCODE = '23514', CONSTRAINT = 'vote_not_own_application';
  END IF;

  -- 7. The application is still in the voting stage.
  IF app_state NOT IN ('new', 'screened') THEN
    RAISE EXCEPTION 'the application is not open for screening'
      USING ERRCODE = '23514', CONSTRAINT = 'vote_application_votable';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION application_keeps_votes() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.household_id IS DISTINCT FROM OLD.household_id)
     AND EXISTS (
       SELECT 1 FROM vote
       WHERE application_id = OLD.id AND household_id = OLD.household_id
     ) THEN
    RAISE EXCEPTION 'application still has votes'
      USING ERRCODE = '23514', CONSTRAINT = 'application_keeps_votes';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS vote_guard ON "vote";
--> statement-breakpoint
CREATE TRIGGER vote_guard
  BEFORE INSERT OR UPDATE ON "vote"
  FOR EACH ROW EXECUTE FUNCTION vote_guard();
--> statement-breakpoint
DROP TRIGGER IF EXISTS application_keeps_votes ON "application";
--> statement-breakpoint
CREATE TRIGGER application_keeps_votes
  BEFORE UPDATE OF round_id, household_id ON "application"
  FOR EACH ROW EXECUTE FUNCTION application_keeps_votes();
