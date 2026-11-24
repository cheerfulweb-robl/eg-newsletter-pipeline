-- 002: Run in the Welcome EG Supabase SQL Editor (cyxomkhydsmttefanalx)
-- Grants SELECT on contact_phone on public.vendor_events so the public /events
-- calendar query succeeds (submitter_email and verify_token remain locked).

GRANT SELECT (contact_phone) ON public.vendor_events TO anon, authenticated;
