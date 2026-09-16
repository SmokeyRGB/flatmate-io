ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS phase_deadline_at timestamptz;

CREATE TABLE IF NOT EXISTS public.round_participants (
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, profile_id)
);

GRANT SELECT, INSERT, DELETE ON public.round_participants TO authenticated;
GRANT ALL ON public.round_participants TO service_role;

ALTER TABLE public.round_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY round_participants_select ON public.round_participants
  FOR SELECT TO authenticated
  USING (
    NOT public.is_household_account()
    AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_participants.round_id AND r.household_id = public.current_household_id())
  );

CREATE POLICY round_participants_insert ON public.round_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(public.current_profile_id(), 'moderator')
    AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_participants.round_id AND r.household_id = public.current_household_id())
  );

CREATE POLICY round_participants_delete ON public.round_participants
  FOR DELETE TO authenticated
  USING (
    public.has_role(public.current_profile_id(), 'moderator')
    AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_participants.round_id AND r.household_id = public.current_household_id())
  );

-- Bestehende Runden einmalig mit den heutigen Stimmberechtigten füllen.
INSERT INTO public.round_participants (round_id, profile_id)
SELECT r.id, p.id
FROM public.rounds r
JOIN public.profiles p
  ON p.household_id = r.household_id AND p.status = 'active' AND p.is_voter
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.round_voters_count(_round_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    nullif((SELECT count(*) FROM public.round_participants rp WHERE rp.round_id = _round_id), 0),
    (SELECT count(*) FROM public.profiles p
      JOIN public.rounds r ON r.id = _round_id
      WHERE p.household_id = r.household_id AND p.status = 'active' AND p.is_voter)
  )::int;
$$;

REVOKE EXECUTE ON FUNCTION public.round_voters_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.round_voters_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.round_ranking(_round_id uuid)
 RETURNS TABLE(application_id uuid, applicant_name text, state application_state, created_at timestamp with time zone, my_vote vote_value, visible boolean, score integer, vote_count integer, votes_needed integer, quorum_reached boolean, c_no integer, c_rather_not integer, c_good integer, c_definitely integer, is_self boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := public.current_profile_id();
  hh uuid := public.current_household_id();
  r public.rounds%ROWTYPE;
  w jsonb;
  denom integer;
  needed integer;
BEGIN
  SELECT * INTO r FROM public.rounds WHERE id = _round_id;
  IF r.id IS NULL OR r.household_id <> hh OR public.is_household_account() THEN
    RETURN;
  END IF;
  w := r.settings_snapshot->'scale_weights';
  denom := public.round_voters_count(_round_id);
  needed := ceil(r.quorum_share * denom);

  RETURN QUERY
  WITH agg AS (
    SELECT a.id,
           a.applicant_name,
           a.state,
           a.created_at,
           a.became_resident_id,
           count(v.id) FILTER (WHERE v.stage = 'invite')::int AS n,
           coalesce(sum(
             CASE v.value
               WHEN 'no' THEN (w->>'no')::numeric
               WHEN 'rather_not' THEN (w->>'rather_not')::numeric
               WHEN 'good' THEN (w->>'good')::numeric
               WHEN 'definitely' THEN (w->>'definitely')::numeric
             END) FILTER (WHERE v.stage = 'invite'), 0) AS total,
           count(*) FILTER (WHERE v.value = 'no')::int AS cno,
           count(*) FILTER (WHERE v.value = 'rather_not')::int AS crn,
           count(*) FILTER (WHERE v.value = 'good')::int AS cg,
           count(*) FILTER (WHERE v.value = 'definitely')::int AS cd,
           max(CASE WHEN v.voter_id = me THEN v.value::text END) AS mine
    FROM public.applications a
    LEFT JOIN public.votes v ON v.application_id = a.id
    WHERE a.round_id = _round_id
      AND a.state NOT IN ('archived','withdrawn')
    GROUP BY a.id
  )
  SELECT agg.id,
         agg.applicant_name,
         agg.state,
         agg.created_at,
         agg.mine::public.vote_value,
         vis.v,
         CASE WHEN vis.v AND agg.n > 0
              THEN round((agg.total / agg.n) / 5 * 100)::int END,
         CASE WHEN vis.v THEN agg.n END,
         needed,
         (agg.n >= needed),
         CASE WHEN vis.v THEN agg.cno END,
         CASE WHEN vis.v THEN agg.crn END,
         CASE WHEN vis.v THEN agg.cg END,
         CASE WHEN vis.v THEN agg.cd END,
         (agg.became_resident_id IS NOT NULL AND agg.became_resident_id = me)
  FROM agg,
  LATERAL (SELECT (agg.became_resident_id IS NULL OR agg.became_resident_id <> me)
                  AND (NOT r.hide_results_until_voted OR agg.mine IS NOT NULL) AS v) vis
  ORDER BY (agg.n >= needed) DESC,
           CASE WHEN agg.n > 0 THEN -(agg.total / agg.n) ELSE 0 END,
           -agg.cd, agg.cno, -agg.n, agg.created_at, agg.id;
END;
$function$;