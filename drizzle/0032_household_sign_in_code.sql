-- household-sign-in-code: the code a resident types to name the household at sign-in (O-12, P-1).
-- Hand-written (drizzle-kit generate --custom) because a schema diff cannot express the function.
-- Agent-applied: nothing in this file needs the human. The lookup that reads the column lives in
-- 0033, which is a human hand-off.
--
-- The column DEFAULT below is the ONLY generator of the code. Every writer of "household"
-- (registration, test helpers, the demo seed, other branches on shared dev whose schema.ts has
-- never heard of this column) therefore gets a code without naming it, and there is no second,
-- TypeScript copy of the generator to drift. The code is not secret (C-1.4): it names a household,
-- it grants nothing on its own.
--
-- Statement order (design D2), each statement re-runnable:
--   1. the generator function (nothing depends on it yet);
--   2. ADD COLUMN ... NOT NULL DEFAULT <generator>. Postgres evaluates a volatile default once per
--      existing row when it adds the column, so this one statement backfills AND covers future
--      writers. No constraint on the column exists yet, so nothing can refuse the backfill;
--   3. the CHECK. Every value step 2 wrote came from the generator, so all of them satisfy it;
--   4. the unique index, last, because it is the only statement that could fail on the data (a
--      collision). If it does, nothing before it needs undoing: reroll the backfilled rows with
--      UPDATE household SET sign_in_code = household_sign_in_code_generate() and run the file again.

-- Step 1. 12 bytes of gen_random_uuid() (bytes 0-5 and 9-14 of its 16, skipping the version and
-- variant bits), each mapped "% 32" onto the join-code alphabet (no I, O, 0, 1). 256 = 8 * 32, so
-- the mapping is unbiased. Plain SQL, VOLATILE, not a privileged function. A column default runs
-- with the inserting role's privileges, so app_runtime needs EXECUTE; no other role does.
CREATE OR REPLACE FUNCTION household_sign_in_code_generate() RETURNS text
LANGUAGE sql VOLATILE SET search_path = public AS $$
  WITH u AS MATERIALIZED (SELECT uuid_send(gen_random_uuid()) AS b),
  chars AS (
    SELECT i,
           substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                  (get_byte(u.b, CASE WHEN i < 6 THEN i ELSE i + 3 END) % 32) + 1, 1) AS c
    FROM u, generate_series(0, 11) AS i
  )
  SELECT string_agg(c || CASE WHEN i IN (3, 7) THEN '-' ELSE '' END, '' ORDER BY i) FROM chars
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION household_sign_in_code_generate() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION household_sign_in_code_generate() TO app_runtime;
--> statement-breakpoint

-- Step 2.
ALTER TABLE "household" ADD COLUMN IF NOT EXISTS "sign_in_code" text DEFAULT household_sign_in_code_generate() NOT NULL;
--> statement-breakpoint

-- Step 3.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'household_sign_in_code_shape' AND conrelid = 'public.household'::regclass
  ) THEN
    ALTER TABLE "household" ADD CONSTRAINT "household_sign_in_code_shape"
      CHECK ("sign_in_code" ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');
  END IF;
END $$;
--> statement-breakpoint

-- Step 4.
CREATE UNIQUE INDEX IF NOT EXISTS "household_sign_in_code_key" ON "household" USING btree ("sign_in_code");
