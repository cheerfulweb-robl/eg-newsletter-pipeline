-- Add google_place_id to directory_listings for exact Lead Hunter deduplication.
-- Idempotent / safe to re-run in the Supabase SQL Editor.

alter table public.directory_listings
    add column if not exists google_place_id text;

create unique index if not exists idx_directory_listings_google_place_id
    on public.directory_listings (google_place_id)
    where google_place_id is not null and btrim(google_place_id) <> '';

-- Backfill google_place_id from existing Lead Hunter admin notes (if any)
update public.directory_listings d
set google_place_id = (regexp_match(n.notes, 'Place ID:\s*([A-Za-z0-9_-]{8,120})'))[1]
from public.directory_listing_admin_notes n
where n.business_id = d.id
  and d.google_place_id is null
  and n.notes ~ 'Place ID:\s*[A-Za-z0-9_-]{8,120}';

notify pgrst, 'reload schema';
