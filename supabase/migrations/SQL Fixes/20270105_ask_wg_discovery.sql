-- 20270105_ask_wg_discovery.sql
-- Stage 1: Ask WG local discovery view, private leads table, aggregate metrics, and rate/budget guard.
-- Safe to re-run.
begin;

-- 1. Helpful indexes for discovery queries
create index if not exists idx_vendor_events_discovery
  on public.vendor_events (status, event_start_date, expires_after);

create index if not exists idx_directory_listings_discovery
  on public.directory_listings (status, community);

-- 2. Unified read-only discovery view (service_role only; never exposes private submitter/merchant emails)
create or replace view public.discovery_search_view as
select
  e.id::text as record_id,
  case
    when lower(coalesce(e.category, '')) in ('local_news', 'municipal_news', 'news', 'past_events', 'article', 'press') then 'news'
    when lower(coalesce(e.category, '')) in ('dining', 'restaurant', 'food_and_drink', 'dining_deals') then 'dining'
    when lower(coalesce(e.category, '')) in ('special_sale', 'retail_sale', 'sale', 'sales', 'local_sales', 'sales_deal')
         or e.title ~* '^\s*\[sale\]' then 'offer'
    else 'event'
  end as record_type,
  e.title,
  e.business_name,
  e.summary,
  coalesce(nullif(btrim(e.location), ''), 'Georgina, ON') as location,
  case
    when coalesce(e.location, '') ~* 'out of area' then 'Out of Area'
    when coalesce(e.location, '') ~* '\m(keswick|sutton|pefferlaw|jackson''?s?\s+point|roches?\s+point|port\s+bolster|willow\s+beach|island\s+grove|brown\s+hill|udora|baldwin|belhaven|virginia|egypt)\M' then
      initcap(coalesce((regexp_match(e.location, '\m(keswick|sutton|pefferlaw|jackson''?s?\s+point|roches?\s+point|port\s+bolster|willow\s+beach|island\s+grove|brown\s+hill|udora|baldwin|belhaven|virginia|egypt)\M', 'i'))[1], 'Georgina'))
    else 'Georgina'
  end as community,
  (coalesce(e.location, '') ~* 'out of area') as is_out_of_area,
  coalesce(e.category, 'community_events') as category,
  (coalesce(e.price_text, '') ~* '^\s*(free|\$?0(\.00)?)\s*$') as is_free,
  nullif(btrim(e.price_text), '') as price_label,
  e.event_start_date as starts_at,
  e.expires_after,
  e.event_date_label as date_label,
  e.recurrence_rule,
  case
    when lower(coalesce(e.category, '')) in ('dining', 'restaurant', 'food_and_drink', 'dining_deals')
      then '/dining/' || coalesce(nullif(e.slug, ''), e.id::text)
    when lower(coalesce(e.category, '')) in ('special_sale', 'retail_sale', 'sale', 'sales', 'local_sales', 'sales_deal')
      then '/sales/' || coalesce(nullif(e.slug, ''), e.id::text)
    when lower(coalesce(e.category, '')) in ('local_news', 'municipal_news', 'news')
      then '/newsroom'
    else '/events/' || coalesce(nullif(e.slug, ''), e.id::text)
  end as site_url,
  e.link as source_url,
  e.created_at as verified_at
from public.vendor_events e
where e.status = 'approved'
  and (
    coalesce(e.expires_after, e.event_start_date) is null
    or coalesce(e.expires_after, e.event_start_date) >= (now() at time zone 'America/Toronto')::date
  )

union all

select
  d.id::text as record_id,
  'business' as record_type,
  d.name as title,
  d.name as business_name,
  coalesce(nullif(btrim(d.notes), ''), coalesce(d.category, 'Local Business') || ' in ' || coalesce(d.community, 'Georgina')) as summary,
  coalesce(nullif(btrim(d.location), ''), coalesce(d.community, 'Georgina') || ', ON') as location,
  coalesce(nullif(btrim(d.community), ''), 'Georgina') as community,
  (lower(coalesce(d.community, '')) = 'out of area' or coalesce(d.location, '') ~* 'out of area') as is_out_of_area,
  coalesce(d.category, 'Local Business') as category,
  false as is_free,
  null::text as price_label,
  null::date as starts_at,
  null::date as expires_after,
  null::text as date_label,
  null::text as recurrence_rule,
  '/businesses/' || coalesce(nullif(d.slug, ''), d.id::text) as site_url,
  d.link as source_url,
  d.created_at as verified_at
from public.directory_listings d
where d.status = 'approved'

union all

select
  h.id::text as record_id,
  'hamper' as record_type,
  h.offer_title as title,
  h.merchant_name as business_name,
  coalesce(nullif(btrim(h.offer_details), ''), h.terms, 'Welcome Hamper local merchant perk') as summary,
  coalesce(nullif(btrim(h.community), ''), 'Georgina') || ', ON' as location,
  coalesce(nullif(btrim(h.community), ''), 'Georgina') as community,
  false as is_out_of_area,
  'welcome_hamper' as category,
  true as is_free,
  'Welcome Hamper Perk' as price_label,
  null::date as starts_at,
  h.valid_until as expires_after,
  case when h.valid_until is not null then 'Valid until ' || h.valid_until::text else 'Active Welcome Hamper Offer' end as date_label,
  null::text as recurrence_rule,
  '/hamper/' as site_url,
  null::text as source_url,
  h.created_at as verified_at
from public.hamper_offers h
where h.active = true
  and (h.valid_until is null or h.valid_until >= (now() at time zone 'America/Toronto')::date)

union all

select
  p.id::text as record_id,
  'press' as record_type,
  p.title,
  p.business_name,
  coalesce(nullif(btrim(p.summary), ''), 'Official press release from ' || p.business_name) as summary,
  coalesce(nullif(btrim(p.business_address), ''), 'Georgina, ON') as location,
  'Georgina' as community,
  false as is_out_of_area,
  'press_release' as category,
  false as is_free,
  null::text as price_label,
  p.published_at::date as starts_at,
  null::date as expires_after,
  to_char(p.published_at at time zone 'America/Toronto', 'Mon DD, YYYY') as date_label,
  null::text as recurrence_rule,
  '/press/' || coalesce(nullif(p.slug, ''), p.id::text) as site_url,
  p.business_website as source_url,
  coalesce(p.published_at, p.created_at) as verified_at
from public.press_articles p
where p.status = 'published';

revoke all on public.discovery_search_view from anon, authenticated;
grant select on public.discovery_search_view to service_role;

-- 3. Private Lead Capture Table (server-only insert; admin-only read/update)
create table if not exists public.discovery_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_type text not null check (lead_type in ('resident', 'business', 'sponsor', 'hamper', 'general')),
  name text not null,
  email text not null,
  phone text,
  business_name text,
  message text not null,
  consent_to_contact boolean not null default false check (consent_to_contact = true),
  contact_consent_at timestamptz not null default now(),
  newsletter_opt_in boolean not null default false,
  newsletter_consent_at timestamptz,
  source_page text,
  status text not null default 'new' check (status in ('new', 'contacted', 'archived'))
);

alter table public.discovery_leads enable row level security;
revoke all on public.discovery_leads from anon;

drop policy if exists "discovery_leads_admin_all" on public.discovery_leads;
create policy "discovery_leads_admin_all"
  on public.discovery_leads
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_discovery_leads_block_viewer on public.discovery_leads;
create trigger trg_discovery_leads_block_viewer
  before insert or update or delete on public.discovery_leads
  for each row execute function public.wg_block_viewer_writes();

-- 4. Privacy-preserving daily aggregate metrics (zero PII)
create table if not exists public.discovery_metrics_daily (
  metric_date date not null default ((now() at time zone 'America/Toronto')::date),
  intent text not null,
  community text not null default 'all',
  result_count_bucket text not null default '0',
  request_count int not null default 0,
  ai_calls int not null default 0,
  fallback_calls int not null default 0,
  lead_count int not null default 0,
  error_count int not null default 0,
  estimated_cost_usd numeric(10, 4) not null default 0,
  primary key (metric_date, intent, community, result_count_bucket)
);

alter table public.discovery_metrics_daily enable row level security;
revoke all on public.discovery_metrics_daily from anon;

drop policy if exists "discovery_metrics_admin_read" on public.discovery_metrics_daily;
create policy "discovery_metrics_admin_read"
  on public.discovery_metrics_daily
  for select
  to authenticated
  using (public.is_admin());

-- 5. Cross-instance rate limit & daily AI budget counter
create table if not exists public.discovery_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  hit_count int not null default 0
);

alter table public.discovery_rate_limits enable row level security;
revoke all on public.discovery_rate_limits from anon, authenticated;

create or replace function public.wg_discovery_rate_allow(
  ip_hash_input text,
  max_per_hour int default 40,
  daily_ai_cap int default 400
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_ts timestamptz := now();
  today_key text := 'ai_day:' || to_char(now_ts at time zone 'America/Toronto', 'YYYY-MM-DD');
  ip_key text := 'ip:' || coalesce(nullif(btrim(ip_hash_input), ''), 'unknown');
  ip_hits int := 0;
  ai_hits int := 0;
begin
  -- Clean stale IP buckets (> 2 hours old)
  delete from public.discovery_rate_limits
  where bucket_key like 'ip:%' and window_start < now_ts - interval '2 hours';

  insert into public.discovery_rate_limits (bucket_key, window_start, hit_count)
  values (ip_key, now_ts, 1)
  on conflict (bucket_key) do update
  set hit_count = case
        when public.discovery_rate_limits.window_start < now_ts - interval '1 hour' then 1
        else public.discovery_rate_limits.hit_count + 1
      end,
      window_start = case
        when public.discovery_rate_limits.window_start < now_ts - interval '1 hour' then now_ts
        else public.discovery_rate_limits.window_start
      end
  returning hit_count into ip_hits;

  if ip_hits > max_per_hour then
    return jsonb_build_object('allowed', false, 'ai_allowed', false, 'reason', 'rate_limited');
  end if;

  insert into public.discovery_rate_limits (bucket_key, window_start, hit_count)
  values (today_key, now_ts, 1)
  on conflict (bucket_key) do update
  set hit_count = public.discovery_rate_limits.hit_count + 1
  returning hit_count into ai_hits;

  return jsonb_build_object(
    'allowed', true,
    'ai_allowed', (ai_hits <= daily_ai_cap),
    'ip_hits', ip_hits,
    'ai_hits', ai_hits
  );
end;
$$;

revoke all on function public.wg_discovery_rate_allow(text, int, int) from public, anon, authenticated;
grant execute on function public.wg_discovery_rate_allow(text, int, int) to service_role;

create or replace function public.wg_discovery_record_metric(
  intent_input text,
  community_input text,
  result_count_input int,
  used_ai_input boolean,
  is_lead_input boolean default false,
  is_error_input boolean default false,
  est_cost_input numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today_d date := (now() at time zone 'America/Toronto')::date;
  bucket text := case
    when result_count_input <= 0 then '0'
    when result_count_input <= 3 then '1-3'
    when result_count_input <= 10 then '4-10'
    else '11+'
  end;
begin
  insert into public.discovery_metrics_daily (
    metric_date, intent, community, result_count_bucket,
    request_count, ai_calls, fallback_calls, lead_count, error_count, estimated_cost_usd
  )
  values (
    today_d,
    left(coalesce(nullif(btrim(intent_input), ''), 'unknown'), 40),
    left(coalesce(nullif(btrim(community_input), ''), 'all'), 40),
    bucket,
    1,
    case when used_ai_input then 1 else 0 end,
    case when not used_ai_input and not is_lead_input then 1 else 0 end,
    case when is_lead_input then 1 else 0 end,
    case when is_error_input then 1 else 0 end,
    coalesce(est_cost_input, 0)
  )
  on conflict (metric_date, intent, community, result_count_bucket) do update
  set request_count = public.discovery_metrics_daily.request_count + 1,
      ai_calls = public.discovery_metrics_daily.ai_calls + (case when used_ai_input then 1 else 0 end),
      fallback_calls = public.discovery_metrics_daily.fallback_calls + (case when not used_ai_input and not is_lead_input then 1 else 0 end),
      lead_count = public.discovery_metrics_daily.lead_count + (case when is_lead_input then 1 else 0 end),
      error_count = public.discovery_metrics_daily.error_count + (case when is_error_input then 1 else 0 end),
      estimated_cost_usd = public.discovery_metrics_daily.estimated_cost_usd + coalesce(est_cost_input, 0);
end;
$$;

revoke all on function public.wg_discovery_record_metric(text, text, int, boolean, boolean, boolean, numeric) from public, anon, authenticated;
grant execute on function public.wg_discovery_record_metric(text, text, int, boolean, boolean, boolean, numeric) to service_role;

commit;
