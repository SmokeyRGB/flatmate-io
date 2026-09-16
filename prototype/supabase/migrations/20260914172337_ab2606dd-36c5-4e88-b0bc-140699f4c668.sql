CREATE OR REPLACE FUNCTION public.round_voters_count(_round_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.rounds r
      WHERE r.id = _round_id AND r.household_id = public.current_household_id()
    ) THEN 0
    ELSE coalesce(
      nullif((SELECT count(*) FROM public.round_participants rp WHERE rp.round_id = _round_id), 0),
      (SELECT count(*) FROM public.profiles p
        JOIN public.rounds r ON r.id = _round_id
        WHERE p.household_id = r.household_id AND p.status = 'active' AND p.is_voter)
    )::int
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.round_voters_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.round_voters_count(uuid) TO authenticated;