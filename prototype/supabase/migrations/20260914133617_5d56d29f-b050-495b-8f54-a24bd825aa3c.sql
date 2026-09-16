-- 1) Quelle der Bewerbungsangaben
CREATE TYPE public.info_source AS ENUM ('applicant', 'third_party');
ALTER TABLE public.applications ADD COLUMN source public.info_source NOT NULL DEFAULT 'applicant';

-- 2) Kontakt am Profil + eindeutige Anzeigenamen (getrimmt, case-insensitiv)
ALTER TABLE public.profiles ADD COLUMN contact text;

-- Bestehende Doppelnamen (Testbeitritte) eindeutig machen
WITH dupes AS (
  SELECT id, row_number() OVER (
           PARTITION BY household_id, lower(btrim(display_name)) ORDER BY created_at
         ) AS rn
  FROM public.profiles WHERE status = 'active'
)
UPDATE public.profiles p
SET display_name = p.display_name || ' (' || d.rn || ')'
FROM dupes d
WHERE d.id = p.id AND d.rn > 1;

CREATE UNIQUE INDEX profiles_household_name_norm_uniq
  ON public.profiles (household_id, lower(btrim(display_name)))
  WHERE status = 'active';

-- 3) Favoriten-Budget-Faktor (ADR-008)
ALTER TABLE public.households ADD COLUMN favorite_budget_factor numeric NOT NULL DEFAULT 1.5;

-- 4) Einladungen
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  label text,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 5,
  used_count integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY invites_select ON public.invites FOR SELECT TO authenticated
  USING (household_id = public.current_household_id()
         AND (public.has_role(public.current_profile_id(), 'moderator')
              OR public.has_role(public.current_profile_id(), 'household_account')));

CREATE POLICY invites_insert ON public.invites FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id()
              AND (public.has_role(public.current_profile_id(), 'moderator')
                   OR public.has_role(public.current_profile_id(), 'household_account')));

CREATE POLICY invites_update ON public.invites FOR UPDATE TO authenticated
  USING (household_id = public.current_household_id()
         AND (public.has_role(public.current_profile_id(), 'moderator')
              OR public.has_role(public.current_profile_id(), 'household_account')));

CREATE POLICY invites_delete ON public.invites FOR DELETE TO authenticated
  USING (household_id = public.current_household_id()
         AND (public.has_role(public.current_profile_id(), 'moderator')
              OR public.has_role(public.current_profile_id(), 'household_account')));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER invites_updated_at BEFORE UPDATE ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Neue WG gründen
CREATE POLICY households_insert ON public.households FOR INSERT TO authenticated
  WITH CHECK (true);
