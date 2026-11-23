-- 20261212_sponsor_impressions.sql
-- Sponsor impressions tracking for paid Quick Search keywords
--
-- 1. public.sponsor_impressions table
-- 2. wg_record_sponsor_impressions(uuid[], text, text) RPC
-- 3. wg_my_business_report(date, date) updated with impressions & CTR
-- 4. wg_search_sponsor_report() updated with impressions & CTR

-- 1. Impressions storage table -----------------------------------------------------------------
create table if not exists public.sponsor_impressions (
    id bigint generated always as identity primary key,
    sponsor_id uuid not null references public.search_sponsors(id) on delete cascade,
    impression_date date not null default (now() at time zone 'America/Toronto')::date,
    viewed_at timestamptz not null default now(),
    page text not null default 'home-search',
    visitor_hash text default '',
    ip_hash text default ''
);

create index if not exists idx_sponsor_impressions_sponsor
    on public.sponsor_impressions (sponsor_id, impression_date);

create index if not exists idx_sponsor_impressions_viewed
    on public.sponsor_impressions (viewed_at);

create index if not exists idx_sponsor_impressions_dedup
    on public.sponsor_impressions (sponsor_id, ip_hash, viewed_at);

alter table public.sponsor_impressions enable row level security;
revoke all on table public.sponsor_impressions from public, anon, authenticated;

-- 2. Anonymous beacon: record impressions for visible sponsored spots -------------------------
-- Fire-and-forget batch call from the Home hero when sponsored suggestions are shown.
-- Deduplicates within 30 minutes for the same IP/visitor.
create or replace function public.wg_record_sponsor_impressions(
    ids_input uuid[],
    page_input text default null,
    visitor_input text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_visitor text := left(coalesce(visitor_input, ''), 64);
    v_page text := left(nullif(btrim(coalesce(page_input, '')), ''), 60);
    v_ip text := public.wg_click_ip_hash();
    v_id uuid;
    v_count integer := 0;
begin
    if ids_input is null or array_length(ids_input, 1) is null then
        return 0;
    end if;

    -- Process up to 10 IDs per batch
    foreach v_id in array ids_input[1:10] loop
        -- Spot must be active and currently live
        if exists (
            select 1 from public.search_sponsors
             where id = v_id and active and now() >= starts_at and now() < ends_at
        ) then
            -- Deduplication check: at most 1 impression per 30 minutes per IP or visitor hash
            if (v_ip is not null and not exists (
                select 1 from public.sponsor_impressions
                 where sponsor_id = v_id and ip_hash = v_ip
                   and viewed_at > now() - interval '30 minutes'
            ) and (select count(*) from public.sponsor_impressions
                    where ip_hash = v_ip and viewed_at > now() - interval '1 hour') < 120)
            or (v_ip is null and (v_visitor = '' or not exists (
                select 1 from public.sponsor_impressions
                 where sponsor_id = v_id and visitor_hash = v_visitor
                   and viewed_at > now() - interval '30 minutes'
            ))) then
                insert into public.sponsor_impressions (
                    sponsor_id,
                    impression_date,
                    viewed_at,
                    page,
                    visitor_hash,
                    ip_hash
                ) values (
                    v_id,
                    (now() at time zone 'America/Toronto')::date,
                    now(),
                    coalesce(v_page, 'home-search'),
                    v_visitor,
                    coalesce(v_ip, '')
                );
                v_count := v_count + 1;
            end if;
        end if;
    end loop;

    return v_count;
end;
$$;

revoke all on function public.wg_record_sponsor_impressions(uuid[], text, text) from public;
grant execute on function public.wg_record_sponsor_impressions(uuid[], text, text) to anon, authenticated, service_role;

-- 3. Business portal report: includes impressions and CTR -------------------------------------
create or replace function public.wg_my_business_report(from_input date, to_input date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    b public.directory_listings%rowtype;
    d_to date := least(coalesce(to_input, (now() at time zone 'America/Toronto')::date),
                       (now() at time zone 'America/Toronto')::date);
    d_from date;
    v_from timestamptz;
    v_to timestamptz;
begin
    select d.* into b
      from public.business_accounts a
      join public.directory_listings d on d.id = a.business_id
     where a.user_id = auth.uid();
    if not found then
        return jsonb_build_object('linked', false);
    end if;

    d_from := greatest(coalesce(from_input, d_to - 6), d_to - 365);
    if d_from > d_to then d_from := d_to; end if;
    v_from := d_from::timestamp at time zone 'America/Toronto';
    v_to := (d_to + 1)::timestamp at time zone 'America/Toronto';

    return (
        with spots as (
            select s.* from public.search_sponsors s where s.business_id = b.id
        ), listings as (
            select e.id from public.vendor_events e
             where lower(btrim(e.business_name)) = lower(btrim(b.name))
        ), c as (
            select (k.clicked_at at time zone 'America/Toronto')::date as day,
                   case when k.item_kind = 'search_sponsor' then 'sponsored'
                        when k.item_kind = 'directory' then 'business_page'
                        else 'listings' end as kind,
                   k.item_id
              from public.link_clicks k
             where k.clicked_at >= v_from and k.clicked_at < v_to
               and ((k.item_kind = 'search_sponsor' and k.item_id in (select id from spots))
                 or (k.item_kind = 'directory' and k.item_id = b.id)
                 or (k.item_kind = 'listing' and k.item_id in (select id from listings)))
        ), imp as (
            select (i.viewed_at at time zone 'America/Toronto')::date as day,
                   i.sponsor_id
              from public.sponsor_impressions i
             where i.viewed_at >= v_from and i.viewed_at < v_to
               and i.sponsor_id in (select id from spots)
        )
        select jsonb_build_object(
            'linked', true,
            'business', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug),
            'from', d_from, 'to', d_to,
            'totals', jsonb_build_object(
                'sponsored_clicks', (select count(*) from c where kind = 'sponsored'),
                'sponsored_impressions', (select count(*) from imp),
                'sponsored_ctr', (
                    case when (select count(*) from imp) > 0
                         then round(((select count(*)::numeric from c where kind = 'sponsored') / (select count(*)::numeric from imp)) * 100.0, 1)
                         else 0.0 end
                ),
                'sponsored', (select count(*) from c where kind = 'sponsored'),
                'business_page', (select count(*) from c where kind = 'business_page'),
                'listings', (select count(*) from c where kind = 'listings')),
            'spots', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'id', s.id,
                           'keyword', s.keyword, 'target_kind', s.target_kind,
                           'search_query', s.search_query, 'website_url', s.website_url,
                           'starts_at', s.starts_at, 'ends_at', s.ends_at, 'active', s.active,
                           'impressions', (select count(*) from imp where imp.sponsor_id = s.id),
                           'clicks', (select count(*) from c where c.kind = 'sponsored' and c.item_id = s.id),
                           'ctr', (
                               case when (select count(*) from imp where imp.sponsor_id = s.id) > 0
                                    then round(((select count(*)::numeric from c where c.kind = 'sponsored' and c.item_id = s.id) /
                                                (select count(*)::numeric from imp where imp.sponsor_id = s.id)) * 100.0, 1)
                                    else 0.0 end
                           ))
                       order by s.starts_at desc)
                  from spots s), '[]'::jsonb),
            'daily', (
                select jsonb_agg(jsonb_build_object(
                           'day', g::date,
                           'sponsored_clicks', (select count(*) from c where c.day = g::date and kind = 'sponsored'),
                           'sponsored_impressions', (select count(*) from imp where imp.day = g::date),
                           'sponsored', (select count(*) from c where c.day = g::date and kind = 'sponsored'),
                           'business_page', (select count(*) from c where c.day = g::date and kind = 'business_page'),
                           'listings', (select count(*) from c where c.day = g::date and kind = 'listings'))
                       order by g)
                  from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') g)
        )
    );
end;
$$;

revoke all on function public.wg_my_business_report(date, date) from public, anon;
grant execute on function public.wg_my_business_report(date, date) to authenticated;

-- 4. Staff search sponsor report: includes impressions and CTR --------------------------------
create or replace function public.wg_search_sponsor_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(r order by r ->> 'starts_at' desc)
          from (select jsonb_build_object(
                       'id', s.id,
                       'clicks', count(distinct c.id),
                       'unique_visitors', count(distinct nullif(c.visitor_hash, '')),
                       'clicks_7d', count(distinct c.id) filter (where c.clicked_at > now() - interval '7 days'),
                       'last_click', max(c.clicked_at),
                       'impressions', count(distinct i.id),
                       'impressions_7d', count(distinct i.id) filter (where i.viewed_at > now() - interval '7 days'),
                       'last_impression', max(i.viewed_at),
                       'ctr', case when count(distinct i.id) > 0
                                   then round((count(distinct c.id)::numeric / count(distinct i.id)::numeric) * 100.0, 1)
                                   else 0.0 end,
                       'starts_at', s.starts_at) as r
                  from public.search_sponsors s
                  left join public.link_clicks c on c.item_kind = 'search_sponsor' and c.item_id = s.id
                  left join public.sponsor_impressions i on i.sponsor_id = s.id
                 group by s.id, s.starts_at) x), '[]'::jsonb);
end;
$$;

revoke all on function public.wg_search_sponsor_report() from public, anon;
grant execute on function public.wg_search_sponsor_report() to authenticated, service_role;
