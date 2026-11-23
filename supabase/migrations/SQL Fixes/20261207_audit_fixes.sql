-- 2026-11-17: Fixes from the whole-repo audit. Run in the Supabase SQL editor.
-- Order with the site upload: either order works (old pages keep working until the upload).
--
--  1. Nobody outside staff can add rows to claims or partners (the public forms were removed).
--     Before: anyone could add any email to claims with join_newsletter = true.
--  8. Newsletter sign-up returns only the email address (it returned name, town and status
--     of any subscriber to whoever typed their address).
-- 14. Click counts: the public table insert is limited to newsletter clicks, and listing /
--     sponsor clicks are capped per network address (the browser's visitor id can be faked).
-- 15. Retired coupon functions: no calls from the public or signed-in visitors.
-- 16. Signing in no longer confirms every listing filed under your email: My Submissions now
--     confirms only the listing you choose, and sets verified_at like the email link does.

-- 1. claims / partners: staff-only inserts -----------------------------------------------
drop policy if exists "Public can submit new claims" on public.claims;
drop policy if exists "Staff can insert claims" on public.claims;
create policy "Staff can insert claims" on public.claims
    for insert to authenticated with check (public.is_staff());

drop policy if exists "Public can submit pending partners or admin can insert any" on public.partners;
drop policy if exists "Admins can insert partners" on public.partners;
create policy "Admins can insert partners" on public.partners
    for insert to authenticated with check (public.is_admin());

-- 8. register_newsletter_subscriber: same rules as 20261201, but returns only the email ----
create or replace function public.register_newsletter_subscriber(
    email_input text,
    first_name_input text default '',
    area_input text default 'All Georgina',
    audience_input text default 'reader',
    thursday_input boolean default null,
    monday_input boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    clean_email text := lower(trim(email_input));
begin
    if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(clean_email) > 254 then
        raise exception 'Invalid email address' using errcode = '22023';
    end if;

    insert into public.newsletter_subscribers as s (email, first_name, community_area, audience_type, status, wants_thursday, wants_monday)
    values (
        clean_email,
        left(coalesce(trim(first_name_input), ''), 80),
        left(coalesce(nullif(trim(area_input), ''), 'All Georgina'), 80),
        case when audience_input in ('reader', 'vendor', 'both') then audience_input else 'reader' end,
        'pending',
        coalesce(thursday_input, true),
        coalesce(monday_input, false)
    )
    on conflict (email) do update
    set first_name = case when s.status = 'active' then s.first_name
                          when excluded.first_name <> '' then excluded.first_name else s.first_name end,
        community_area = case when s.status = 'active' then s.community_area else excluded.community_area end,
        audience_type = case when s.status = 'active' then s.audience_type else excluded.audience_type end,
        status = case when s.status = 'active' then 'active' else 'pending' end,
        wants_thursday = case when s.status = 'active' then (s.wants_thursday or coalesce(thursday_input, false))
                              when thursday_input is null then s.wants_thursday else thursday_input end,
        wants_monday = case when s.status = 'active' then (s.wants_monday or coalesce(monday_input, false))
                            when monday_input is null then s.wants_monday else monday_input end;

    -- Nothing about the subscriber goes back to the caller (anyone can type any address).
    return jsonb_build_object('email', clean_email);
end;
$$;
grant execute on function public.register_newsletter_subscriber(text, text, text, text, boolean, boolean) to anon, authenticated;

-- 14. Click counting ------------------------------------------------------------------------
drop policy if exists "Public can log link clicks" on public.link_clicks;
create policy "Public can log link clicks" on public.link_clicks
    for insert with check (item_kind is null and item_id is null);  -- newsletter clicks (go.html) only

alter table public.link_clicks add column if not exists ip_hash text;
create index if not exists link_clicks_ip_recent on public.link_clicks (ip_hash, clicked_at);

-- Counts a click only once per item per network address every 30 minutes, and at most 60
-- counted clicks per address per hour. The address comes from the request (not the browser)
-- and is stored only as a hash.
create or replace function public.wg_click_ip_hash()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
    select nullif(md5('wg-click:' || btrim(split_part(coalesce(
        current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1))), md5('wg-click:'));
$$;

create or replace function public.wg_click_should_count(id_input uuid, visitor_input text, ip_input text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
    select case
        when ip_input is not null then
            not exists (select 1 from public.link_clicks c
                         where c.item_id = id_input and c.ip_hash = ip_input
                           and c.clicked_at > now() - interval '30 minutes')
            and (select count(*) from public.link_clicks c
                  where c.ip_hash = ip_input and c.clicked_at > now() - interval '1 hour') < 60
        else
            visitor_input = '' or not exists (select 1 from public.link_clicks c
                         where c.item_id = id_input and c.visitor_hash = visitor_input
                           and c.clicked_at > now() - interval '30 seconds')
    end;
$$;
revoke all on function public.wg_click_should_count(uuid, text, text) from public, anon, authenticated;
revoke all on function public.wg_click_ip_hash() from public, anon, authenticated;

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
    -- Only real web addresses; no credentials in the address.
    if v_url !~* '^https?://[^/@\s]+' or v_url ~ '\s' then
        return null;
    end if;

    if public.wg_click_should_count(id_input, v_visitor, v_ip) then
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
    v_ip text := public.wg_click_ip_hash();
begin
    select * into s from public.search_sponsors
     where search_sponsors.id = id_input and active and now() >= starts_at and now() < ends_at;
    if not found then
        return null;
    end if;

    if s.target_kind = 'website' then
        v_dest := btrim(s.website_url);
    else
        v_dest := '/discovery?q=' || coalesce(nullif(btrim(s.search_query), ''), btrim(s.keyword));
    end if;

    if public.wg_click_should_count(id_input, v_visitor, v_ip) then
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

-- 15. Retired coupon functions: server only -------------------------------------------------
revoke execute on function public.verify_presentation_code(text, text) from public, anon, authenticated;
revoke execute on function public.redeem_coupon_code(text, text) from public, anon, authenticated;
revoke execute on function public.generate_presentation_token(uuid) from public, anon, authenticated;

-- 16. Confirm only the listing the signed-in owner picks -------------------------------------
-- The old no-argument version now confirms nothing, so a cached old page does no harm.
create or replace function public.confirm_my_submissions()
returns uuid[]
language sql
security definer
set search_path = public, pg_temp
as $$ select '{}'::uuid[] $$;

create or replace function public.confirm_my_submissions(ids_input uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    me text := lower(coalesce(auth.jwt() ->> 'email', ''));
    ids uuid[];
begin
    if me = '' then
        raise exception 'Not signed in' using errcode = '42501';
    end if;
    with done as (
        update public.vendor_events
        set status = 'pending', verified_at = now(), verify_token = null, verify_token_expires_at = null
        where status = 'pending_verification' and lower(submitter_email) = me
          and id = any(coalesce(ids_input, '{}'::uuid[]))
        returning id
    )
    select coalesce(array_agg(id), '{}') into ids from done;
    return ids;
end;
$$;
revoke all on function public.confirm_my_submissions(uuid[]) from public, anon;
grant execute on function public.confirm_my_submissions(uuid[]) to authenticated;

-- Checks: the first two should return no rows; the last should be false, false.
select policyname from pg_policies where tablename in ('claims', 'partners') and cmd = 'INSERT' and roles @> '{public}';
select policyname from pg_policies where tablename = 'link_clicks' and cmd = 'INSERT' and with_check = 'true';
select has_function_privilege('authenticated', 'public.redeem_coupon_code(text,text)', 'EXECUTE') as signed_in_can_redeem,
       has_function_privilege('anon', 'public.generate_presentation_token(uuid)', 'EXECUTE') as anon_can_make_tokens;
