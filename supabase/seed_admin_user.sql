-- Run AFTER eg_schema.sql in the Welcome EG Supabase SQL Editor
-- Promotes contact@welcomeeg.ca (created in Supabase Auth) to admin.

INSERT INTO public.user_profiles (id, email, full_name, role, active)
VALUES (
  'b2f681ad-2531-4315-be9d-c40eb869249c',
  'contact@welcomeeg.ca',
  'Robert Lee',
  'admin',
  true
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = 'admin',
  active = true;
