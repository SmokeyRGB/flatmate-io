CREATE TYPE "public"."application_state" AS ENUM('new', 'screened', 'invited', 'scheduled', 'interviewed', 'offer_made', 'moved_in', 'rejected_by_household', 'declined_by_applicant', 'withdrawn', 'archived');--> statement-breakpoint
CREATE TABLE "application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"round_id" uuid,
	"state" "application_state" NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"became_resident_id" uuid,
	"created_by_account_id" uuid NOT NULL,
	"created_by_profile_id" uuid NOT NULL,
	"retention_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "application" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"round_id" uuid,
	"event_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"actor_account_id" uuid,
	"actor_profile_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"correlation_id" uuid,
	"reverses_event_id" uuid
);
--> statement-breakpoint
ALTER TABLE "activity_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "application_household_id_idx" ON "application" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "activity_event_household_id_idx" ON "activity_event" USING btree ("household_id");--> statement-breakpoint
CREATE POLICY "application_household_isolation" ON "application" AS PERMISSIVE FOR ALL TO public USING (household_id = current_setting('app.household_id', true)::uuid) WITH CHECK (household_id = current_setting('app.household_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "activityevent_household_isolation" ON "activity_event" AS PERMISSIVE FOR ALL TO public USING (household_id = current_setting('app.household_id', true)::uuid) WITH CHECK (household_id = current_setting('app.household_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "activityevent_append_only_update" ON "activity_event" AS RESTRICTIVE FOR UPDATE TO public USING (false);--> statement-breakpoint
CREATE POLICY "activityevent_append_only_delete" ON "activity_event" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
-- FR-0.13: append-only must hold "through the application, a migration, and raw SQL" — FORCE
-- makes the restrictive policies above apply even to the table owner (the role migrations run
-- as), not only to app_runtime. Postgres exempts the owner from RLS by default; FORCE is what
-- closes that exemption. drizzle-kit has no schema-level API for this, so it's added by hand.
ALTER TABLE "activity_event" FORCE ROW LEVEL SECURITY;