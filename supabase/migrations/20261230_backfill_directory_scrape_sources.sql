-- Backfill eligible external websites from existing approved directory_listings
-- into vendor_scrape_sources so the automatic scraping cycle monitors them.
-- Safe & idempotent: skips social/ticketing/internal URLs, url_blacklist matches,
-- and URLs already present in vendor_scrape_sources.

INSERT INTO public.vendor_scrape_sources (business_name, scrape_url, default_location, notes, submitter_email, status)
SELECT DISTINCT ON (clean_url)
    d.name AS business_name,
    clean_url AS scrape_url,
    coalesce(nullif(btrim(d.location), ''), nullif(btrim(d.community), ''), 'Georgina, ON') AS default_location,
    'Synced from Business Directory' || CASE WHEN nullif(btrim(d.category), '') IS NOT NULL THEN ' (' || btrim(d.category) || ')' ELSE '' END AS notes,
    'crawler@welcomegeorgina.ca' AS submitter_email,
    'approved' AS status
FROM (
    SELECT
        name,
        category,
        community,
        location,
        status,
        regexp_replace(regexp_replace(btrim(link), '#.*$', ''), '/+$', '') AS clean_url
    FROM public.directory_listings
    WHERE (status = 'approved' OR status IS NULL)
      AND btrim(coalesce(link, '')) ~* '^https?://[^\s"<>]+$'
) d
WHERE d.clean_url !~* '^https?://([^/]+\.)?(welcomegeorgina\.ca|facebook\.com|fb\.com|instagram\.com|eventbrite\.(ca|com)|ticketmaster\.(ca|com)|meetup\.com|google\.com|goo\.gl|youtu\.be|youtube\.com|tiktok\.com|x\.com|twitter\.com)(/|$)'
  AND NOT EXISTS (
      SELECT 1 FROM public.scraped_url_blacklist bl
      WHERE lower(d.clean_url) LIKE '%' || lower(btrim(bl.target_url)) || '%'
  )
  AND NOT EXISTS (
      SELECT 1 FROM public.vendor_scrape_sources vs
      WHERE lower(regexp_replace(regexp_replace(btrim(vs.scrape_url), '#.*$', ''), '/+$', '')) = lower(d.clean_url)
  )
ORDER BY clean_url, d.name;
