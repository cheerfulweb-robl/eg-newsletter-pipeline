-- ============================================================================
-- Click Stats, Admin Exclusion, Search Category, Monthly Archives & Unified
-- Business/Admin Stats Portal (site v67.7), 2026-11-18
--
-- What this migration adds:
--   1. wg_is_admin_page() — blocks click/impression tracking from /staff/, /admin,
--      or /hamper/admin pages (both on write and in reports).
--   2. wg_record_search_click() — records searches & search-results clicks in their
--      own category ('search_result'), separate from directory/listing clicks.
--   3. click_monthly_archives table + wg_archive_month_clicks() +
--      wg_ensure_monthly_archives() — archives each completed calendar month at
--      midnight Toronto time (via pg_cron when available + automatic lazy catch-up),
--      permanently accessible for printable reports to merchants & submitters.
--   4. Updated wg_click_report() — excludes admin pages, adds by_search (Searches
--      & Search Results separated), by_month, and business_id mapping.
--   5. Updated wg_my_business_report(from_input, to_input, business_id_input) —
--      used by /business/index.html for BOTH merchants (strictly locked to their
--      own linked business) and staff/admins (can inspect all businesses or any
--      specific business), with by_day, by_month, search_items (Searches & Search
--      Results list), listing_items, and monthly archive access.
--
-- Run in the Supabase SQL Editor AFTER 20261216. Safe to re-run.
-- ============================================================================

-- 1. Helper: detect admin / staff pages so they are NEVER tracked or reported -------------
create or replace function public.wg_is_admin_page(
    page_input text default null,
    url_input text default null,
    referrer_input text default null
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
    v_headers jsonb;
    v_ref text;
begin
    if coalesce(page_input, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)' then
        return true;
    end if;
    if coalesce(url_input, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)' then
        return true;
    end if;
    v_ref := coalesce(referrer_input, '');
    if v_ref = '' then
        begin
            v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
            v_ref := coalesce(v_headers ->> 'referer', v_headers ->> 'referrer', '');
        exception when others then
            v_ref := '';
        end;
    end if;
    if v_ref ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)' then
        return true;
    end if;
    return false;
end;
$$;

-- 2. Exclude admin pages from wg_track_click, wg_record_sponsor_click, impressions --------
create or replace function public.wg_track_click(kind_input text, id_input uuid, page_input text default null, visitor_input text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_url text;
    v_title text;
    v_business text;
    v_category text;
    v_visitor text := left(coalesce(visitor_input, ''), 64);
    v_page text := left(nullif(btrim(coalesce(page_input, '')), ''), 60);
    v_ip text := public.wg_click_ip_hash();
begin
    if kind_input = 'listing' then
        select e.link, e.title, e.business_name, coalesce(e.category, 'listing')
          into v_url, v_title, v_business, v_category
          from public.vendor_events e
         where e.id = id_input and e.status = 'approved';
    elsif kind_input = 'directory' then
        select d.link, d.name, d.name, 'directory'
          into v_url, v_title, v_business, v_category
          from public.directory_listings d
         where d.id = id_input and d.status = 'approved';
    elsif kind_input = 'hamper_offer' then
        select o.merchant_website, o.offer_title, o.merchant_name, 'hamper_offer'
          into v_url, v_title, v_business, v_category
          from public.hamper_offers o
         where o.id = id_input;
    else
        return null;
    end if;

    v_url := btrim(coalesce(v_url, ''));
    if v_url ~* '^www\.' then
        v_url := 'https://' || v_url;
    end if;
    if v_url !~* '^https?://[^/@\s]+' or v_url ~ '\s' then
        return null;
    end if;

    -- Never track clicks triggered from admin/staff pages (still return destination URL)
    if not public.wg_is_admin_page(v_page, v_url)
       and public.wg_click_should_count(id_input, v_visitor, v_ip) then
        insert into public.link_clicks (issue_date, article_title, source_name, category, target_url,
                                        visitor_hash, user_agent, item_kind, item_id, page, ip_hash)
        values (to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
                left(coalesce(v_title, ''), 300), left(coalesce(nullif(v_business, ''), 'Welcome Georgina'), 200),
                left(v_category, 80), left(v_url, 2000), v_visitor, '', kind_input, id_input, v_page, v_ip);
    end if;
    return v_url;
end;
$$;
revoke all on function public.wg_track_click(text, uuid, text, text) from public;
grant execute on function public.wg_track_click(text, uuid, text, text) to anon, authenticated, service_role;

create or replace function public.wg_record_sponsor_click(id_input uuid, page_input text default null, visitor_input text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    s public.search_sponsors%rowtype;
    v_visitor text := left(coalesce(visitor_input, ''), 64);
    v_page text := left(nullif(btrim(coalesce(page_input, '')), ''), 60);
    v_dest text;
    v_slug text;
    v_ip text := public.wg_click_ip_hash();
begin
    select * into s from public.search_sponsors
     where search_sponsors.id = id_input and active and now() >= starts_at and now() < ends_at;
    if not found then
        return null;
    end if;

    if s.target_kind = 'website' then
        v_dest := btrim(s.website_url);
    elsif s.target_kind = 'business' then
        select l.slug into v_slug from public.directory_listings l
         where l.id = s.business_id and l.status = 'approved' and l.slug is not null;
        v_dest := case when v_slug is not null then '/businesses/' || v_slug
                       else '/discovery?q=' || btrim(s.keyword) end;
    else
        v_dest := '/discovery?q=' || coalesce(nullif(btrim(s.search_query), ''), btrim(s.keyword));
    end if;

    if not public.wg_is_admin_page(v_page, v_dest)
       and public.wg_click_should_count(id_input, v_visitor, v_ip) then
        insert into public.link_clicks (issue_date, article_title, source_name, category, target_url,
                                        visitor_hash, user_agent, item_kind, item_id, page, ip_hash)
        values (to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
                left('Quick search: ' || btrim(s.keyword), 300), left(btrim(s.sponsor_name), 200),
                'search_sponsor', left(v_dest, 2000), v_visitor, '', 'search_sponsor', id_input,
                coalesce(v_page, 'home-search'), v_ip);
    end if;

    return case when s.target_kind = 'website' then v_dest else '' end;
end;
$$;
revoke all on function public.wg_record_sponsor_click(uuid, text, text) from public;
grant execute on function public.wg_record_sponsor_click(uuid, text, text) to anon, authenticated, service_role;

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
    if public.wg_is_admin_page(v_page) then
        return 0;
    end if;

    foreach v_id in array ids_input[1:10] loop
        if exists (
            select 1 from public.search_sponsors
             where id = v_id and active and now() >= starts_at and now() < ends_at
        ) then
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
                    sponsor_id, impression_date, viewed_at, page, visitor_hash, ip_hash
                ) values (
                    v_id, (now() at time zone 'America/Toronto')::date, now(),
                    coalesce(v_page, 'home-search'), v_visitor, coalesce(v_ip, '')
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

-- 3. Record Searches & Search Results Page Clicks (dedicated category) --------------------
create or replace function public.wg_record_search_click(
    query_input text,
    title_input text default null,
    business_input text default null,
    item_id_input uuid default null,
    target_url_input text default null,
    page_input text default 'search-results',
    visitor_input text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_q text := left(btrim(coalesce(query_input, '')), 120);
    v_title text := left(nullif(btrim(coalesce(title_input, '')), ''), 300);
    v_biz text := left(coalesce(nullif(btrim(coalesce(business_input, '')), ''), 'Search Results'), 200);
    v_url text := left(coalesce(nullif(btrim(coalesce(target_url_input, '')), ''), '/discovery?q=' || v_q), 2000);
    v_page text := left(coalesce(nullif(btrim(coalesce(page_input, '')), ''), 'search-results'), 60);
    v_visitor text := left(coalesce(visitor_input, ''), 64);
    v_ip text := public.wg_click_ip_hash();
begin
    if v_q = '' and v_title is null then
        return false;
    end if;
    if public.wg_is_admin_page(v_page, v_url) then
        return false;
    end if;

    -- Rate limit per visitor/IP to prevent spam
    if v_ip is not null and (
        select count(*) from public.link_clicks
         where ip_hash = v_ip and item_kind = 'search_result'
           and clicked_at > now() - interval '1 minute'
    ) >= 30 then
        return false;
    end if;

    -- Deduplicate same search click within 30 seconds
    if (v_visitor <> '' and exists (
        select 1 from public.link_clicks
         where item_kind = 'search_result'
           and visitor_hash = v_visitor
           and article_title = coalesce(v_title, 'Search: ' || v_q)
           and clicked_at > now() - interval '30 seconds'
    )) then
        return false;
    end if;

    insert into public.link_clicks (
        issue_date, article_title, source_name, category, target_url,
        visitor_hash, user_agent, item_kind, item_id, page, ip_hash
    ) values (
        to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
        coalesce(v_title, 'Search: ' || v_q),
        v_biz,
        'search_results',
        v_url,
        v_visitor,
        '',
        'search_result',
        item_id_input,
        v_page,
        v_ip
    );
    return true;
end;
$$;
revoke all on function public.wg_record_search_click(text, text, text, uuid, text, text, text) from public;
grant execute on function public.wg_record_search_click(text, text, text, uuid, text, text, text) to anon, authenticated, service_role;

-- 4. Monthly Click Archives (auto-archived at midnight Toronto time at month-end) ---------
create table if not exists public.click_monthly_archives (
    id bigint generated always as identity primary key,
    archive_month text not null check (archive_month ~ '^\d{4}-\d{2}$'),
    scope text not null check (scope in ('site', 'business')),
    business_id uuid references public.directory_listings(id) on delete set null,
    business_name text not null default '',
    summary jsonb not null default '{}'::jsonb,
    by_business jsonb not null default '[]'::jsonb,
    by_item jsonb not null default '[]'::jsonb,
    by_search jsonb not null default '[]'::jsonb,
    by_day jsonb not null default '[]'::jsonb,
    archived_at timestamptz not null default now()
);

create unique index if not exists idx_click_monthly_archives_uniq
    on public.click_monthly_archives (archive_month, scope, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_click_monthly_archives_month
    on public.click_monthly_archives (archive_month desc, scope);

alter table public.click_monthly_archives enable row level security;
revoke all on table public.click_monthly_archives from public, anon, authenticated;

-- Archive one completed month (Toronto time) for both 'site' and each attached business
create or replace function public.wg_archive_month_clicks(month_input text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_tor_today date := (now() at time zone 'America/Toronto')::date;
    v_cur_month_start date := date_trunc('month', v_tor_today)::date;
    v_m_start date;
    v_m_end date;
    v_month text;
    v_from timestamptz;
    v_to timestamptz;
    v_written int := 0;
    v_biz record;
begin
    if month_input is null or btrim(month_input) = '' then
        v_m_start := (v_cur_month_start - interval '1 month')::date;
    else
        v_m_start := to_date(month_input || '-01', 'YYYY-MM-DD');
    end if;

    -- Only archive completed months (past midnight at the end of that month, Toronto time)
    if v_m_start >= v_cur_month_start then
        return 0;
    end if;

    v_m_end := (v_m_start + interval '1 month')::date;
    v_month := to_char(v_m_start, 'YYYY-MM');
    v_from := v_m_start::timestamp at time zone 'America/Toronto';
    v_to := v_m_end::timestamp at time zone 'America/Toronto';

    -- A. Site-wide monthly archive snapshot
    with clean as (
        select k.*
          from public.link_clicks k
         where k.clicked_at >= v_from and k.clicked_at < v_to
           and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                 or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
    ), imp as (
        select i.*
          from public.sponsor_impressions i
         where i.viewed_at >= v_from and i.viewed_at < v_to
           and not (coalesce(i.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)')
    ), is_search as (
        select id from clean
         where item_kind in ('search_sponsor', 'search_result', 'search')
            or coalesce(page, '') in ('home-search', 'discovery', 'search', 'search-results')
    )
    insert into public.click_monthly_archives (
        archive_month, scope, business_id, business_name, summary, by_business, by_item, by_search, by_day, archived_at
    )
    values (
        v_month, 'site', null, 'All Businesses',
        (select jsonb_build_object(
            'clicks', count(*),
            'unique_visitors', count(distinct nullif(visitor_hash, '')),
            'website_clicks', count(*) filter (where item_kind is not null),
            'newsletter_clicks', count(*) filter (where item_kind is null),
            'search_clicks', count(*) filter (where id in (select id from is_search)),
            'sponsored_impressions', (select count(*) from imp)
        ) from clean),
        coalesce((
            select jsonb_agg(b order by (b ->> 'clicks')::int desc)
              from (select jsonb_build_object(
                           'business', source_name,
                           'clicks', count(*),
                           'unique_visitors', count(distinct nullif(visitor_hash, '')),
                           'website_clicks', count(*) filter (where item_kind is not null),
                           'newsletter_clicks', count(*) filter (where item_kind is null),
                           'search_clicks', count(*) filter (where id in (select id from is_search)),
                           'listings', count(distinct coalesce(item_id::text, article_title))) as b
                      from clean group by source_name) s), '[]'::jsonb),
        coalesce((
            select jsonb_agg(i order by (i ->> 'clicks')::int desc)
              from (select jsonb_build_object(
                           'business', source_name,
                           'title', article_title,
                           'kind', coalesce(item_kind, 'newsletter'),
                           'category', min(category),
                           'item_id', item_id,
                           'target_url', min(target_url),
                           'clicks', count(*),
                           'unique_visitors', count(distinct nullif(visitor_hash, '')),
                           'last_click', max(clicked_at)) as i
                      from clean
                     where id not in (select id from is_search)
                     group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
        coalesce((
            select jsonb_agg(i order by (i ->> 'clicks')::int desc)
              from (select jsonb_build_object(
                           'business', source_name,
                           'title', article_title,
                           'kind', coalesce(item_kind, 'search_result'),
                           'page', min(coalesce(page, 'search-results')),
                           'target_url', min(target_url),
                           'clicks', count(*),
                           'unique_visitors', count(distinct nullif(visitor_hash, '')),
                           'last_click', max(clicked_at)) as i
                      from clean
                     where id in (select id from is_search)
                     group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
        coalesce((
            select jsonb_agg(jsonb_build_object('day', day, 'clicks', clicks, 'unique_visitors', uniq, 'search_clicks', sc) order by day)
              from (select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM-DD') as day,
                           count(*) as clicks,
                           count(distinct nullif(visitor_hash, '')) as uniq,
                           count(*) filter (where id in (select id from is_search)) as sc
                      from clean group by 1) s), '[]'::jsonb),
        now()
    )
    on conflict (archive_month, scope, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set
        summary = excluded.summary,
        by_business = excluded.by_business,
        by_item = excluded.by_item,
        by_search = excluded.by_search,
        by_day = excluded.by_day,
        archived_at = now();
    v_written := v_written + 1;

    -- B. Per-business monthly archive snapshots (for every directory business with activity)
    for v_biz in
        select d.id, d.name, d.slug
          from public.directory_listings d
         where d.status = 'approved'
           and (
               exists (select 1 from public.link_clicks k
                        where k.clicked_at >= v_from and k.clicked_at < v_to
                          and (k.item_id = d.id or lower(btrim(k.source_name)) = lower(btrim(d.name))))
               or exists (select 1 from public.search_sponsors sp
                           where sp.business_id = d.id)
           )
    loop
        with spots as (
            select sp.id from public.search_sponsors sp where sp.business_id = v_biz.id
        ), listings as (
            select e.id from public.vendor_events e where lower(btrim(e.business_name)) = lower(btrim(v_biz.name))
        ), clean as (
            select k.*,
                   (k.item_kind in ('search_sponsor', 'search_result', 'search')
                    or coalesce(k.page, '') in ('home-search', 'discovery', 'search', 'search-results')) as is_search
              from public.link_clicks k
             where k.clicked_at >= v_from and k.clicked_at < v_to
               and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                     or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
               and ((k.item_kind = 'search_sponsor' and k.item_id in (select id from spots))
                 or (k.item_kind = 'directory' and k.item_id = v_biz.id)
                 or (k.item_kind = 'listing' and k.item_id in (select id from listings))
                 or (k.item_kind = 'search_result' and (k.item_id = v_biz.id or k.item_id in (select id from listings) or lower(btrim(k.source_name)) = lower(btrim(v_biz.name))))
                 or (k.item_kind is null and lower(btrim(k.source_name)) = lower(btrim(v_biz.name))))
        ), imp as (
            select i.*
              from public.sponsor_impressions i
             where i.viewed_at >= v_from and i.viewed_at < v_to
               and i.sponsor_id in (select id from spots)
               and not (coalesce(i.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)')
        )
        insert into public.click_monthly_archives (
            archive_month, scope, business_id, business_name, summary, by_item, by_search, by_day, archived_at
        )
        select
            v_month, 'business', v_biz.id, v_biz.name,
            jsonb_build_object(
                'total_clicks', (select count(*) from clean),
                'search_clicks', (select count(*) from clean where is_search),
                'sponsored_clicks', (select count(*) from clean where item_kind = 'search_sponsor'),
                'sponsored_impressions', (select count(*) from imp),
                'sponsored_ctr', case when (select count(*) from imp) > 0
                    then round(((select count(*)::numeric from clean where item_kind = 'search_sponsor') / (select count(*)::numeric from imp)) * 100.0, 1)
                    else 0.0 end,
                'business_page', (select count(*) from clean where not is_search and item_kind = 'directory'),
                'listings', (select count(*) from clean where not is_search and item_kind = 'listing'),
                'newsletter', (select count(*) from clean where not is_search and item_kind is null)
            ),
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'title', article_title, 'kind', coalesce(item_kind, 'newsletter'),
                    'target_url', min(target_url), 'clicks', count(*),
                    'unique_visitors', count(distinct nullif(visitor_hash, '')), 'last_click', max(clicked_at)
                ) order by count(*) desc)
                  from clean where not is_search group by article_title, item_kind, item_id), '[]'::jsonb),
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'title', article_title, 'kind', coalesce(item_kind, 'search_result'),
                    'page', min(coalesce(page, 'search-results')), 'target_url', min(target_url),
                    'clicks', count(*), 'unique_visitors', count(distinct nullif(visitor_hash, '')),
                    'last_click', max(clicked_at)
                ) order by count(*) desc)
                  from clean where is_search group by article_title, item_kind, item_id), '[]'::jsonb),
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'day', to_char(g::date, 'YYYY-MM-DD'),
                    'search_clicks', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and is_search),
                    'sponsored_clicks', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and item_kind = 'search_sponsor'),
                    'sponsored_impressions', (select count(*) from imp where (viewed_at at time zone 'America/Toronto')::date = g::date),
                    'business_page', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and not is_search and item_kind = 'directory'),
                    'listings', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and not is_search and item_kind = 'listing')
                ) order by g)
                  from generate_series(v_m_start::timestamp, (v_m_end - interval '1 day')::timestamp, interval '1 day') g), '[]'::jsonb),
            now()
        where (select count(*) from clean) > 0 or (select count(*) from imp) > 0
        on conflict (archive_month, scope, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid))
        do update set
            summary = excluded.summary,
            by_item = excluded.by_item,
            by_search = excluded.by_search,
            by_day = excluded.by_day,
            archived_at = now();
        v_written := v_written + 1;
    end loop;

    return v_written;
end;
$$;
revoke all on function public.wg_archive_month_clicks(text) from public, anon, authenticated;
grant execute on function public.wg_archive_month_clicks(text) to service_role;

-- Ensure every completed past month with clicks/impressions has an archive snapshot
create or replace function public.wg_ensure_monthly_archives()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_cur_month text := to_char(now() at time zone 'America/Toronto', 'YYYY-MM');
    v_m record;
    v_done int := 0;
begin
    -- Allowed for staff, signed-in business accounts, or scheduled cron jobs (auth.uid() is null in cron)
    if auth.uid() is not null
       and not public.wg_is_trusted_caller()
       and not exists (select 1 from public.business_accounts a where a.user_id = auth.uid()) then
        return 0;
    end if;

    for v_m in
        select distinct m as archive_month
          from (
              select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM') as m
                from public.link_clicks
               where clicked_at < date_trunc('month', now() at time zone 'America/Toronto') at time zone 'America/Toronto'
              union
              select to_char(viewed_at at time zone 'America/Toronto', 'YYYY-MM') as m
                from public.sponsor_impressions
               where viewed_at < date_trunc('month', now() at time zone 'America/Toronto') at time zone 'America/Toronto'
          ) months
         where m < v_cur_month
           and not exists (
               select 1 from public.click_monthly_archives a
                where a.archive_month = months.m and a.scope = 'site'
           )
         order by 1
    loop
        perform public.wg_archive_month_clicks(v_m.archive_month);
        v_done := v_done + 1;
    end loop;

    return v_done;
end;
$$;
revoke all on function public.wg_ensure_monthly_archives() from public, anon;
grant execute on function public.wg_ensure_monthly_archives() to authenticated, service_role;

-- Schedule automatic end-of-month midnight Toronto archiving via pg_cron if installed
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid)
          from cron.job
         where jobname in ('wg-archive-monthly-clicks-edt', 'wg-archive-monthly-clicks-est');
        -- 04:00 UTC on 1st of month = 00:00 EDT; 05:00 UTC on 1st = 00:00 EST
        perform cron.schedule('wg-archive-monthly-clicks-edt', '1 4 1 * *', 'select public.wg_ensure_monthly_archives();');
        perform cron.schedule('wg-archive-monthly-clicks-est', '1 5 1 * *', 'select public.wg_ensure_monthly_archives();');
    end if;
exception when others then
    -- Safe fallback: wg_ensure_monthly_archives() still runs automatically on report load
    null;
end $$;

-- 5. List & Fetch Monthly Archives (strictly scoped by role / account visibility) ---------
create or replace function public.wg_list_click_archives(business_id_input uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_is_staff boolean := public.wg_is_trusted_caller();
    v_biz_id uuid;
begin
    if v_is_staff then
        if business_id_input is null then
            return coalesce((
                select jsonb_agg(jsonb_build_object(
                    'archive_month', a.archive_month, 'scope', a.scope,
                    'business_id', a.business_id, 'business_name', a.business_name,
                    'summary', a.summary, 'archived_at', a.archived_at
                ) order by a.archive_month desc)
                  from public.click_monthly_archives a
                 where a.scope = 'site'
            ), '[]'::jsonb);
        else
            return coalesce((
                select jsonb_agg(jsonb_build_object(
                    'archive_month', a.archive_month, 'scope', a.scope,
                    'business_id', a.business_id, 'business_name', a.business_name,
                    'summary', a.summary, 'archived_at', a.archived_at
                ) order by a.archive_month desc)
                  from public.click_monthly_archives a
                 where a.scope = 'business' and a.business_id = business_id_input
            ), '[]'::jsonb);
        end if;
    end if;

    -- Merchant: strictly limited to their own linked business
    select a.business_id into v_biz_id from public.business_accounts a where a.user_id = auth.uid();
    if v_biz_id is null then
        return '[]'::jsonb;
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'archive_month', a.archive_month, 'scope', a.scope,
            'business_id', a.business_id, 'business_name', a.business_name,
            'summary', a.summary, 'archived_at', a.archived_at
        ) order by a.archive_month desc)
          from public.click_monthly_archives a
         where a.scope = 'business' and a.business_id = v_biz_id
    ), '[]'::jsonb);
end;
$$;
revoke all on function public.wg_list_click_archives(uuid) from public, anon;
grant execute on function public.wg_list_click_archives(uuid) to authenticated, service_role;

create or replace function public.wg_get_click_archive(month_input text, business_id_input uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_is_staff boolean := public.wg_is_trusted_caller();
    v_biz_id uuid;
    v_row public.click_monthly_archives%rowtype;
begin
    if v_is_staff then
        if business_id_input is null then
            select * into v_row from public.click_monthly_archives
             where archive_month = month_input and scope = 'site' limit 1;
        else
            select * into v_row from public.click_monthly_archives
             where archive_month = month_input and scope = 'business' and business_id = business_id_input limit 1;
        end if;
    else
        select a.business_id into v_biz_id from public.business_accounts a where a.user_id = auth.uid();
        if v_biz_id is null then return null; end if;
        select * into v_row from public.click_monthly_archives
         where archive_month = month_input and scope = 'business' and business_id = v_biz_id limit 1;
    end if;

    if not found then return null; end if;
    return jsonb_build_object(
        'archive_month', v_row.archive_month,
        'scope', v_row.scope,
        'business_id', v_row.business_id,
        'business_name', v_row.business_name,
        'summary', v_row.summary,
        'by_business', v_row.by_business,
        'by_item', v_row.by_item,
        'by_search', v_row.by_search,
        'by_day', v_row.by_day,
        'archived_at', v_row.archived_at
    );
end;
$$;
revoke all on function public.wg_get_click_archive(text, uuid) from public, anon;
grant execute on function public.wg_get_click_archive(text, uuid) to authenticated, service_role;

-- 6. Updated Staff Click Report (excludes admin pages, adds by_search & by_month) ---------
create or replace function public.wg_click_report(from_input date, to_input date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_from timestamptz;
    v_to timestamptz;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    v_from := (coalesce(from_input, (now() at time zone 'America/Toronto')::date - 30))::timestamp at time zone 'America/Toronto';
    v_to := (coalesce(to_input, (now() at time zone 'America/Toronto')::date) + 1)::timestamp at time zone 'America/Toronto';

    return (
        with clean as (
            select k.*,
                   (k.item_kind in ('search_sponsor', 'search_result', 'search')
                    or coalesce(k.page, '') in ('home-search', 'discovery', 'search', 'search-results')) as is_search
              from public.link_clicks k
             where k.clicked_at >= v_from and k.clicked_at < v_to
               and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                     or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
        )
        select jsonb_build_object(
            'from', v_from, 'to', v_to,
            'totals', (
                select jsonb_build_object(
                    'clicks', count(*),
                    'unique_visitors', count(distinct nullif(visitor_hash, '')),
                    'website_clicks', count(*) filter (where item_kind is not null),
                    'newsletter_clicks', count(*) filter (where item_kind is null),
                    'search_clicks', count(*) filter (where is_search))
                  from clean),
            'by_business', coalesce((
                select jsonb_agg(b order by (b ->> 'clicks')::int desc)
                  from (select jsonb_build_object(
                               'business', c.source_name,
                               'business_id', (select d.id from public.directory_listings d
                                                where d.status = 'approved'
                                                  and lower(btrim(d.name)) = lower(btrim(c.source_name))
                                                limit 1),
                               'clicks', count(*),
                               'unique_visitors', count(distinct nullif(c.visitor_hash, '')),
                               'website_clicks', count(*) filter (where c.item_kind is not null),
                               'newsletter_clicks', count(*) filter (where c.item_kind is null),
                               'search_clicks', count(*) filter (where c.is_search),
                               'listings', count(distinct coalesce(c.item_id::text, c.article_title))) as b
                          from clean c
                         group by c.source_name) s), '[]'::jsonb),
            'by_item', coalesce((
                select jsonb_agg(i order by (i ->> 'clicks')::int desc)
                  from (select jsonb_build_object(
                               'business', source_name,
                               'title', article_title,
                               'kind', coalesce(item_kind, 'newsletter'),
                               'category', min(category),
                               'item_id', item_id,
                               'target_url', min(target_url),
                               'clicks', count(*),
                               'unique_visitors', count(distinct nullif(visitor_hash, '')),
                               'last_click', max(clicked_at)) as i
                          from clean
                         where not is_search
                         group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
            'by_search', coalesce((
                select jsonb_agg(i order by (i ->> 'clicks')::int desc)
                  from (select jsonb_build_object(
                               'business', source_name,
                               'title', article_title,
                               'kind', coalesce(item_kind, 'search_result'),
                               'page', min(coalesce(page, 'search-results')),
                               'item_id', item_id,
                               'target_url', min(target_url),
                               'clicks', count(*),
                               'unique_visitors', count(distinct nullif(visitor_hash, '')),
                               'last_click', max(clicked_at)) as i
                          from clean
                         where is_search
                         group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
            'by_day', coalesce((
                select jsonb_agg(jsonb_build_object('day', day, 'clicks', clicks, 'unique_visitors', uniq, 'search_clicks', sc) order by day)
                  from (select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM-DD') as day,
                               count(*) as clicks,
                               count(distinct nullif(visitor_hash, '')) as uniq,
                               count(*) filter (where is_search) as sc
                          from clean group by 1) s), '[]'::jsonb),
            'by_month', coalesce((
                select jsonb_agg(jsonb_build_object('month', m, 'clicks', clicks, 'unique_visitors', uniq, 'search_clicks', sc) order by m)
                  from (select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM') as m,
                               count(*) as clicks,
                               count(distinct nullif(visitor_hash, '')) as uniq,
                               count(*) filter (where is_search) as sc
                          from clean group by 1) s), '[]'::jsonb),
            'by_page', coalesce((
                select jsonb_agg(jsonb_build_object('page', pg, 'clicks', clicks) order by clicks desc)
                  from (select coalesce(page, case when item_kind is null then 'newsletter' else 'other' end) as pg,
                               count(*) as clicks
                          from clean group by 1) s), '[]'::jsonb))
    );
end;
$$;
revoke all on function public.wg_click_report(date, date) from public, anon;
grant execute on function public.wg_click_report(date, date) to authenticated, service_role;

-- 7. Unified Business & Admin Stats Report (for /business/index.html) ---------------------
--    Merchants: strictly locked to their own business (business_id_input ignored).
--    Staff/Admins: can pick any business (business_id_input) or All Businesses (null).
drop function if exists public.wg_my_business_report(date, date);
create or replace function public.wg_my_business_report(
    from_input date,
    to_input date,
    business_id_input uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_is_staff boolean := public.wg_is_trusted_caller();
    b public.directory_listings%rowtype;
    v_has_biz boolean := false;
    d_to date := least(coalesce(to_input, (now() at time zone 'America/Toronto')::date),
                       (now() at time zone 'America/Toronto')::date);
    d_from date;
    v_from timestamptz;
    v_to timestamptz;
begin
    if v_is_staff then
        if business_id_input is not null then
            select d.* into b from public.directory_listings d where d.id = business_id_input;
            v_has_biz := found;
        end if;
    else
        select d.* into b
          from public.business_accounts a
          join public.directory_listings d on d.id = a.business_id
         where a.user_id = auth.uid();
        if not found then
            return jsonb_build_object('linked', false, 'viewer_role', 'merchant');
        end if;
        v_has_biz := true;
    end if;

    d_from := greatest(coalesce(from_input, d_to - 29), d_to - 365);
    if d_from > d_to then d_from := d_to; end if;
    v_from := d_from::timestamp at time zone 'America/Toronto';
    v_to := (d_to + 1)::timestamp at time zone 'America/Toronto';

    return (
        with spots as (
            select s.* from public.search_sponsors s
             where (not v_has_biz) or s.business_id = b.id
        ), listings as (
            select e.id from public.vendor_events e
             where (not v_has_biz) or lower(btrim(e.business_name)) = lower(btrim(b.name))
        ), raw_c as (
            select k.*,
                   (k.clicked_at at time zone 'America/Toronto')::date as day,
                   to_char(k.clicked_at at time zone 'America/Toronto', 'YYYY-MM') as month,
                   (k.item_kind in ('search_sponsor', 'search_result', 'search')
                    or coalesce(k.page, '') in ('home-search', 'discovery', 'search', 'search-results')) as is_search
              from public.link_clicks k
             where k.clicked_at >= v_from and k.clicked_at < v_to
               and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                     or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
               and (
                   (not v_has_biz)
                   or (k.item_kind = 'search_sponsor' and k.item_id in (select id from spots))
                   or (k.item_kind = 'directory' and k.item_id = b.id)
                   or (k.item_kind = 'listing' and k.item_id in (select id from listings))
                   or (k.item_kind = 'search_result' and (k.item_id = b.id or k.item_id in (select id from listings) or lower(btrim(k.source_name)) = lower(btrim(b.name))))
                   or (k.item_kind is null and lower(btrim(k.source_name)) = lower(btrim(b.name)))
               )
        ), imp as (
            select (i.viewed_at at time zone 'America/Toronto')::date as day,
                   to_char(i.viewed_at at time zone 'America/Toronto', 'YYYY-MM') as month,
                   i.sponsor_id
              from public.sponsor_impressions i
             where i.viewed_at >= v_from and i.viewed_at < v_to
               and i.sponsor_id in (select id from spots)
               and not (coalesce(i.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)')
        )
        select jsonb_build_object(
            'linked', true,
            'viewer_role', case when v_is_staff then 'admin' else 'merchant' end,
            'business', case when v_has_biz
                then jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug)
                else jsonb_build_object('id', null, 'name', 'All Businesses (Site Overview)', 'slug', null)
            end,
            'businesses_list', case when v_is_staff then coalesce((
                select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'slug', d.slug) order by d.name)
                  from public.directory_listings d
                 where d.status = 'approved'
            ), '[]'::jsonb) else '[]'::jsonb end,
            'from', d_from, 'to', d_to,
            'totals', jsonb_build_object(
                'total_clicks', (select count(*) from raw_c),
                'search_clicks', (select count(*) from raw_c where is_search),
                'sponsored_clicks', (select count(*) from raw_c where item_kind = 'search_sponsor'),
                'sponsored_impressions', (select count(*) from imp),
                'sponsored_ctr', (
                    case when (select count(*) from imp) > 0
                         then round(((select count(*)::numeric from raw_c where item_kind = 'search_sponsor') / (select count(*)::numeric from imp)) * 100.0, 1)
                         else 0.0 end
                ),
                'sponsored', (select count(*) from raw_c where item_kind = 'search_sponsor'),
                'business_page', (select count(*) from raw_c where not is_search and item_kind = 'directory'),
                'listings', (select count(*) from raw_c where not is_search and item_kind = 'listing'),
                'newsletter', (select count(*) from raw_c where not is_search and item_kind is null)
            ),
            'spots', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'id', s.id, 'keyword', s.keyword, 'target_kind', s.target_kind,
                           'search_query', s.search_query, 'website_url', s.website_url,
                           'starts_at', s.starts_at, 'ends_at', s.ends_at, 'active', s.active,
                           'impressions', (select count(*) from imp where imp.sponsor_id = s.id),
                           'clicks', (select count(*) from raw_c where raw_c.item_kind = 'search_sponsor' and raw_c.item_id = s.id),
                           'ctr', case when (select count(*) from imp where imp.sponsor_id = s.id) > 0
                                then round(((select count(*)::numeric from raw_c where raw_c.item_kind = 'search_sponsor' and raw_c.item_id = s.id) /
                                            (select count(*)::numeric from imp where imp.sponsor_id = s.id)) * 100.0, 1)
                                else 0.0 end)
                       order by s.starts_at desc)
                  from spots s), '[]'::jsonb),
            'search_items', coalesce((
                select jsonb_agg(item order by (item->>'clicks')::int desc)
                  from (
                      select jsonb_build_object(
                                 'title', article_title,
                                 'business', source_name,
                                 'kind', coalesce(item_kind, 'search_result'),
                                 'page', min(coalesce(page, 'search-results')),
                                 'target_url', min(target_url),
                                 'clicks', count(*),
                                 'unique_visitors', count(distinct nullif(visitor_hash, '')),
                                 'last_click', max(clicked_at)) as item
                        from raw_c
                       where is_search
                       group by article_title, source_name, item_kind, item_id
                  ) s), '[]'::jsonb),
            'listing_items', coalesce((
                select jsonb_agg(item order by (item->>'clicks')::int desc)
                  from (
                      select jsonb_build_object(
                                 'title', article_title,
                                 'business', source_name,
                                 'kind', coalesce(item_kind, 'newsletter'),
                                 'target_url', min(target_url),
                                 'clicks', count(*),
                                 'unique_visitors', count(distinct nullif(visitor_hash, '')),
                                 'last_click', max(clicked_at)) as item
                        from raw_c
                       where not is_search
                       group by article_title, source_name, item_kind, item_id
                  ) l), '[]'::jsonb),
            'daily', (
                select jsonb_agg(jsonb_build_object(
                           'day', g::date,
                           'search_clicks', (select count(*) from raw_c where raw_c.day = g::date and is_search),
                           'sponsored_clicks', (select count(*) from raw_c where raw_c.day = g::date and item_kind = 'search_sponsor'),
                           'sponsored_impressions', (select count(*) from imp where imp.day = g::date),
                           'sponsored', (select count(*) from raw_c where raw_c.day = g::date and item_kind = 'search_sponsor'),
                           'business_page', (select count(*) from raw_c where raw_c.day = g::date and not is_search and item_kind = 'directory'),
                           'listings', (select count(*) from raw_c where raw_c.day = g::date and not is_search and item_kind = 'listing'),
                           'newsletter', (select count(*) from raw_c where raw_c.day = g::date and not is_search and item_kind is null))
                       order by g)
                  from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') g),
            'monthly', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'month', m,
                           'search_clicks', (select count(*) from raw_c where raw_c.month = m and is_search),
                           'sponsored_clicks', (select count(*) from raw_c where raw_c.month = m and item_kind = 'search_sponsor'),
                           'sponsored_impressions', (select count(*) from imp where imp.month = m),
                           'business_page', (select count(*) from raw_c where raw_c.month = m and not is_search and item_kind = 'directory'),
                           'listings', (select count(*) from raw_c where raw_c.month = m and not is_search and item_kind = 'listing'),
                           'newsletter', (select count(*) from raw_c where raw_c.month = m and not is_search and item_kind is null))
                       order by m)
                  from (
                      select distinct to_char(g::date, 'YYYY-MM') as m
                        from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') g
                  ) ms), '[]'::jsonb)
        )
    );
end;
$$;
revoke all on function public.wg_my_business_report(date, date, uuid) from public, anon;
grant execute on function public.wg_my_business_report(date, date, uuid) to authenticated;

notify pgrst, 'reload schema';
