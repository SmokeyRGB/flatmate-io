ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS code text;

CREATE OR REPLACE FUNCTION public.reset_demo_household()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hh uuid := '11111111-1111-4111-8111-111111111111';
  me uuid := public.current_profile_id();
  rnd uuid;
  seed uuid[] := ARRAY[
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000002'::uuid,
    'a0000000-0000-4000-8000-000000000003'::uuid,
    'a0000000-0000-4000-8000-000000000004'::uuid,
    'a0000000-0000-4000-8000-000000000005'::uuid,
    'a0000000-0000-4000-8000-000000000006'::uuid,
    'a0000000-0000-4000-8000-000000000007'::uuid
  ];
  hha uuid;
  lea uuid := 'a0000000-0000-4000-8000-000000000001';
  jonas uuid := 'a0000000-0000-4000-8000-000000000002';
  mira uuid := 'a0000000-0000-4000-8000-000000000003';
  tarek uuid := 'a0000000-0000-4000-8000-000000000004';
  nele uuid := 'a0000000-0000-4000-8000-000000000005';
  felix uuid := 'a0000000-0000-4000-8000-000000000006';
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid;
BEGIN
  IF me IS NULL OR public.current_household_id() <> hh THEN
    RAISE EXCEPTION 'Nur die Demo-WG kann zurückgesetzt werden.';
  END IF;
  IF NOT (public.has_role(me, 'moderator') OR public.has_role(me, 'household_account')) THEN
    RAISE EXCEPTION 'Nur die Moderation kann das.';
  END IF;

  SELECT p.id INTO hha FROM public.profiles p
    JOIN public.user_roles ur ON ur.profile_id = p.id AND ur.role = 'household_account'
    WHERE p.household_id = hh LIMIT 1;
  IF hha IS NOT NULL THEN seed := seed || hha; END IF;
  IF me IS NOT NULL AND NOT (me = ANY(seed)) THEN seed := seed || me; END IF;

  DELETE FROM public.votes v USING public.applications a
    WHERE v.application_id = a.id AND a.household_id = hh;
  DELETE FROM public.application_events WHERE household_id = hh;
  DELETE FROM public.applications WHERE household_id = hh;
  DELETE FROM public.round_rooms rr USING public.rounds r
    WHERE rr.round_id = r.id AND r.household_id = hh;
  DELETE FROM public.rounds WHERE household_id = hh;
  DELETE FROM public.invites WHERE household_id = hh;
  DELETE FROM public.user_roles ur USING public.profiles p
    WHERE ur.profile_id = p.id AND p.household_id = hh AND NOT (p.id = ANY(seed));
  DELETE FROM public.profiles WHERE household_id = hh AND NOT (id = ANY(seed));

  UPDATE public.rooms SET status = 'open' WHERE household_id = hh;

  INSERT INTO public.rounds (household_id, title, status, hide_results_until_voted, quorum_share, settings_snapshot, opened_at)
  VALUES (hh, 'Casting Herbst 2026 — zwei Zimmer', 'open', true, 0.5,
    '{"scale_weights": {"no": 0, "rather_not": 1, "good": 3, "definitely": 5}, "favorite_budget_factor": 1.5}'::jsonb,
    now() - interval '6 days')
  RETURNING id INTO rnd;

  INSERT INTO public.round_rooms (round_id, room_id)
    SELECT rnd, id FROM public.rooms WHERE household_id = hh;

  INSERT INTO public.applications (round_id, household_id, applicant_name, age, contact, message, state, source, created_by, created_at)
  VALUES
   (rnd, hh, 'Lisa Petersen', 27, 'lisa.petersen@posteo.de',
    'Hallo zusammen! Ich bin Lisa, 27, und arbeite seit zwei Jahren als Hebamme im Kreißsaal — Schichtdienst, aber ich bin ein sehr leiser Mensch, wenn ich nachts heimkomme. Ich suche eine neue WG, weil meine alte sich auflöst: zwei von uns ziehen mit ihren Partner:innen zusammen, und allein wohnen ist nichts für mich. Ich koche gern und viel zu viel, deshalb lädt bei mir eigentlich immer jemand nach. Sonntags backe ich Brot, das kann man auch überleben, wenn man selbst nicht mitbackt. Ich hätte Lust auf eine WG, in der man zusammen isst, wenn es passt, und sich nicht schlecht fühlt, wenn es mal nicht passt.',
    'new', 'applicant', tarek, now() - interval '5 days'),
   (rnd, hh, 'Amir Haddad', 31, '0176 4433221',
    'Moin, ich bin Amir, 31, und komme gerade aus Leipzig zurück nach Berlin, weil ich hier eine Stelle als Sozialarbeiter in einer Jugendeinrichtung angenommen habe. Ich habe sieben Jahre in einem Hausprojekt gewohnt, kenne also Plena, Putzpläne und das ganze Drumherum — und ich mag das wirklich, nicht nur aus Pflichtgefühl. Mein Zeug passt in einen Transporter, ich bringe eine Kaffeemaschine mit, die zu gut für mich allein ist, und ein Fahrrad, das dauerhaft im Flur repariert wird, wenn ihr das aushaltet. Am Wochenende bin ich oft klettern, unter der Woche eher früh im Bett.',
    'new', 'applicant', lea, now() - interval '5 days'),
   (rnd, hh, 'Johanna Reiss', 24, 'johanna.reiss@uni-berlin.de',
    'Hi! Johanna, 24, im letzten Jahr Lehramt Bio und Chemie. Ich wohne noch bei meiner Schwester auf dem Sofa, seit mein Untermietvertrag ausgelaufen ist, und suche jetzt endlich etwas Eigenes. Ich bin ehrlich gesagt eine, die viel in der Küche sitzt und lernt, weil mein Zimmer mir dafür immer zu still ist. Dafür bin ich diejenige, die die Spülmaschine ausräumt, ohne dass jemand fragt. Ich habe zwei ziemlich alte Zimmerpflanzen, die ich seit der Schule mitschleppe, und ich spiele Cello — mit Übezeiten, die wir gern gemeinsam festlegen können.',
    'new', 'applicant', lea, now() - interval '4 days'),
   (rnd, hh, 'Ben Okoye', 29, 'ben.okoye@mailbox.org',
    'Hallo ihr, ich bin Ben, 29, Softwareentwickler, arbeite drei Tage die Woche von zu Hause. Ich ziehe aus meiner jetzigen Wohnung aus, weil Eigenbedarf angemeldet wurde — nichts Dramatisches, aber es muss jetzt gehen. Mir ist wichtig, dass eine WG nicht nur Zweck-WG ist: ich möchte Leute, mit denen man abends noch eine halbe Stunde am Küchentisch sitzt, ohne dass daraus gleich ein Programm wird. Ich koche westafrikanisch, wenn ich Zeit habe, und mache an den meisten Sonntagen Fußball im Park mit einer viel zu alten Truppe. Rauchen tue ich nicht, Gäste habe ich eher selten.',
    'screened', 'applicant', lea, now() - interval '4 days'),
   (rnd, hh, 'Mette Sørensen', 26, '0151 22446688',
    'Hej, ich heiße Mette, bin 26 und aus Aarhus nach Berlin gezogen, um an der UdK Bühnenbild zu studieren. Mein Deutsch ist gut, aber nicht perfekt — bitte habt Geduld mit mir bei Behördenpost. Ich habe vorher in einer Sechser-WG gewohnt und vermisse genau das: dass immer jemand da ist, wenn man jemanden braucht, und sonst alle ihr Ding machen. Ich baue gern Dinge, auch für andere: Regale, Lampen, ein Hochbett, was ansteht. Werkzeug habe ich reichlich, und ich räume es meistens auch wieder weg. Zwei Wochen im Sommer bin ich immer in Dänemark bei meiner Familie.',
    'new', 'third_party', tarek, now() - interval '3 days'),
   (rnd, hh, 'Paul Brenner', 33, 'paul.brenner@web.de',
    'Hallo, ich bin Paul, 33, gelernter Tischler und seit zwei Jahren in der Denkmalpflege. Ich suche ein Zimmer, weil ich nach einer langen Beziehung wieder in eine WG will statt in eine Einzimmerwohnung — ich habe gemerkt, dass mir das allein nicht guttut. Ich stehe früh auf, gehe früh ins Bett und bin unter der Woche selten laut. Ich kann so ziemlich alles reparieren, was in einer Altbauwohnung kaputtgeht, und mache das auch gern, solange es nicht zur Erwartung wird. Ein Kater namens Kasimir würde mitkommen, falls das für euch überhaupt denkbar ist.',
    'new', 'applicant', lea, now() - interval '2 days')
  RETURNING id INTO a1;

  SELECT id INTO a1 FROM public.applications WHERE round_id = rnd AND applicant_name = 'Lisa Petersen';
  SELECT id INTO a2 FROM public.applications WHERE round_id = rnd AND applicant_name = 'Amir Haddad';
  SELECT id INTO a3 FROM public.applications WHERE round_id = rnd AND applicant_name = 'Johanna Reiss';
  SELECT id INTO a4 FROM public.applications WHERE round_id = rnd AND applicant_name = 'Ben Okoye';
  SELECT id INTO a5 FROM public.applications WHERE round_id = rnd AND applicant_name = 'Mette Sørensen';
  SELECT id INTO a6 FROM public.applications WHERE round_id = rnd AND applicant_name = 'Paul Brenner';

  INSERT INTO public.application_events (application_id, household_id, from_state, to_state, is_backward, note, actor_id)
    SELECT id, hh, NULL, 'new', false, 'Von Hand erfasst.', created_by FROM public.applications WHERE round_id = rnd;

  INSERT INTO public.votes (application_id, voter_id, stage, value) VALUES
   (a1, mira, 'invite', 'definitely'),
   (a1, tarek, 'invite', 'good'),
   (a1, nele, 'invite', 'definitely'),
   (a1, felix, 'invite', 'good'),
   (a2, mira, 'invite', 'good'),
   (a2, tarek, 'invite', 'definitely'),
   (a2, nele, 'invite', 'good'),
   (a2, felix, 'invite', 'rather_not'),
   (a3, mira, 'invite', 'good'),
   (a3, tarek, 'invite', 'rather_not'),
   (a3, nele, 'invite', 'good'),
   (a4, mira, 'invite', 'definitely'),
   (a4, tarek, 'invite', 'good'),
   (a4, nele, 'invite', 'good'),
   (a4, felix, 'invite', 'definitely'),
   (a4, jonas, 'invite', 'good'),
   (a5, mira, 'invite', 'good'),
   (a5, felix, 'invite', 'no'),
   (a6, tarek, 'invite', 'rather_not');
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_household() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_household() TO authenticated;