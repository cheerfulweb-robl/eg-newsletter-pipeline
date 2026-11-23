-- ============================================================================
-- Friendly page addresses (site v61), 2026-11-14
--
--   /events/whoville-on-high-street-sutton     /dining/thursday-is-pasta-night-baldwin
--   /sales/fall-clearance-keswick              /businesses/route-48
--
-- vendor_events.slug  = title + community, made unique with -2, -3 ...
-- directory_listings.slug = business name, made unique the same way.
-- Every earlier address (the old long name, or one a form created) is kept in
-- old_slugs, so links already shared keep working and forward to the new address.
-- The database sets the address for every new listing; forms can't choose it.
--
-- Run in the Supabase SQL Editor AFTER 20261119_my_submissions.sql. Safe to re-run
-- (existing addresses are only recalculated the first time, see step 4).
-- ============================================================================

-- 1. Address text from any title -------------------------------------------------------
create or replace function public.wg_slugify(input text, max_len int default 60)
returns text
language plpgsql
immutable
as $$
declare
    s text := lower(coalesce(input, ''));
begin
    s := translate(s, 'àáâãäåāçćčèéêëēėęîïíīįìłñńôöòóøōõśšûüùúūÿžźż',
                      'aaaaaaaccceeeeeeeiiiiiilnnooooooossuuuuuyzzz');
    s := replace(replace(replace(s, '&', ' and '), 'œ', 'oe'), 'ß', 'ss');
    s := regexp_replace(s, '[''’]', '', 'g');          -- "Jackson's" -> "jacksons"
    s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
    s := btrim(s, '-');
    if length(s) > max_len then
        s := left(s, max_len);
        -- cut back to the last whole word when that keeps at least 20 characters
        if position('-' in reverse(s)) > 0 and length(s) - position('-' in reverse(s)) >= 20 then
            s := left(s, length(s) - position('-' in reverse(s)));
        end if;
        s := btrim(s, '-');
    end if;
    return nullif(s, '');
end;
$$;

-- title + community, without repeating the community when the title already ends with it
create or replace function public.wg_listing_slug_base(title text, community text)
returns text
language plpgsql
immutable
as $$
declare
    t text := coalesce(public.wg_slugify(title, 60), 'listing');
    c text := public.wg_slugify(community, 30);
begin
    if c is null or c = 'georgina' and t like '%georgina%' or t = c or t like '%-' || c then
        return t;
    end if;
    return t || '-' || c;
end;
$$;

-- 2. Columns ------------------------------------------------------------------------------
alter table public.vendor_events add column if not exists old_slugs text[] not null default '{}';
alter table public.directory_listings add column if not exists slug text;
alter table public.directory_listings add column if not exists old_slugs text[] not null default '{}';

-- The old (non-unique-in-practice) index from 2026-11-04 is replaced by the one in step 5.
drop index if exists public.idx_vendor_events_slug;

-- 3. Unique address helpers ------------------------------------------------------------------
create or replace function public.wg_unique_listing_slug(base text, self_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
    candidate text := base;
    n int := 1;
begin
    while exists (select 1 from public.vendor_events
                   where (slug = candidate or candidate = any(old_slugs))
                     and id is distinct from self_id) loop
        n := n + 1;
        candidate := base || '-' || n;
    end loop;
    return candidate;
end;
$$;

create or replace function public.wg_unique_directory_slug(base text, self_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
    candidate text := base;
    n int := 1;
begin
    while exists (select 1 from public.directory_listings
                   where (slug = candidate or candidate = any(old_slugs))
                     and id is distinct from self_id) loop
        n := n + 1;
        candidate := base || '-' || n;
    end loop;
    return candidate;
end;
$$;

-- 4. One-time recalculation of every existing address (oldest listing gets the plain name) ----
do $$
declare
    r record;
    v_new text;
begin
    if exists (select 1 from public.newsletter_settings where setting_key = 'friendly_urls_v61_done') then
        raise notice 'Friendly addresses were already recalculated; skipping.';
        return;
    end if;

    -- Free every current address first so the oldest listing can take the plain name.
    update public.vendor_events
       set old_slugs = case when slug is not null and not (slug = any(old_slugs))
                            then array_append(old_slugs, slug) else old_slugs end,
           slug = null;
    for r in select id, title, community from public.vendor_events order by created_at, id loop
        v_new := public.wg_unique_listing_slug(public.wg_listing_slug_base(r.title, r.community), r.id);
        update public.vendor_events
           set slug = v_new,
               old_slugs = array_remove(old_slugs, v_new)
         where id = r.id;
    end loop;

    -- A few old names were shared by two listings: only the oldest listing keeps that alias.
    update public.vendor_events e
       set old_slugs = (select coalesce(array_agg(a), '{}') from unnest(e.old_slugs) a
                         where not exists (select 1 from public.vendor_events o
                                            where a = any(o.old_slugs) and o.id <> e.id
                                              and (o.created_at, o.id) < (e.created_at, e.id)));

    update public.directory_listings set slug = null;
    for r in select id, name from public.directory_listings order by created_at nulls last, id loop
        v_new := public.wg_unique_directory_slug(coalesce(public.wg_slugify(r.name, 60), 'business'), r.id);
        update public.directory_listings set slug = v_new where id = r.id;
    end loop;

    insert into public.newsletter_settings (setting_key, setting_value)
    values ('friendly_urls_v61_done', to_jsonb(to_char(now(), 'YYYY-MM-DD HH24:MI')));
end;
$$;

-- 5. Every address unique from now on --------------------------------------------------------
create unique index if not exists vendor_events_slug_unique on public.vendor_events (slug) where slug is not null;
create index if not exists vendor_events_old_slugs on public.vendor_events using gin (old_slugs);
create unique index if not exists directory_listings_slug_unique on public.directory_listings (slug) where slug is not null;
create index if not exists directory_listings_old_slugs on public.directory_listings using gin (old_slugs);

-- 6. New listings get their address from the database ----------------------------------------
create or replace function public.wg_vendor_events_set_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        -- A form may send its own address; keep it as an alias so its links still work.
        if new.slug is not null and new.slug <> '' then
            new.old_slugs := array_append(coalesce(new.old_slugs, '{}'), new.slug);
        end if;
        new.slug := public.wg_unique_listing_slug(public.wg_listing_slug_base(new.title, new.community), new.id);
        new.old_slugs := array_remove(new.old_slugs, new.slug);
    elsif new.slug is distinct from old.slug then
        -- An address never changes after it is created (shared links would break).
        new.slug := old.slug;
    end if;
    return new;
end;
$$;

drop trigger if exists vendor_events_set_slug on public.vendor_events;
create trigger vendor_events_set_slug before insert or update of slug on public.vendor_events
    for each row execute function public.wg_vendor_events_set_slug();

create or replace function public.wg_directory_set_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'INSERT' or new.slug is null then
        new.slug := public.wg_unique_directory_slug(coalesce(public.wg_slugify(new.name, 60), 'business'), new.id);
    elsif new.slug is distinct from old.slug then
        new.slug := old.slug;
    end if;
    return new;
end;
$$;

drop trigger if exists directory_listings_set_slug on public.directory_listings;
create trigger directory_listings_set_slug before insert or update of slug on public.directory_listings
    for each row execute function public.wg_directory_set_slug();

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Checks (read-only):
-- select slug, old_slugs, title from public.vendor_events where status = 'approved' order by created_at desc limit 10;
-- select slug, name from public.directory_listings order by name limit 10;
-- ----------------------------------------------------------------------------
