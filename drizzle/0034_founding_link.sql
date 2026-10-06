-- founding-link-moderator D1/D5: marks the one link registration issues to the founder.
-- Additive and re-runnable: no DROP COLUMN, no SECURITY DEFINER, so the agent harness applies it.
-- resolve_join_code and claim_join_code keep their shape and never read this column.
--
-- Statement order, each statement re-runnable:
--   1. the column. Every existing row becomes false, so the CHECK below holds on all of them;
--   2. the CHECK: a founding link is a neutral join link, never a reset link, never bound;
--   3. the partial unique index, last. No row is true yet, so it cannot conflict.
ALTER TABLE "join_code_issuance" ADD COLUMN IF NOT EXISTS "is_founding_link" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "join_code_issuance" DROP CONSTRAINT IF EXISTS "join_code_issuance_founding_shape";--> statement-breakpoint
ALTER TABLE "join_code_issuance" ADD CONSTRAINT "join_code_issuance_founding_shape" CHECK (NOT "join_code_issuance"."is_founding_link" OR ("join_code_issuance"."purpose" = 'join' AND "join_code_issuance"."resident_profile_id" IS NULL));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "join_code_issuance_one_founding_link" ON "join_code_issuance" USING btree ("household_id") WHERE "join_code_issuance"."is_founding_link";
