CREATE TYPE "public"."casting_round_status" AS ENUM('draft', 'open', 'paused', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('planned', 'open', 'promised', 'occupied', 'on_hold', 'not_available');--> statement-breakpoint
CREATE TYPE "public"."round_participation_source" AS ENUM('snapshot_at_open', 'added_manually');--> statement-breakpoint
CREATE TABLE "casting_round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "casting_round_status" DEFAULT 'draft' NOT NULL,
	"room_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"settings_snapshot" jsonb,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"phase_deadline_at" timestamp with time zone,
	"quorum_denominator_frozen" integer,
	"retention_until" date,
	"retention_extensions" text[] DEFAULT '{}'::text[] NOT NULL,
	"retention_warned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "casting_round" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" "room_status" DEFAULT 'planned' NOT NULL,
	"current_resident_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "room" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "round_participation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"resident_profile_id" uuid NOT NULL,
	"source" "round_participation_source" NOT NULL,
	"can_vote" boolean NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "round_participation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "casting_round_household_id_idx" ON "casting_round" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "room_household_id_idx" ON "room" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "round_participation_household_id_idx" ON "round_participation" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "round_participation_round_id_idx" ON "round_participation" USING btree ("round_id");--> statement-breakpoint
CREATE POLICY "casting_round_household_isolation" ON "casting_round" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
CREATE POLICY "room_household_isolation" ON "room" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
CREATE POLICY "round_participation_household_isolation" ON "round_participation" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));