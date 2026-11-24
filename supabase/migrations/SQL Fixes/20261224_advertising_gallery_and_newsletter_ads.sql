-- 20261224_advertising_gallery_and_newsletter_ads.sql
-- Adds complimentary slot tracking to search_sponsors, sponsored ad fields + click/impression RPC
-- to home_gallery, and the newsletter_ad_placements table for positional newsletter ads.
-- Safe to re-run.

begin;

-- 1. Quick Search Sponsors: explicit complimentary flag
alter table public.search_sponsors
  add column if not exists is_complimentary boolean not null default false;

-- 2. Home / Sitewide Photo Gallery: sponsored ad fields & counters
alter table public.home_gallery
  add column if not exists is_sponsored boolean not null default false,
  add column if not exists is_complimentary boolean not null default false,
  add column if not exists sponsor_name text,
  add column if not exists clicks integer not null default 0,
  add column if not exists impressions integer not null default 0;

create or replace function public.wg_record_gallery_ad_event(
  p_photo_id uuid,
  p_event_type text default 'click'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_photo_id is null then
    return;
  end if;
  if lower(coalesce(p_event_type, '')) = 'impression' then
    update public.home_gallery
      set impressions = coalesce(impressions, 0) + 1
      where id = p_photo_id and active = true;
  else
    update public.home_gallery
      set clicks = coalesce(clicks, 0) + 1
      where id = p_photo_id and active = true;
  end if;
end;
$$;

revoke all on function public.wg_record_gallery_ad_event(uuid, text) from public;
grant execute on function public.wg_record_gallery_ad_event(uuid, text) to anon, authenticated;

-- 3. Newsletter Ad Placements (positional insertion + consecutive sub_order e.g. 2a, 2b)
create table if not exists public.newsletter_ad_placements (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  headline text not null,
  body_text text,
  image_url text,
  cta_label text not null default 'Learn More →',
  target_type text not null default 'external',
  target_url text not null,
  edition text not null default 'both',
  insert_after_index integer not null default 1,
  sub_order text not null default 'a',
  start_date date,
  end_date date,
  is_complimentary boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  constraint newsletter_ad_edition_chk check (edition in ('monday', 'thursday', 'both')),
  constraint newsletter_ad_target_type_chk check (target_type in ('external', 'listing', 'business_page'))
);

alter table public.newsletter_ad_placements enable row level security;

drop policy if exists "newsletter_ad_placements_select" on public.newsletter_ad_placements;
create policy "newsletter_ad_placements_select"
  on public.newsletter_ad_placements
  for select
  to anon, authenticated
  using (active = true or public.wg_is_trusted_caller());

drop policy if exists "newsletter_ad_placements_admin_write" on public.newsletter_ad_placements;
create policy "newsletter_ad_placements_admin_write"
  on public.newsletter_ad_placements
  for all
  to authenticated
  using (public.wg_is_trusted_caller())
  with check (public.wg_is_trusted_caller());

commit;
