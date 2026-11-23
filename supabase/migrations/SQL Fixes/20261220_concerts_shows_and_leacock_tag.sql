-- Migration: Reserve 'theatre_events' strictly for Stephen Leacock Theatre events
-- and move all other venues' concerts/shows to 'concerts_shows' ("Concerts & Shows").
-- Safe to re-run (idempotent).

UPDATE public.vendor_events
SET category = 'concerts_shows'
WHERE lower(trim(coalesce(category, ''))) IN ('theatre_events', 'live_music')
  AND NOT (
    coalesce(location, '') || ' ' || coalesce(business_name, '') || ' ' || coalesce(title, '')
    ~* '(stephen\s+leacock|leacock\s+theatre|130\s+gwendolyn)'
  );
