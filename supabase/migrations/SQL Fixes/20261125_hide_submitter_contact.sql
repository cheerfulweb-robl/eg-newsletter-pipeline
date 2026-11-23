-- 2026-11-15: the public key can no longer read submitters' email address, name or the
-- email-verification fields of listings and crawler targets.
-- RUN ONLY AFTER the site build that selects explicit columns (v63.6) is live,
-- otherwise public pages that still ask for every column would fail.
-- Staff (signed in) and the pipeline (service key) are not affected.

revoke select on public.vendor_events from anon;
grant select (id, slug, old_slugs, title, business_name, category, community, contact_phone, created_at, date_type, event_date_label, event_start_date, expires_after, image_url, is_featured, latitude, longitude, link, location, price_text, recurrence_rule, save_count, status, summary, view_count) on public.vendor_events to anon;

revoke select on public.vendor_scrape_sources from anon;
grant select (id, business_name, scrape_url, default_location, status, created_at, last_scraped_at)
    on public.vendor_scrape_sources to anon;

-- Undo (if ever needed):
--   grant select on public.vendor_events to anon;
--   grant select on public.vendor_scrape_sources to anon;
