-- Sign-in bootstrap exception (documented, narrow, single-column): Supabase Auth confirms an
-- account's credentials before this app's own RLS-scoped tables can be queried, but RLS on
-- "account" requires app.household_id to already be set -- which is exactly the value sign-in
-- needs to discover. This function is the ONE deliberate hole: given an account_id the caller
-- already obtained from a successful Supabase Auth sign-in (so this is never an open guess), it
-- returns only that account's household_id -- no other column, no other row. Not callable to
-- enumerate accounts; the caller must already hold a verified account_id.
CREATE FUNCTION resolve_account_household(p_account_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT household_id FROM account WHERE id = p_account_id AND deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION resolve_account_household(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_account_household(uuid) TO app_runtime;
