-- Run in the Welcome EG Supabase SQL Editor (cyxomkhydsmttefanalx)
-- Fixes 403 permission denied on directory_listings and updates default community from Keswick.

GRANT SELECT ON public.directory_listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directory_listings TO authenticated;

ALTER TABLE public.directory_listings
  ALTER COLUMN community SET DEFAULT 'East Gwillimbury';
