-- Merge all Stephen Leacock Theatre (theatre_events) listings into Concerts & Shows (concerts_shows)
-- Safe to re-run (idempotent)

UPDATE public.vendor_events
SET category = 'concerts_shows'
WHERE lower(coalesce(category, '')) = 'theatre_events';
