-- Seed initial verified East Gwillimbury scrape sources into vendor_scrape_sources.
-- Run in the Welcome EG Supabase SQL Editor. Idempotent (skips existing scrape_url).

INSERT INTO public.vendor_scrape_sources (
  business_name,
  submitter_email,
  scrape_url,
  default_location,
  notes,
  status
)
SELECT v.business_name, v.submitter_email, v.scrape_url, v.default_location, v.notes, 'approved'
FROM (
  VALUES
    (
      'Sharon Museum & Gardens (Sharon Temple)',
      'contact@welcomeeg.ca',
      'https://www.sharonmuseumandgardens.ca/events',
      '18974 Leslie St, Sharon, ON',
      'Historic site & community events in Sharon'
    ),
    (
      'Mount Albert Sports Day & Spring Fair',
      'contact@welcomeeg.ca',
      'https://mountalbertsportsday.com/',
      '5057 Mount Albert Rd, Mount Albert, ON',
      'Annual Mount Albert community fair & Lions events'
    ),
    (
      'Lake Simcoe Region Conservation Authority',
      'contact@welcomeeg.ca',
      'https://lsrca.on.ca/index.php/events/',
      'East Gwillimbury, ON',
      'Regional watershed & conservation events'
    )
) AS v(business_name, submitter_email, scrape_url, default_location, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.vendor_scrape_sources s WHERE s.scrape_url = v.scrape_url
);
