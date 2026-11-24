-- Run in the Welcome EG Supabase SQL Editor (cyxomkhydsmttefanalx)
-- Ensures all authorized admin emails that exist in auth.users have an active
-- admin row in public.user_profiles so /staff/ pages allow access.

GRANT SELECT ON public.user_profiles TO authenticated;

INSERT INTO public.user_profiles (id, email, full_name, role, active)
SELECT
  u.id,
  lower(u.email),
  COALESCE(NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''), 'Robert Lee'),
  'admin',
  true
FROM auth.users u
WHERE lower(u.email) IN (
  'contact@welcomeeg.ca',
  'admin@welcomeeg.ca',
  'cheerfulweb@gmail.com',
  'stillcheerful@gmail.com'
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = 'admin',
  active = true;
