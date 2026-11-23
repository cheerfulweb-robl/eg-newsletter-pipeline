-- ============================================================================
-- WELCOME GEORGINA — PHASE 3: RESIDENT DISCOVERY & LOCAL SALES SCHEMA
-- Adds slug, verified coordinates, pricing, community taxonomy and full-text indexes
-- ============================================================================

-- 1. Extend public.vendor_events with discovery fields
alter table if exists public.vendor_events
    add column if not exists slug text,
    add column if not exists category text default 'Community',
    add column if not exists community text default 'Georgina',
    add column if not exists price_text text default 'Free',
    add column if not exists image_url text,
    add column if not exists latitude double precision,
    add column if not exists longitude double precision,
    add column if not exists is_featured boolean default false,
    add column if not exists view_count integer default 0,
    add column if not exists save_count integer default 0;

-- Unique slug index
create unique index if not exists idx_vendor_events_slug on public.vendor_events(slug) where slug is not null;
create index if not exists idx_vendor_events_community on public.vendor_events(community);
create index if not exists idx_vendor_events_category on public.vendor_events(category);
create index if not exists idx_vendor_events_start_date on public.vendor_events(event_start_date);
create index if not exists idx_vendor_events_expires_after on public.vendor_events(expires_after);

-- 2. Extend public.partners with sales discovery fields
alter table if exists public.partners
    add column if not exists slug text,
    add column if not exists sale_headline text,
    add column if not exists sale_discount_badge text,
    add column if not exists sale_start_date date,
    add column if not exists sale_expires_after date,
    add column if not exists latitude double precision,
    add column if not exists longitude double precision,
    add column if not exists view_count integer default 0,
    add column if not exists save_count integer default 0;

create unique index if not exists idx_partners_slug on public.partners(slug) where slug is not null;

-- 3. Discovery Analytics Tracking RPC
create or replace function public.increment_listing_impression(
    target_table text,
    target_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
    if target_table = 'vendor_events' then
        update public.vendor_events
        set view_count = coalesce(view_count, 0) + 1
        where id = target_id;
    elsif target_table = 'partners' then
        update public.partners
        set view_count = coalesce(view_count, 0) + 1
        where id = target_id;
    end if;
end;
$$;
grant execute on function public.increment_listing_impression to anon, authenticated;
