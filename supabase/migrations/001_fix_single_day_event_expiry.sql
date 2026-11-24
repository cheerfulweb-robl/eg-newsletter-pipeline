-- 001: Run in the Welcome EG Supabase SQL Editor (cyxomkhydsmttefanalx)
-- Fixes single-day scraped events that were given a 42-day expires_after window
-- (causing the admin schedule editor to treat them as a 43-day Date Range).

UPDATE public.vendor_events
SET
  expires_after = event_start_date,
  date_type = 'one_time'
WHERE date_type IS NULL
  AND event_start_date IS NOT NULL
  AND expires_after > event_start_date
  AND category NOT IN ('local_news', 'municipal_news', 'news');
