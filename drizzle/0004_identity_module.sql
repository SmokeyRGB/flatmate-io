CREATE TYPE "public"."membership_role" AS ENUM('household_admin', 'moderator', 'member');--> statement-breakpoint
CREATE TYPE "public"."resident_profile_status" AS ENUM('prepared', 'active', 'moved_out');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"locale" text DEFAULT 'de' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "household" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"contact_email" text NOT NULL,
	"join_code" text NOT NULL,
	"join_code_rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "household" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "household_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"scale_weights" jsonb DEFAULT '{"no":0,"rather_not":1,"good":3,"definitely":5}'::jsonb NOT NULL,
	"favorite_budget_factor" numeric DEFAULT '1.5' NOT NULL,
	"hide_results_until_voted" boolean DEFAULT true NOT NULL,
	"quorum_share" numeric DEFAULT '0.5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_account_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"resident_profile_id" uuid,
	"is_resident" boolean NOT NULL,
	"role" "membership_role" NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"joined_via_code" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resident_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"status" "resident_profile_status" DEFAULT 'prepared' NOT NULL,
	"moved_in_on" date,
	"moved_out_on" date,
	"room_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resident_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"acting_profile_id" uuid,
	"remember_me" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "account_household_id_idx" ON "account" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "membership_household_id_idx" ON "membership" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "membership_account_id_idx" ON "membership" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "resident_profile_household_id_idx" ON "resident_profile" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resident_profile_display_name_active_idx" ON "resident_profile" USING btree ("household_id","display_name") WHERE status != 'moved_out';--> statement-breakpoint
CREATE INDEX "session_household_id_idx" ON "session" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "session_account_id_idx" ON "session" USING btree ("account_id");--> statement-breakpoint
CREATE POLICY "account_household_isolation" ON "account" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
CREATE POLICY "household_is_own_household" ON "household" AS PERMISSIVE FOR ALL TO public USING (id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
CREATE POLICY "household_settings_is_own_household" ON "household_settings" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
CREATE POLICY "membership_household_isolation" ON "membership" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
CREATE POLICY "resident_profile_household_isolation" ON "resident_profile" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));--> statement-breakpoint
CREATE POLICY "session_household_isolation" ON "session" AS PERMISSIVE FOR ALL TO public USING (household_id = (select current_setting('app.household_id', true)::uuid)) WITH CHECK (household_id = (select current_setting('app.household_id', true)::uuid));