-- founding-link-moderator D1/D5, amended in place for R2 (Copilot round on PR #56): the founding
-- link's whole grant boundary is in the database. It marks the one link registration issues to the
-- founder; whoever redeems it becomes moderator, so raw SQL as app_runtime (which passes RLS) must
-- not be able to widen, re-mark or mint one.
-- Additive and re-runnable: no DROP COLUMN, no SECURITY DEFINER (the trigger function is a plain
-- invoker function), so the agent harness applies it.
-- resolve_join_code and claim_join_code keep their shape and never read this column.
--
-- Statement order, each statement re-runnable:
--   1. the column. Every existing row becomes false, so the CHECK below holds on all of them;
--   2. the CHECK: a founding link is a neutral join link, never a reset link, never bound, and it
--      admits at most one redeemer (max_uses = 1);
--   3. the partial unique index. No row is true yet, so it cannot conflict;
--   4. the trigger function and trigger. They refuse, for INSERT and UPDATE alike:
--        - a founding link created in a household that already has a membership (registration
--          inserts the link before the administering membership, so only registration can);
--        - any change of is_founding_link, in either direction;
--        - lowering `uses` on a founding link.
--      The insert's own RLS WITH CHECK pins the session to NEW.household_id, so the membership
--      read below sees that household (membership_household_isolation applies to the invoker).
ALTER TABLE "join_code_issuance" ADD COLUMN IF NOT EXISTS "is_founding_link" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "join_code_issuance" DROP CONSTRAINT IF EXISTS "join_code_issuance_founding_shape";--> statement-breakpoint
ALTER TABLE "join_code_issuance" ADD CONSTRAINT "join_code_issuance_founding_shape" CHECK (NOT "join_code_issuance"."is_founding_link" OR ("join_code_issuance"."purpose" = 'join' AND "join_code_issuance"."resident_profile_id" IS NULL AND "join_code_issuance"."max_uses" = 1));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "join_code_issuance_one_founding_link" ON "join_code_issuance" USING btree ("household_id") WHERE "join_code_issuance"."is_founding_link";--> statement-breakpoint
CREATE OR REPLACE FUNCTION join_code_issuance_founding_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_founding_link AND EXISTS (SELECT 1 FROM membership WHERE household_id = NEW.household_id) THEN
      RAISE EXCEPTION 'a founding link cannot be created in a household that already has a member'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'join_code_issuance_founding_guard';
    END IF;
  ELSE
    IF NEW.is_founding_link IS DISTINCT FROM OLD.is_founding_link THEN
      RAISE EXCEPTION 'the founding mark of a join link cannot be changed'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'join_code_issuance_founding_guard';
    END IF;
    IF OLD.is_founding_link AND NEW.uses < OLD.uses THEN
      RAISE EXCEPTION 'the use count of a founding link cannot be lowered'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'join_code_issuance_founding_guard';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "join_code_issuance_founding_guard" ON "join_code_issuance";--> statement-breakpoint
CREATE TRIGGER "join_code_issuance_founding_guard"
  BEFORE INSERT OR UPDATE ON "join_code_issuance"
  FOR EACH ROW EXECUTE FUNCTION join_code_issuance_founding_guard();
