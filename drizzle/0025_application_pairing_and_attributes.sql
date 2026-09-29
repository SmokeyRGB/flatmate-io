-- F3 change 2 (application-capture), PR #39 review fixes. Two changes, no SECURITY DEFINER, so an
-- agent may apply this file (0026 holds the definer function and is a human hand-off).
--
--   1. The round <-> application pairing trigger of 0023 now LOCKS the round row it checks
--      (FOR SHARE). A plain EXISTS read let an insert commit against a round that a concurrent
--      transaction was deleting or re-homing: both statements passed their own check, and the
--      application was left pointing at no round. The lock makes the insert wait for that
--      transaction and re-check its outcome. (The reverse path, deleting a round that has
--      applications, is 0026.)
--   2. The per-element limits of application.attributes move into the database. A CHECK cannot
--      hold a subquery, but it can call an IMMUTABLE function, and the function can iterate. The
--      limits are the C-3.14 values of APPLICATION_LIMITS (src/modules/casting/application-input.ts):
--      1-10 entries, each an object with exactly the string keys label (1-60 after btrim) and
--      value (1-500 after btrim).
--
-- Re-runnable (CLAUDE.md "Migrations"): CREATE OR REPLACE for both functions (neither has a
-- RETURNS TABLE shape), DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT. Order, argued against the
-- constraints live at each statement:
--   a. the pairing function first: replacing a function body changes no stored row;
--   b. the validity function BEFORE the CHECK that calls it;
--   c. the CHECK last. Adding it validates every existing row. A row that a valid capture wrote
--      already satisfies it (the repository parser enforced the same limits), so it cannot fail on
--      real data; it would fail only on a row written by raw SQL that the old CHECK let through.
--
-- The validity function returns early with false: jsonb_array_length raises 22023 on a non-array,
-- so every branch checks jsonb_typeof first instead of relying on AND's evaluation order.

CREATE OR REPLACE FUNCTION application_round_same_household() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- A missing round_id is refused by NOT NULL (23502), not by this trigger.
  IF NEW.round_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- FOR SHARE (not KEY SHARE: a change of household_id is a non-key UPDATE, which KEY SHARE does
  -- not conflict with) waits for any transaction that deleted or changed the round and has not
  -- ended. If the round is gone or moved when it ends, NOT FOUND refuses the insert.
  PERFORM 1 FROM casting_round
    WHERE id = NEW.round_id AND household_id = NEW.household_id
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'application.round_id must name a round of the same household'
      USING ERRCODE = '23503', CONSTRAINT = 'application_round_same_household';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION application_attributes_valid(a jsonb) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  e jsonb;
BEGIN
  IF a IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(a) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(a) NOT BETWEEN 1 AND 10 THEN
    RETURN false;
  END IF;
  FOR e IN SELECT jsonb_array_elements(a) LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      RETURN false;
    END IF;
    -- Exactly the keys label and value: two keys, both present.
    IF (SELECT count(*) FROM jsonb_object_keys(e)) <> 2 THEN
      RETURN false;
    END IF;
    IF COALESCE(jsonb_typeof(e -> 'label'), '') <> 'string'
       OR COALESCE(jsonb_typeof(e -> 'value'), '') <> 'string' THEN
      RETURN false;
    END IF;
    IF char_length(btrim(e ->> 'label')) NOT BETWEEN 1 AND 60 THEN
      RETURN false;
    END IF;
    IF char_length(btrim(e ->> 'value')) NOT BETWEEN 1 AND 500 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT IF EXISTS "application_attributes_shape";
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_attributes_shape" CHECK (application_attributes_valid(attributes));
