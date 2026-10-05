-- HUMAN HAND-OFF. Run this whole file in the Supabase SQL editor on flatmate-io-dev, as the
-- migration role (postgres). Do not apply it through DATABASE_URL (that login is app_runtime and
-- cannot create a privileged function), and the agent harness refuses SECURITY DEFINER statements.
-- Production only at go-live, after the rest of the chain. Re-runnable: DROP FUNCTION IF EXISTS
-- first, so a second run meets no "already exists".
--
-- household-sign-in-code design D3: the lookup from a household sign-in code to the household id,
-- called by signInResidentByHouseholdCode BEFORE any session exists. It is the only unauthenticated
-- path to household.sign_in_code, because `household`'s one policy (household_is_own_household)
-- keys on the id and a lookup by anything else is impossible as app_runtime without a deliberate
-- hole. This is that hole, kept as narrow as it can be:
--   - one column (the id; C-1.4 "keine Sicherheitsgrenze, nur Zuordnung"), never the name;
--   - an exact match, and at most one row because of the unique index household_sign_in_code_key
--     (drizzle/0032), so RETURNS uuid (not SETOF) is never ambiguous;
--   - deleted_at IS NULL is carried INSIDE the function, because RLS does not apply in it;
--   - the caller never sees the result: signInResidentByHouseholdCode uses it only to open the
--     bootstrap scan and then refuses an unknown code exactly like a wrong password, with the same
--     provider request sequence (auth-provider-deadline D11). An exact-match lookup in a 32^12
--     space is not an enumeration surface when its answer is not observable.
-- The sign-in rate limit is NOT what keeps this lookup's answer secret (nothing leaks). It bounds
-- password guesses against a known household and name. Read it that way.

DROP FUNCTION IF EXISTS resolve_household_sign_in_code(text);
--> statement-breakpoint
CREATE FUNCTION resolve_household_sign_in_code(p_code text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM household WHERE sign_in_code = p_code AND deleted_at IS NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_household_sign_in_code(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_household_sign_in_code(text) TO app_runtime;
