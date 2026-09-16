-- ENUMS
CREATE TYPE public.app_role AS ENUM ('household_account','moderator','resident','former_resident');
CREATE TYPE public.member_status AS ENUM ('active','moved_out');
CREATE TYPE public.round_status AS ENUM ('draft','open','closed','archived');
CREATE TYPE public.room_status AS ENUM ('open','promised','occupied');
CREATE TYPE public.application_state AS ENUM ('new','screened','invited','scheduled','interviewed','offer_made','moved_in','rejected_by_household','declined_by_applicant','withdrawn','archived');
CREATE TYPE public.vote_stage AS ENUM ('invite','offer');
CREATE TYPE public.vote_value AS ENUM ('no','rather_not','good','definitely');

-- HOUSEHOLDS
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  hide_results_until_voted boolean NOT NULL DEFAULT true,
  quorum_share numeric NOT NULL DEFAULT 0.5,
  scale_weights jsonb NOT NULL DEFAULT '{"no":0,"rather_not":1,"good":3,"definitely":5}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- PROFILES (members). user_id is null for seeded demo members without a login.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  about text,
  status public.member_status NOT NULL DEFAULT 'active',
  is_voter boolean NOT NULL DEFAULT true,
  moved_in_on date,
  moved_out_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (profile_id, role)
);
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.profiles
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role(_profile_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE profile_id = _profile_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_household_account()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(public.current_profile_id(), 'household_account')
$$;

-- ROOMS
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  size_sqm numeric,
  available_from date,
  status public.room_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- ROUNDS
CREATE TABLE public.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL,
  status public.round_status NOT NULL DEFAULT 'draft',
  hide_results_until_voted boolean NOT NULL DEFAULT true,
  quorum_share numeric NOT NULL DEFAULT 0.5,
  settings_snapshot jsonb NOT NULL DEFAULT '{"scale_weights":{"no":0,"rather_not":1,"good":3,"definitely":5}}'::jsonb,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rounds TO authenticated;
GRANT ALL ON public.rounds TO service_role;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.round_rooms (
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  PRIMARY KEY (round_id, room_id)
);
GRANT SELECT, INSERT, DELETE ON public.round_rooms TO authenticated;
GRANT ALL ON public.round_rooms TO service_role;
ALTER TABLE public.round_rooms ENABLE ROW LEVEL SECURITY;

-- APPLICATIONS
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  applicant_name text NOT NULL,
  age integer,
  contact text,
  message text,
  state public.application_state NOT NULL DEFAULT 'new',
  became_resident_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY EVENT LOG
CREATE TABLE public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  from_state public.application_state,
  to_state public.application_state NOT NULL,
  is_backward boolean NOT NULL DEFAULT false,
  note text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

-- VOTES
CREATE TABLE public.votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage public.vote_stage NOT NULL DEFAULT 'invite',
  value public.vote_value NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, voter_id, stage)
);
GRANT SELECT, INSERT, UPDATE ON public.votes TO authenticated;
GRANT ALL ON public.votes TO service_role;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY households_select ON public.households FOR SELECT TO authenticated
  USING (id = public.current_household_id());
CREATE POLICY households_update ON public.households FOR UPDATE TO authenticated
  USING (id = public.current_household_id()
         AND (public.has_role(public.current_profile_id(),'moderator')
              OR public.has_role(public.current_profile_id(),'household_account')));

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (household_id = public.current_household_id() OR user_id = auth.uid());
CREATE POLICY profiles_insert_self ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
         OR (household_id = public.current_household_id()
             AND (public.has_role(public.current_profile_id(),'moderator')
                  OR public.has_role(public.current_profile_id(),'household_account'))));

CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id
                 AND (p.household_id = public.current_household_id() OR p.user_id = auth.uid())));
CREATE POLICY user_roles_write ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
              OR public.has_role(public.current_profile_id(),'moderator')
              OR public.has_role(public.current_profile_id(),'household_account'));
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(public.current_profile_id(),'moderator')
         OR public.has_role(public.current_profile_id(),'household_account'));

CREATE POLICY rooms_select ON public.rooms FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY rooms_write ON public.rooms FOR ALL TO authenticated
  USING (household_id = public.current_household_id()
         AND (public.has_role(public.current_profile_id(),'moderator')
              OR public.has_role(public.current_profile_id(),'household_account')))
  WITH CHECK (household_id = public.current_household_id()
         AND (public.has_role(public.current_profile_id(),'moderator')
              OR public.has_role(public.current_profile_id(),'household_account')));

CREATE POLICY rounds_select ON public.rounds FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY rounds_insert ON public.rounds FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id()
              AND public.has_role(public.current_profile_id(),'moderator'));
CREATE POLICY rounds_update ON public.rounds FOR UPDATE TO authenticated
  USING (household_id = public.current_household_id()
         AND public.has_role(public.current_profile_id(),'moderator'));

CREATE POLICY round_rooms_select ON public.round_rooms FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.household_id = public.current_household_id()));
CREATE POLICY round_rooms_insert ON public.round_rooms FOR INSERT TO authenticated
  WITH CHECK (public.has_role(public.current_profile_id(),'moderator')
              AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.household_id = public.current_household_id()));
CREATE POLICY round_rooms_delete ON public.round_rooms FOR DELETE TO authenticated
  USING (public.has_role(public.current_profile_id(),'moderator')
         AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.household_id = public.current_household_id()));

-- Applications: household account never reads applicant data (ADR-014)
CREATE POLICY applications_select ON public.applications FOR SELECT TO authenticated
  USING (household_id = public.current_household_id() AND NOT public.is_household_account());
CREATE POLICY applications_insert ON public.applications FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id() AND NOT public.is_household_account());
CREATE POLICY applications_update ON public.applications FOR UPDATE TO authenticated
  USING (household_id = public.current_household_id()
         AND public.has_role(public.current_profile_id(),'moderator'));
CREATE POLICY applications_delete ON public.applications FOR DELETE TO authenticated
  USING (household_id = public.current_household_id()
         AND public.has_role(public.current_profile_id(),'moderator'));

CREATE POLICY application_events_select ON public.application_events FOR SELECT TO authenticated
  USING (household_id = public.current_household_id() AND NOT public.is_household_account());
CREATE POLICY application_events_insert ON public.application_events FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id());

-- Votes: a member reads only their own vote. Aggregates come from the
-- security-definer ranking function, which applies hide-until-voted and
-- the self-redaction invariant.
CREATE POLICY votes_select_own ON public.votes FOR SELECT TO authenticated
  USING (voter_id = public.current_profile_id());
CREATE POLICY votes_insert_own ON public.votes FOR INSERT TO authenticated
  WITH CHECK (voter_id = public.current_profile_id()
              AND EXISTS (SELECT 1 FROM public.applications a
                          JOIN public.profiles p ON p.id = public.current_profile_id()
                          WHERE a.id = application_id
                            AND a.household_id = p.household_id
                            AND p.status = 'active' AND p.is_voter
                            AND (a.became_resident_id IS NULL OR a.became_resident_id <> p.id)));
CREATE POLICY votes_update_own ON public.votes FOR UPDATE TO authenticated
  USING (voter_id = public.current_profile_id())
  WITH CHECK (voter_id = public.current_profile_id());

-- SCORING (ADR-008): mean of weights, scaled to 0-100
CREATE OR REPLACE FUNCTION public.round_ranking(_round_id uuid)
RETURNS TABLE (
  application_id uuid,
  applicant_name text,
  state public.application_state,
  created_at timestamptz,
  my_vote public.vote_value,
  visible boolean,
  score integer,
  vote_count integer,
  votes_needed integer,
  quorum_reached boolean,
  c_no integer,
  c_rather_not integer,
  c_good integer,
  c_definitely integer,
  is_self boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  SELECT count(*) INTO denom FROM public.profiles p
    WHERE p.household_id = hh AND p.status = 'active' AND p.is_voter;
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
$$;
GRANT EXECUTE ON FUNCTION public.round_ranking(uuid) TO authenticated;

-- SEED DATA
INSERT INTO public.households (id, name, address) VALUES
  ('11111111-1111-4111-8111-111111111111', 'WG Sonnenallee 12', 'Sonnenallee 12, 12045 Berlin');

INSERT INTO public.profiles (id, household_id, display_name, about, status, is_voter, moved_in_on) VALUES
  ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Lea','Zimmer 1, kocht gern','active',true,'2022-04-01'),
  ('a0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Jonas','Zimmer 2, Nachtmensch','active',true,'2021-09-01'),
  ('a0000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Mira','Zimmer 3, Pflanzen','active',true,'2023-01-15'),
  ('a0000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Tarek','Zimmer 4, Fahrradwerkstatt im Keller','active',true,'2020-10-01'),
  ('a0000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Nele','Zimmer 5, Chorprobe donnerstags','active',true,'2024-03-01'),
  ('a0000000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','Felix','Zimmer 6, viel unterwegs','active',true,'2019-08-01'),
  ('a0000000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','Sophie','ausgezogen im August','moved_out',false,'2018-05-01');

UPDATE public.profiles SET moved_out_on = '2026-08-31' WHERE id = 'a0000000-0000-4000-8000-000000000007';

INSERT INTO public.user_roles (profile_id, role) VALUES
  ('a0000000-0000-4000-8000-000000000001','resident'),
  ('a0000000-0000-4000-8000-000000000001','moderator'),
  ('a0000000-0000-4000-8000-000000000002','resident'),
  ('a0000000-0000-4000-8000-000000000003','resident'),
  ('a0000000-0000-4000-8000-000000000004','resident'),
  ('a0000000-0000-4000-8000-000000000004','moderator'),
  ('a0000000-0000-4000-8000-000000000005','resident'),
  ('a0000000-0000-4000-8000-000000000006','resident'),
  ('a0000000-0000-4000-8000-000000000007','former_resident');

INSERT INTO public.rooms (id, household_id, name, size_sqm, available_from, status) VALUES
  ('b0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Zimmer 7 (Hinterhaus)', 17, '2026-10-01','open'),
  ('b0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Zimmer 8 (Balkon)', 21, '2026-11-01','open'),
  ('b0000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Zimmer 1', 19, NULL,'occupied');

INSERT INTO public.rounds (id, household_id, title, status, hide_results_until_voted, quorum_share, opened_at) VALUES
  ('c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Casting Herbst 2026 — zwei Zimmer','open', true, 0.5, now() - interval '6 days');

INSERT INTO public.round_rooms (round_id, room_id) VALUES
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002');

INSERT INTO public.applications (id, round_id, household_id, applicant_name, age, contact, message, state, created_by, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Amira Hoffmann',27,'amira.h@example.org','Hi! Ich arbeite als Hebamme, viel Schichtdienst, dafür bin ich tagsüber oft da und koche gern für alle. Suche eine WG, in der man zusammen isst, aber nicht muss.','screened','a0000000-0000-4000-8000-000000000001', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Béla Kovács',31,'0160 2233445','Zieht aus Leipzig her, arbeitet remote als Tontechniker. Hat gefragt, ob im Keller Platz für ein kleines Studio wäre.','screened','a0000000-0000-4000-8000-000000000001', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Jule Brandt',24,'jule.brandt@example.org','Studiert Landschaftsplanung im 5. Semester. Hat einen sehr ruhigen alten Hund, fragt, ob das geht.','new','a0000000-0000-4000-8000-000000000004', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sam Okonkwo',29,'sam.okonkwo@example.org','Pflegt eine kleine Siebdruckwerkstatt, arbeitet in einer Fahrradkooperative. Kennt Tarek vom Repair-Café.','screened','a0000000-0000-4000-8000-000000000004', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Pia Reinhardt',35,'0176 9988776','Hat per Aushang am Späti angefragt, kein Portalprofil. Zwei Kinder, die jedes zweite Wochenende da sind.','new','a0000000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Tomasz Wiśniewski',22,'tomasz.w@example.org','Erstes Semester Informatik, sucht ab Oktober. Kurze Nachricht, wirkt schüchtern.','new','a0000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Ronja Fischbach',28,'ronja@example.org','Arbeitet in der Stadtbibliothek, spielt Cello. Fragt explizit nach dem Putzplan und wie Entscheidungen getroffen werden.','screened','a0000000-0000-4000-8000-000000000004', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Kwame Asante',33,'0151 4433221','Telefonisch angefragt, Notiz von Nele: Sozialarbeiter, sucht ab November, war schon in einer 8er-WG.','new','a0000000-0000-4000-8000-000000000005', now() - interval '1 day');

INSERT INTO public.application_events (application_id, household_id, from_state, to_state, actor_id, created_at)
SELECT id, household_id, NULL, 'new', created_by, created_at FROM public.applications;
INSERT INTO public.application_events (application_id, household_id, from_state, to_state, actor_id, created_at)
SELECT id, household_id, 'new', 'screened', created_by, created_at + interval '2 hours'
FROM public.applications WHERE state = 'screened';

INSERT INTO public.votes (application_id, voter_id, stage, value) VALUES
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','invite','definitely'),
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','invite','good'),
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','invite','definitely'),
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','invite','good'),
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005','invite','good'),
  ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','invite','good'),
  ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','invite','definitely'),
  ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','invite','rather_not'),
  ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000004','invite','good'),
  ('d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','invite','good'),
  ('d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000003','invite','good'),
  ('d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000004','invite','definitely'),
  ('d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000006','invite','rather_not'),
  ('d0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000002','invite','good'),
  ('d0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000004','invite','no'),
  ('d0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000005','invite','definitely'),
  ('d0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','invite','good'),
  ('d0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000003','invite','rather_not');