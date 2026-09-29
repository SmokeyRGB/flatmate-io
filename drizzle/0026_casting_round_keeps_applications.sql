-- F3 change 2 (application-capture), PR #39 review fix: the reverse path of the round <->
-- application pairing. 0023 stops an application from pointing at a foreign or missing round at
-- INSERT/UPDATE time; nothing stopped the round from going away afterwards. There are no foreign
-- keys, so a DELETE of a round (or a change of its id or household_id) left its applications
-- pointing at nothing. This trigger refuses it, for every writer including raw SQL.
--
-- HUMAN HAND-OFF: contains SECURITY DEFINER, which the agent harness refuses. A human runs the
-- WHOLE file in the Supabase SQL editor on flatmate-io-dev (the file is re-runnable), and on
-- production only at the end of v0.1 (production deliberately stays at 0012).
--
-- Why SECURITY DEFINER: application carries a RESTRICTIVE policy (drizzle/0018) that hides every
-- row from a profile-less session (the household account). An invoker-rights trigger in such a
-- session would see no applications and let the round go, which is exactly the leak. The function
-- runs as its owner, past RLS, and answers only "does this round still have applications". Its
-- one query carries BOTH predicates (round_id AND household_id), so the definer rights read
-- nothing outside the round's own household. The message is a fixed text, with no id in it.
--
-- Why AFTER, not BEFORE: tests/helpers/identity.ts cleans a household with ONE statement whose
-- data-modifying CTEs delete application and casting_round together. An AFTER row trigger fires
-- when that statement ends and sees all of its effects, so the applications are already gone; a
-- BEFORE trigger would still see them and refuse the cleanup.
--
-- Re-runnable: DROP TRIGGER IF EXISTS first (a function cannot be dropped while a trigger uses
-- it), then DROP FUNCTION IF EXISTS, then CREATE FUNCTION, then CREATE TRIGGER. search_path is set
-- on the definer function (definer-coverage lint, and the usual hijack guard).

DROP TRIGGER IF EXISTS casting_round_keeps_applications ON "casting_round";
--> statement-breakpoint
DROP FUNCTION IF EXISTS casting_round_keeps_applications();
--> statement-breakpoint
CREATE FUNCTION casting_round_keeps_applications() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  moved boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    moved := true;
  ELSE
    moved := NEW.id IS DISTINCT FROM OLD.id OR NEW.household_id IS DISTINCT FROM OLD.household_id;
  END IF;
  IF moved AND EXISTS (
    SELECT 1 FROM application
    WHERE round_id = OLD.id AND household_id = OLD.household_id
  ) THEN
    RAISE EXCEPTION 'casting_round still has applications'
      USING ERRCODE = '23503', CONSTRAINT = 'casting_round_keeps_applications';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER casting_round_keeps_applications
  AFTER DELETE OR UPDATE OF id, household_id ON "casting_round"
  FOR EACH ROW EXECUTE FUNCTION casting_round_keeps_applications();
