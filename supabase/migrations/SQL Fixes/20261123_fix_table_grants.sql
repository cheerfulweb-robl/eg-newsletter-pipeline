-- Run in the Welcome EG Supabase SQL Editor (cyxomkhydsmttefanalx)
-- Restores table GRANTs for authenticated staff/users and public anon reads
-- (RLS policies still enforce row-level access; vendor_events column privileges are untouched).

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.vendor_scrape_sources,
  public.scraped_url_blacklist,
  public.directory_listing_admin_notes,
  public.vendor_event_admin_notes,
  public.newsletter_settings,
  public.newsletter_ad_placements,
  public.newsletter_archive,
  public.newsletter_editions,
  public.newsletter_subscribers,
  public.partners,
  public.home_gallery,
  public.spotlight_schedule,
  public.search_sponsors,
  public.search_sponsor_orders,
  public.press_articles,
  public.editorial_corrections,
  public.discovery_conversations,
  public.discovery_leads,
  public.discovery_metrics_daily,
  public.activity_logs,
  public.ad_orders,
  public.link_clicks,
  public.click_monthly_archives,
  public.business_accounts,
  public.business_claims,
  public.vendor_profiles
TO authenticated;

GRANT SELECT ON
  public.partners,
  public.home_gallery,
  public.spotlight_schedule,
  public.search_sponsors,
  public.press_articles,
  public.newsletter_archive,
  public.newsletter_editions,
  public.editorial_corrections
TO anon;

GRANT INSERT ON
  public.editorial_corrections,
  public.link_clicks,
  public.sponsor_impressions
TO anon;
