WITH new_users AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
  VALUES
    ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lena@wg-demo.de', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'jonas@wg-demo.de', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'sophie@wg-demo.de', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'wg-sonnenallee@wg-demo.de', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '')
  RETURNING id, email
), identities AS (
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  SELECT u.id, u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
  FROM new_users u
)
UPDATE public.profiles p
SET user_id = u.id
FROM new_users u
WHERE (u.email = 'lena@wg-demo.de' AND p.display_name = 'Lea')
   OR (u.email = 'jonas@wg-demo.de' AND p.display_name = 'Jonas')
   OR (u.email = 'sophie@wg-demo.de' AND p.display_name = 'Sophie');

INSERT INTO public.profiles (user_id, household_id, display_name, about, status, is_voter)
SELECT 'e0000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'WG-Konto Sonnenallee', 'Verwaltung, stimmt nicht ab', 'active', false
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = 'e0000000-0000-4000-8000-000000000009');

INSERT INTO public.user_roles (profile_id, role)
SELECT id, 'household_account' FROM public.profiles WHERE user_id = 'e0000000-0000-4000-8000-000000000009'
ON CONFLICT DO NOTHING;