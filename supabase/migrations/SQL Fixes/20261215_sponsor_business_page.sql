-- ============================================================================
-- Sponsored "Quick Search" keyword can open a business page (site v67.8), 2026-11-18
--
-- A sponsored keyword on the Home page used to do one of two things when tapped:
--   'search'  -> Welcome Georgina search results
--   'website' -> the sponsor's own website (new tab)
-- It can now also do:
--   'business' -> the sponsor's Welcome Georgina business page, e.g. /businesses/route-48.
--                 The business is the one picked in the "Business" field
--                 (search_sponsors.business_id), so the page address always follows
--                 the listing even if its slug changes.
--
--   search_sponsors                   new allowed target_kind 'business' (needs business_id)
--   wg_active_search_sponsors()       now also returns business_slug
--   wg_record_sponsor_click(...)      records the click with /businesses/<slug> as the target
--
-- Run in the Supabase SQL Editor AFTER 20261214. Safe to re-run.
-- ============================================================================

-- 1. Allow the new kind -----------------------------------------------------------------
alter table public.search_sponsors drop constraint if exists search_sponsors_kind;
alter table public.search_sponsors
    add constraint search_sponsors_kind check (target_kind in ('search', 'website', 'business'));

alter table public.search_sponsors drop constraint if exists search_sponsors_business_target;
alter table public.search_sponsors
    add constraint search_sponsors_business_target check (target_kind <> 'business' or business_id is not null);

-- 2. Public: live keywords, now with the business page slug -------------------------------
drop function if exists public.wg_active_search_sponsors();
create function public.wg_active_search_sponsors()
returns table (id uuid, keyword text, target_kind text, search_query text, business_slug text)
language sql
stable
security definer
set search_path = public
as $$
    select s.id, btrim(s.keyword), s.target_kind,
           case when s.target_kind = 'search' then coalesce(nullif(btrim(s.search_query), ''), btrim(s.keyword)) end,
           case when s.target_kind = 'business' then
                (select l.slug from public.directory_listings l
                  where l.id = s.business_id and l.status = 'approved' and l.slug is not null)
           end
      from public.search_sponsors s
     where s.active and now() >= s.starts_at and now() < s.ends_at
     order by s.priority desc, s.starts_at, s.created_at
     limit 5;
$$;

revoke all on function public.wg_active_search_sponsors() from public;
grant execute on function public.wg_active_search_sponsors() to anon, authenticated, service_role;

-- 3. Public: record a click (same as 20261207, plus the business branch) -------------------
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

    if public.wg_click_should_count(id_input, v_visitor, v_ip) then
        insert into public.link_clicks (issue_date, article_title, source_name, category, target_url,
                                        visitor_hash, user_agent, item_kind, item_id, page, ip_hash)
        values (to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
                left('Quick search: ' || btrim(s.keyword), 300), left(btrim(s.sponsor_name), 200),
                'search_sponsor', left(v_dest, 2000), v_visitor, '', 'search_sponsor', id_input,
                coalesce(v_page, 'home-search'), v_ip);
    end if;

    -- Only website sponsors need the browser to be sent somewhere by the server.
    return case when s.target_kind = 'website' then v_dest else '' end;
end;
$$;
revoke all on function public.wg_record_sponsor_click(uuid, text, text) from public;
grant execute on function public.wg_record_sponsor_click(uuid, text, text) to anon, authenticated, service_role;
