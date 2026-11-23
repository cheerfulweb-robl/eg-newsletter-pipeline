-- ============================================================================
-- MIGRATION: 20261028_crm_categories_and_assets.sql
-- Unified CRM Multi-Category System, Custom QR Codes, and Visual Marketing Assets
-- Applicable for: Welcome Georgina (WG) & Cheerful Media (CM)
-- Project: dtyyptbqbwvwxvtexenr
-- ============================================================================

-- 1. ADD CATEGORIES ARRAY TO PUBLIC.PARTNERS
alter table public.partners 
add column if not exists categories text[] default array['Vendor (WG)']::text[];

-- 2. ADD CUSTOM QR CODE & VISUAL MARKETING ASSETS TO PUBLIC.PARTNERS
alter table public.partners 
add column if not exists qr_code_url text default '',
add column if not exists storefront_image_url text default '',
add column if not exists interior_image_url text default '',
add column if not exists staff_image_url text default '',
add column if not exists owner_image_url text default '',
add column if not exists product_images text[] default '{}'::text[];

-- 3. ADD CATEGORIES, LOGO, CUSTOM QR CODE & VISUAL MARKETING ASSETS TO PUBLIC.CLAIMS
alter table public.claims 
add column if not exists categories text[] default '{}'::text[],
add column if not exists logo_url text default '',
add column if not exists qr_code_url text default '',
add column if not exists storefront_image_url text default '',
add column if not exists interior_image_url text default '',
add column if not exists staff_image_url text default '',
add column if not exists owner_image_url text default '',
add column if not exists product_images text[] default '{}'::text[];

-- 4. ADD MEETING & CALENDAR FIELDS TO PUBLIC.ACTIVITY_LOGS
alter table public.activity_logs
add column if not exists meeting_date timestamptz,
add column if not exists meeting_title text default '',
add column if not exists meeting_type text default 'Phone Call',
add column if not exists meeting_status text default 'scheduled';

-- 5. BACKFILL EXISTING ENTRIES WITH ACCURATE DEFAULT CATEGORIES
-- Backfill partners
update public.partners
set categories = array['Vendor (WG)']::text[]
where categories is null or cardinality(categories) = 0;

-- Backfill claims
update public.claims
set categories = case 
    when user_type = 'New Business' then array['New business (WG)']::text[]
    else array['New Resident (WG)']::text[]
end
where categories is null or cardinality(categories) = 0;

-- 6. CREATE INDEXES FOR FAST CATEGORY FILTERING & SEARCH
create index if not exists idx_partners_categories on public.partners using gin (categories);
create index if not exists idx_claims_categories on public.claims using gin (categories);
create index if not exists idx_activity_logs_meeting on public.activity_logs(meeting_date);
create index if not exists idx_activity_logs_followup on public.activity_logs(next_followup_date);

-- 7. UPDATE RLS TRIGGERS IF NEEDED TO ALLOW STAFF TO MANAGE CATEGORIES & ASSETS
-- (Verifies staff can update categories and marketing image URLs without tripping website restrictions)
