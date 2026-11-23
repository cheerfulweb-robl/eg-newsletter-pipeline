-- ============================================================================
-- Merge newsletter sign-ups into both Monday and Thursday editions (site v67.7)
-- 2026-11-18
--
-- Rules:
--   - Monday edition:   Monday to Friday listings
--   - Thursday edition: This coming weekend and next weekend (Friday, Saturday, Sunday)
--   - Subscribers always receive BOTH editions (no single-edition sign-up).
--   - Existing active/pending subscribers on only one edition are moved to both.
--
-- Run in the Supabase SQL Editor AFTER 20261215. Safe to re-run.
-- ============================================================================

-- 1. Move all existing active or pending single-edition subscribers to both editions
update public.newsletter_subscribers
   set wants_monday = true,
       wants_thursday = true
 where status in ('active', 'pending')
   and (wants_monday is distinct from true or wants_thursday is distinct from true);

-- 2. Registering always subscribes to BOTH Monday and Thursday editions
create or replace function public.register_newsletter_subscriber(
    email_input text,
    first_name_input text default '',
    area_input text default 'All Georgina',
    audience_input text default 'reader',
    thursday_input boolean default true,
    monday_input boolean default true
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
        true,
        true
    )
    on conflict (email) do update
    set first_name = case when s.status = 'active' then s.first_name
                          when excluded.first_name <> '' then excluded.first_name else s.first_name end,
        community_area = case when s.status = 'active' then s.community_area else excluded.community_area end,
        audience_type = case when s.status = 'active' then s.audience_type else excluded.audience_type end,
        status = case when s.status = 'active' then 'active' else 'pending' end,
        wants_thursday = true,
        wants_monday = true;

    -- Nothing about the subscriber goes back to the caller (anyone can type any address).
    return jsonb_build_object('email', clean_email, 'status', 'ok');
end;
$$;

revoke all on function public.register_newsletter_subscriber(text, text, text, text, boolean, boolean) from public;
grant execute on function public.register_newsletter_subscriber(text, text, text, text, boolean, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
