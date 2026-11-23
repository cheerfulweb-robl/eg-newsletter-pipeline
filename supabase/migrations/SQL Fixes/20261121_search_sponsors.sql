-- ============================================================================
-- Sponsored "Try searching" keywords on the Home page (site v63), 2026-11-15
--
-- Staff sell spots in the Home hero's "Try searching" row (e.g. "Butter Bee Bagel").
-- Each keyword has a start and end time and links either to a Welcome Georgina
-- search or to the sponsor's own website. Every click is recorded in link_clicks
-- (item_kind 'search_sponsor'), so sponsors also appear in /staff/clicks.html.
--
--   search_sponsors                 table, admins edit / staff read (RLS)
--   wg_active_search_sponsors()     public: keywords live right now (no web addresses)
--   wg_record_sponsor_click(...)    public: records a click; returns the website for
--                                   website sponsors ('' for search sponsors, null if not live)
--   wg_search_sponsor_report()      staff: every keyword with its click totals
--
-- wg_track_click() is NOT changed. Run in the Supabase SQL Editor AFTER 20261120.
-- Safe to re-run.
-- ============================================================================

-- 1. Table ---------------------------------------------------------------------------
create table if not exists public.search_sponsors (
    id uuid primary key default gen_random_uuid(),
    keyword text not null,
    sponsor_name text not null,
    target_kind text not null default 'search',
    search_query text,
    website_url text,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    priority int not null default 0,
    active boolean not null default true,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid default auth.uid(),
    constraint search_sponsors_keyword_len check (char_length(btrim(keyword)) between 2 and 40),
    constraint search_sponsors_name_len check (char_length(btrim(sponsor_name)) between 1 and 120),
    constraint search_sponsors_kind check (target_kind in ('search', 'website')),
    constraint search_sponsors_query_len check (search_query is null or char_length(search_query) <= 80),
    constraint search_sponsors_window check (ends_at > starts_at),
    constraint search_sponsors_priority check (priority between -100 and 100),
    constraint search_sponsors_notes_len check (notes is null or char_length(notes) <= 1000),
    -- Website sponsors need a real web address without credentials or spaces.
    constraint search_sponsors_website check (
        target_kind <> 'website'
        or (website_url ~* '^https?://[^/@\s]+' and website_url !~* '^https?://[^/]*@'
            and website_url !~ '\s' and char_length(website_url) <= 500))
);

create index if not exists search_sponsors_window_idx on public.search_sponsors (active, starts_at, ends_at);

create or replace function public.wg_search_sponsors_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists search_sponsors_touch on public.search_sponsors;
create trigger search_sponsors_touch before update on public.search_sponsors
    for each row execute function public.wg_search_sponsors_touch();

-- 2. Access: admins edit, staff (incl. viewers) read, the public goes through the functions below.
alter table public.search_sponsors enable row level security;
revoke all on public.search_sponsors from anon;
grant select, insert, update, delete on public.search_sponsors to authenticated;

drop policy if exists search_sponsors_staff_read on public.search_sponsors;
create policy search_sponsors_staff_read on public.search_sponsors
    for select to authenticated using (public.wg_is_trusted_caller());

drop policy if exists search_sponsors_admin_insert on public.search_sponsors;
create policy search_sponsors_admin_insert on public.search_sponsors
    for insert to authenticated with check (public.is_admin());

drop policy if exists search_sponsors_admin_update on public.search_sponsors;
create policy search_sponsors_admin_update on public.search_sponsors
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists search_sponsors_admin_delete on public.search_sponsors;
create policy search_sponsors_admin_delete on public.search_sponsors
    for delete to authenticated using (public.is_admin());

-- 3. Public: keywords live right now (max 5, highest priority first) ---------------------
create or replace function public.wg_active_search_sponsors()
returns table (id uuid, keyword text, target_kind text, search_query text)
language sql
stable
security definer
set search_path = public
as $$
    select s.id, btrim(s.keyword), s.target_kind,
           case when s.target_kind = 'search' then coalesce(nullif(btrim(s.search_query), ''), btrim(s.keyword)) end
      from public.search_sponsors s
     where s.active and now() >= s.starts_at and now() < s.ends_at
     order by s.priority desc, s.starts_at, s.created_at
     limit 5;
$$;

revoke all on function public.wg_active_search_sponsors() from public;
grant execute on function public.wg_active_search_sponsors() to anon, authenticated, service_role;

-- 4. Public: record a click --------------------------------------------------------------
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

    -- The same visitor clicking the same keyword within 30 seconds counts once.
    if v_visitor = '' or not exists (
        select 1 from public.link_clicks c
         where c.item_id = id_input and c.visitor_hash = v_visitor
           and c.clicked_at > now() - interval '30 seconds') then
        insert into public.link_clicks (issue_date, article_title, source_name, category, target_url,
                                        visitor_hash, user_agent, item_kind, item_id, page)
        values (to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
                left('Try searching: ' || btrim(s.keyword), 300), left(btrim(s.sponsor_name), 200),
                'search_sponsor', left(v_dest, 2000), v_visitor, '', 'search_sponsor', id_input,
                coalesce(v_page, 'home-search'));
    end if;

    return case when s.target_kind = 'website' then v_dest else '' end;
end;
$$;

revoke all on function public.wg_record_sponsor_click(uuid, text, text) from public;
grant execute on function public.wg_record_sponsor_click(uuid, text, text) to anon, authenticated, service_role;

-- 5. Staff: every keyword with its clicks ------------------------------------------------
create or replace function public.wg_search_sponsor_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(r order by r ->> 'starts_at' desc)
          from (select jsonb_build_object(
                       'id', s.id,
                       'clicks', count(c.clicked_at),
                       'unique_visitors', count(distinct nullif(c.visitor_hash, '')),
                       'clicks_7d', count(c.clicked_at) filter (where c.clicked_at > now() - interval '7 days'),
                       'last_click', max(c.clicked_at),
                       'starts_at', s.starts_at) as r
                  from public.search_sponsors s
                  left join public.link_clicks c on c.item_kind = 'search_sponsor' and c.item_id = s.id
                 group by s.id, s.starts_at) x), '[]'::jsonb);
end;
$$;

revoke all on function public.wg_search_sponsor_report() from public, anon;
grant execute on function public.wg_search_sponsor_report() to authenticated, service_role;
