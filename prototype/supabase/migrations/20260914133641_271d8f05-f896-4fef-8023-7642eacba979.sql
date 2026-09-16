CREATE OR REPLACE FUNCTION public.round_vote_stats(_round_id uuid)
RETURNS TABLE(total_votes integer, voters_voted integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hh uuid := public.current_household_id();
BEGIN
  IF public.is_household_account() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT count(v.id)::int, count(DISTINCT v.voter_id)::int
  FROM public.votes v
  JOIN public.applications a ON a.id = v.application_id
  JOIN public.rounds r ON r.id = a.round_id
  WHERE a.round_id = _round_id AND r.household_id = hh AND v.stage = 'invite';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.round_vote_stats(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.round_vote_stats(uuid) TO authenticated;
