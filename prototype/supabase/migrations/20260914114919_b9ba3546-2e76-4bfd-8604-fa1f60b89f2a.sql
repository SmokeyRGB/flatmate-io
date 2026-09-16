REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_household_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_household_account() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.round_ranking(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_account() TO authenticated;