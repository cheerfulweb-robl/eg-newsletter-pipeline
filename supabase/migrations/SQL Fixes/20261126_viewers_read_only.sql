-- 2026-11-15: "viewer" accounts can look at the staff pages but cannot change anything.
-- is_staff() (used by many rules and functions) treats every active user_profiles row as
-- staff, including the viewer accounts. Rather than rewrite every rule, this trigger refuses
-- any insert/update/delete made by a signed-in viewer on the tables staff manage.
-- Public visitors (not signed in), the pipeline (service key), admins and staff are not affected.
--
-- Check first which roles exist (expect 'admin' and 'viewer'):
--   select role, active, count(*) from public.user_profiles group by 1, 2;
-- Safe to re-run.

create or replace function public.wg_is_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_profiles
        where id = auth.uid() and active = true and lower(coalesce(role, '')) = 'viewer'
    );
$$;

create or replace function public.wg_block_viewer_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(auth.role(), '') <> 'service_role' and public.wg_is_viewer() then
        raise exception 'Viewer accounts are read-only' using errcode = '42501';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array[
        'vendor_events', 'vendor_scrape_sources', 'directory_listings', 'press_articles',
        'newsletter_settings', 'newsletter_subscribers', 'newsletter_editions', 'newsletter_archive',
        'partners', 'claims', 'scraped_url_blacklist', 'coupons', 'wallets', 'presentation_tokens',
        'redemptions', 'home_gallery', 'spotlight_schedule', 'search_sponsors', 'user_profiles',
        'hamper_applications', 'hamper_coupons', 'hamper_offers', 'vendor_profiles', 'activity_logs'
    ]
    loop
        if to_regclass('public.' || t) is not null then
            execute format('drop trigger if exists wg_block_viewer_writes on public.%I', t);
            execute format(
                'create trigger wg_block_viewer_writes before insert or update or delete on public.%I '
                'for each row execute function public.wg_block_viewer_writes()', t);
        end if;
    end loop;
end;
$$;

-- Undo (if ever needed):
--   do $$ declare t text; begin
--     for t in select event_object_table from information_schema.triggers
--              where trigger_name = 'wg_block_viewer_writes' loop
--       execute format('drop trigger if exists wg_block_viewer_writes on public.%I', t);
--     end loop; end $$;
