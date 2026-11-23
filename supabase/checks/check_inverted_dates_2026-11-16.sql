-- ============================================================================
-- Read-only Diagnostic: Approved Listings with Inverted Dates
-- Run in the Supabase SQL editor. Changes nothing.
-- Finds listings where expires_after is earlier than event_start_date.
-- ============================================================================

select 
    id, 
    title, 
    business_name, 
    category,
    event_start_date, 
    expires_after, 
    event_date_label,
    created_at
from public.vendor_events
where status = 'approved'
  and expires_after is not null
  and event_start_date is not null
  and expires_after < event_start_date
order by event_start_date asc;
