-- 2026-11-17: Business accounts for sponsors (/business/).
--
--  * search_sponsors.business_id: staff pick which business a sponsored spot belongs to.
--  * business_accounts: links a sponsor's login (email + password, created by an admin in the
--    Supabase dashboard: Authentication > Add user) to one business in the directory.
--    Sponsors get NO user_profiles row: is_staff() is true for any active profile, so a profile
--    would make them staff.
--  * wg_admin_set_business_account / wg_admin_business_accounts: admin tools (Search Sponsors page).
--  * wg_my_business_report(from, to): the signed-in business's own clicks, by Toronto day.
-- Run in the Supabase SQL editor before uploading the build that has /business/.

alter table public.search_sponsors
    add column if not exists business_id uuid references public.directory_listings(id) on delete set null;
create index if not exists search_sponsors_business on public.search_sponsors (business_id);

create table if not exists public.business_accounts (
    user_id uuid primary key references auth.users(id) on delete cascade,
    business_id uuid not null references public.directory_listings(id) on delete cascade,
    created_at timestamptz not null default now(),
    created_by uuid default auth.uid()
);
alter table public.business_accounts enable row level security;
revoke all on public.business_accounts from anon, authenticated;

create or replace function public.wg_admin_set_business_account(email_input text, business_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
    uid uuid;
begin
    if not public.is_admin() then
        raise exception 'Only admins can manage business accounts' using errcode = '42501';
    end if;
    select u.id into uid from auth.users u where lower(u.email) = lower(btrim(coalesce(email_input, '')));
    if uid is null then
        return jsonb_build_object('success', false, 'error',
            'No login exists for that email. Create it first in Supabase: Authentication > Add user (with a password, auto-confirm).');
    end if;
    if exists (select 1 from public.user_profiles p where p.id = uid) then
        return jsonb_build_object('success', false, 'error', 'That email is a staff account. Use a separate email for the business.');
    end if;
    if business_id_input is null then
        delete from public.business_accounts where user_id = uid;
        return jsonb_build_object('success', true, 'removed', true);
    end if;
    if not exists (select 1 from public.directory_listings d where d.id = business_id_input) then
        return jsonb_build_object('success', false, 'error', 'That business is not in the directory.');
    end if;
    insert into public.business_accounts (user_id, business_id) values (uid, business_id_input)
    on conflict (user_id) do update set business_id = excluded.business_id;
    return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.wg_admin_set_business_account(text, uuid) from public, anon;
grant execute on function public.wg_admin_set_business_account(text, uuid) to authenticated;

create or replace function public.wg_admin_business_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
                   'email', u.email, 'business_id', a.business_id, 'business_name', d.name,
                   'created_at', a.created_at, 'last_sign_in_at', u.last_sign_in_at)
               order by d.name, u.email)
          from public.business_accounts a
          join auth.users u on u.id = a.user_id
          join public.directory_listings d on d.id = a.business_id), '[]'::jsonb);
end;
$$;
revoke all on function public.wg_admin_business_accounts() from public, anon;
grant execute on function public.wg_admin_business_accounts() to authenticated;

-- Clicks for the signed-in business, whole Toronto days from_input..to_input (at most 366 days):
--   sponsored = its sponsored Quick Search spots, business_page = website clicks from its
--   directory page, listings = website clicks from its events, sales and dining listings.
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
        )
        select jsonb_build_object(
            'linked', true,
            'business', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug),
            'from', d_from, 'to', d_to,
            'totals', jsonb_build_object(
                'sponsored', (select count(*) from c where kind = 'sponsored'),
                'business_page', (select count(*) from c where kind = 'business_page'),
                'listings', (select count(*) from c where kind = 'listings')),
            'spots', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'keyword', s.keyword, 'target_kind', s.target_kind,
                           'search_query', s.search_query, 'website_url', s.website_url,
                           'starts_at', s.starts_at, 'ends_at', s.ends_at, 'active', s.active,
                           'clicks', (select count(*) from c where c.kind = 'sponsored' and c.item_id = s.id))
                       order by s.starts_at desc)
                  from spots s), '[]'::jsonb),
            'daily', (
                select jsonb_agg(jsonb_build_object(
                           'day', g::date,
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
