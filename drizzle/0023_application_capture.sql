-- F3 change 2 (application-capture), design D1 + D12. Adds the applicant columns and the two axes
-- of S-38 to "application", makes round_id NOT NULL, adds the C-3.14 length CHECKs, and adds the
-- trigger that keeps an application in a round of its own household.
--
-- Re-runnable (CLAUDE.md "Migrations"): a human may run the whole file again after a partial
-- apply. Statement order is argued against the constraints live at each statement:
--
--   1. LOCK TABLE first. From here on no concurrent insert can land between the precondition
--      check and the ALTERs. The ALTERs would take this lock anyway, but only AFTER the check.
--   2. The precondition. NOT NULL columns without a default (applicant_name, source,
--      collected_from) and a NOT NULL round_id are valid only on an empty table, and nothing
--      honest can be invented for a name or a collection source (C-3.2: never silently
--      defaulted). It raises only while applicant_name does not exist yet, so a later full re-run
--      does not fail on rows that legitimately exist by then. Migrations run as postgres, which
--      RLS does not filter, so the count is real.
--   3. The enum types, guarded against duplicate_object. They are new types, not ADD VALUE, so
--      the own-file rule of migration-shape.ts does not apply.
--   4. The columns. No DEFAULT on any of them (C-3.2, AC-3.7). Valid because step 2 proved the
--      table empty.
--   5. round_id NOT NULL. Valid on the empty table, and idempotent as written.
--   6. The CHECKs. Each is dropped and re-added. Order among them does not matter (empty table).
--   7. The pairing trigger comes LAST: it relies on round_id being NOT NULL, and no existing row
--      is checked retroactively (none exists).
--
-- The attributes CHECK uses CASE: jsonb_array_length on a non-array raises 22023 instead of a
-- check violation, and AND has no evaluation-order guarantee. The per-element limits of the
-- attributes (label 1-60, value 1-500) are NOT in the database: a CHECK cannot hold a subquery.
-- The repository enforces them.
--
-- Trigger, not SECURITY DEFINER (so no definer-coverage obligation): it runs as the writer, and
-- its explicit household_id predicate carries the rule. RLS is only an extra layer for
-- app_runtime, and as postgres (SQL editor, migrations) the predicate alone still decides.

LOCK TABLE "application" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE
  n bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'application' AND column_name = 'applicant_name'
  ) THEN
    SELECT count(*) INTO n FROM "application";
    IF n > 0 THEN
      RAISE EXCEPTION 'application holds % row(s): the new NOT NULL columns (applicant_name, source, collected_from) have no default, and no name or collection source may be invented for existing rows', n;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."application_collected_from" AS ENUM('data_subject', 'third_party');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."application_source" AS ENUM('manual_form', 'paste_parser', 'availability_link', 'portal_import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "applicant_name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "age" integer;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "contact_email" text;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "contact_phone" text;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "contact_other" text;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "message_raw" text;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "attributes" jsonb;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "source" "application_source" NOT NULL;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "collected_from" "application_collected_from" NOT NULL;
--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "round_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_applicant_name_length";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_applicant_name_length" CHECK (char_length(btrim(applicant_name)) BETWEEN 1 AND 200);
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_applicant_name_not_blank";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_applicant_name_not_blank" CHECK (applicant_name ~ '[^[:space:]]');
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_contact_email_length";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_contact_email_length" CHECK (contact_email IS NULL OR char_length(contact_email) <= 254);
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_contact_phone_length";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_contact_phone_length" CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 50);
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_contact_other_length";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_contact_other_length" CHECK (contact_other IS NULL OR char_length(contact_other) <= 200);
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_message_raw_length";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_message_raw_length" CHECK (message_raw IS NULL OR char_length(message_raw) <= 4000);
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_age_range";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_age_range" CHECK (age IS NULL OR age BETWEEN 0 AND 150);
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_attributes_shape";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_attributes_shape" CHECK (attributes IS NULL OR CASE WHEN jsonb_typeof(attributes) = 'array' THEN jsonb_array_length(attributes) BETWEEN 1 AND 10 ELSE false END);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION application_round_same_household() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- A missing round_id is refused by NOT NULL (23502), not by this trigger.
  IF NEW.round_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM casting_round
    WHERE id = NEW.round_id AND household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'application.round_id must name a round of the same household'
      USING ERRCODE = '23503', CONSTRAINT = 'application_round_same_household';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS application_round_same_household ON "application";
--> statement-breakpoint
CREATE TRIGGER application_round_same_household
  BEFORE INSERT OR UPDATE OF round_id, household_id ON "application"
  FOR EACH ROW EXECUTE FUNCTION application_round_same_household();
