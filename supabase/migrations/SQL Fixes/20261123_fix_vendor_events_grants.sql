-- Run in the Welcome EG Supabase SQL Editor (cyxomkhydsmttefanalx)
-- Grants column-level SELECT (excluding PII: submitter_email, contact_name, contact_phone, verify_token)
-- and INSERT, UPDATE, DELETE on vendor_events to authenticated users.

REVOKE SELECT ON public.vendor_events FROM anon, authenticated;

GRANT SELECT (
  id, vendor_id, business_name, title, event_date_label, event_start_date,
  expires_after, location, link, summary, status, created_at, slug, category,
  community, price_text, image_url, latitude, longitude, is_featured,
  view_count, save_count, date_type, recurrence_rule, verified_at,
  hamper_contact, old_slugs, service_options, sale_category,
  data_confidence, confidence_notes, is_suspected_duplicate,
  duplicate_match_id, duplicate_score, duplicate_notes, is_spotlight,
  contact_phone
) ON public.vendor_events TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.vendor_events TO authenticated;
