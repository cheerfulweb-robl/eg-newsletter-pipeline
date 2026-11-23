-- ============================================================================
-- Click tracking for advertisers (site v59), 2026-11-14
--
-- Every outbound merchant link on the website goes through /news/go.html with a
-- listing id (not a web address). wg_track_click() looks the destination up in
-- the database, records the click and returns the address, so the redirect is
-- instant and cannot be abused to send people to arbitrary sites.
--
--   kind 'listing'      -> vendor_events (events, dining specials, sales)
--   kind 'directory'    -> directory_listings (Businesses page)
--   kind 'hamper_offer' -> hamper_offers.merchant_website (new column)
--
-- Staff read the results with wg_click_report() on /staff/clicks.html.
-- Newsletter clicks keep working as before (they have no item_kind).
--
-- Run in the Supabase SQL Editor AFTER 20261117. Safe to re-run.
-- ============================================================================

-- 1. Extra columns on link_clicks ---------------------------------------------------
alter table public.link_clicks add column if not exists item_kind text;
alter table public.link_clicks add column if not exists item_id uuid;
alter table public.link_clicks add column if not exists page text;
create index if not exists link_clicks_clicked_at on public.link_clicks (clicked_at);
create index if not exists link_clicks_item on public.link_clicks (item_kind, item_id);

-- 2. Hamper offers get an optional merchant website -------------------------------------
alter table public.hamper_offers add column if not exists merchant_website text;

-- 3. Record a click and return where to send the visitor ---------------------------------
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
    -- Only real web addresses; no credentials in the address.
    if v_url !~* '^https?://[^/@\s]+' or v_url ~ '\s' then
        return null;
    end if;

    -- The same visitor clicking the same listing within 30 seconds counts once.
    if v_visitor = '' or not exists (
        select 1 from public.link_clicks c
         where c.item_id = id_input and c.visitor_hash = v_visitor
           and c.clicked_at > now() - interval '30 seconds') then
        insert into public.link_clicks (issue_date, article_title, source_name, category, target_url,
                                        visitor_hash, user_agent, item_kind, item_id, page)
        values (to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
                left(coalesce(v_title, ''), 300), left(coalesce(nullif(v_business, ''), 'Welcome Georgina'), 200),
                left(v_category, 80), left(v_url, 2000), v_visitor, '', kind_input, id_input, v_page);
    end if;
    return v_url;
end;
$$;

revoke all on function public.wg_track_click(text, uuid, text, text) from public;
grant execute on function public.wg_track_click(text, uuid, text, text) to anon, authenticated, service_role;

-- 4. Staff click report -------------------------------------------------------------------
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
    -- Whole days, Toronto time.
    v_from := (coalesce(from_input, (now() at time zone 'America/Toronto')::date - 30))::timestamp at time zone 'America/Toronto';
    v_to := (coalesce(to_input, (now() at time zone 'America/Toronto')::date) + 1)::timestamp at time zone 'America/Toronto';

    return jsonb_build_object(
        'from', v_from, 'to', v_to,
        'totals', (
            select jsonb_build_object(
                'clicks', count(*),
                'unique_visitors', count(distinct nullif(visitor_hash, '')),
                'website_clicks', count(*) filter (where item_kind is not null),
                'newsletter_clicks', count(*) filter (where item_kind is null))
              from public.link_clicks where clicked_at >= v_from and clicked_at < v_to),
        'by_business', coalesce((
            select jsonb_agg(b order by (b ->> 'clicks')::int desc)
              from (select jsonb_build_object(
                           'business', source_name,
                           'clicks', count(*),
                           'unique_visitors', count(distinct nullif(visitor_hash, '')),
                           'website_clicks', count(*) filter (where item_kind is not null),
                           'newsletter_clicks', count(*) filter (where item_kind is null),
                           'listings', count(distinct coalesce(item_id::text, article_title))) as b
                      from public.link_clicks
                     where clicked_at >= v_from and clicked_at < v_to
                     group by source_name) s), '[]'::jsonb),
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
                      from public.link_clicks
                     where clicked_at >= v_from and clicked_at < v_to
                     group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
        'by_day', coalesce((
            select jsonb_agg(jsonb_build_object('day', day, 'clicks', clicks, 'unique_visitors', uniq) order by day)
              from (select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM-DD') as day,
                           count(*) as clicks,
                           count(distinct nullif(visitor_hash, '')) as uniq
                      from public.link_clicks
                     where clicked_at >= v_from and clicked_at < v_to
                     group by 1) s), '[]'::jsonb),
        'by_page', coalesce((
            select jsonb_agg(jsonb_build_object('page', pg, 'clicks', clicks) order by clicks desc)
              from (select coalesce(page, case when item_kind is null then 'newsletter' else 'other' end) as pg,
                           count(*) as clicks
                      from public.link_clicks
                     where clicked_at >= v_from and clicked_at < v_to
                     group by 1) s), '[]'::jsonb));
end;
$$;

revoke all on function public.wg_click_report(date, date) from public, anon;
grant execute on function public.wg_click_report(date, date) to authenticated, service_role;

-- 5. Hamper: save the merchant website; wallet coupons say whether a website link exists ----
create or replace function public.hamper_admin_save_offer(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid := nullif(p ->> 'id', '')::uuid;
    v_name text := btrim(coalesce(p ->> 'merchant_name', ''));
    v_email text := lower(btrim(coalesce(p ->> 'merchant_email', '')));
    v_title text := btrim(coalesce(p ->> 'offer_title', ''));
    v_until date := nullif(p ->> 'valid_until', '')::date;
    v_site text := nullif(btrim(coalesce(p ->> 'merchant_website', '')), '');
    v_rows int;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if length(v_name) not between 1 and 120 or length(v_title) not between 1 and 160 then
        raise exception 'Merchant name and offer title are required.' using errcode = '22023';
    end if;
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        raise exception 'A valid merchant email is required (the merchant signs in with it to redeem).' using errcode = '22023';
    end if;
    if v_site is not null and v_site ~* '^www\.' then
        v_site := 'https://' || v_site;
    end if;
    if v_site is not null and (v_site !~* '^https?://[^/@\s]+' or v_site ~ '\s' or length(v_site) > 500) then
        raise exception 'Merchant website must be a web address starting with https://' using errcode = '22023';
    end if;
    if v_id is null then
        insert into public.hamper_offers (merchant_name, merchant_email, offer_title, offer_details, terms, community, active, valid_until, merchant_website)
        values (v_name, v_email, v_title, left(p ->> 'offer_details', 1000), left(p ->> 'terms', 1000),
                nullif(btrim(coalesce(p ->> 'community', '')), ''), coalesce((p ->> 'active')::boolean, true), v_until, v_site)
        returning id into v_id;
        v_rows := 1;
    else
        update public.hamper_offers
           set merchant_name = v_name, merchant_email = v_email, offer_title = v_title,
               offer_details = left(p ->> 'offer_details', 1000), terms = left(p ->> 'terms', 1000),
               community = nullif(btrim(coalesce(p ->> 'community', '')), ''),
               active = coalesce((p ->> 'active')::boolean, active), valid_until = v_until,
               merchant_website = v_site
         where id = v_id;
        get diagnostics v_rows = row_count;
    end if;
    return jsonb_build_object('success', v_rows = 1, 'id', v_id);
end;
$$;

create or replace function public.hamper_my_wallet()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_email text := public.hamper_caller_email();
    v_app record;
begin
    if v_email = '' then
        raise exception 'Please sign in first.' using errcode = '42501';
    end if;
    select id, first_name, status, created_at, coupons_issued_at
      into v_app
      from public.hamper_applications
     where lower(email) = v_email and status <> 'declined'
     order by created_at desc limit 1;
    if not found then
        select id, first_name, status, created_at, coupons_issued_at
          into v_app
          from public.hamper_applications
         where lower(email) = v_email
         order by created_at desc limit 1;
        if not found then
            return jsonb_build_object('application', null, 'coupons', '[]'::jsonb);
        end if;
    end if;
    return jsonb_build_object(
        'application', jsonb_build_object(
            'first_name', v_app.first_name, 'status', v_app.status,
            'created_at', v_app.created_at, 'coupons_issued_at', v_app.coupons_issued_at),
        'coupons', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'code', c.code, 'status', c.status, 'expires_at', c.expires_at,
                       'redeemed_at', c.redeemed_at, 'merchant_name', o.merchant_name,
                       'offer_title', o.offer_title, 'offer_details', o.offer_details,
                       'terms', o.terms, 'community', o.community,
                       'offer_id', o.id, 'has_website', (coalesce(o.merchant_website, '') <> ''))
                   order by o.merchant_name)
              from public.hamper_coupons c join public.hamper_offers o on o.id = c.offer_id
             where c.application_id = v_app.id and c.status <> 'void'), '[]'::jsonb));
end;
$$;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Checks (read-only):
-- select column_name from information_schema.columns where table_name = 'link_clicks' and column_name in ('item_kind','item_id','page');
-- select public.wg_track_click('listing', '00000000-0000-0000-0000-000000000000');   -- null, nothing recorded
-- ----------------------------------------------------------------------------
