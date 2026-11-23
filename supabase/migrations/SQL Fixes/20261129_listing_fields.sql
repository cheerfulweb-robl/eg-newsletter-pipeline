-- 2026-11-15 Phase 2: listing details get their own fields, so titles never carry
-- "[Sale]" / "[Eat-In, Take-Out]" style brackets again.
-- RUN THIS BEFORE uploading the v64 site build (the new pages read these columns).
-- Safe to re-run.

-- 1. New columns -------------------------------------------------------------------------
alter table public.vendor_events add column if not exists service_options text[];   -- dining: 'Eat In','Take Out','Delivery'; null/empty = none
alter table public.vendor_events add column if not exists sale_category text;       -- sales: one of the Sales page categories

alter table public.newsletter_subscribers add column if not exists wants_thursday boolean not null default true;   -- Thursday: the coming weekends
alter table public.newsletter_subscribers add column if not exists wants_monday boolean not null default false;    -- Monday: the week ahead (edition to be built)

-- The public key may read the two new listing columns (see 20261125 for the rest)
grant select (service_options, sale_category) on public.vendor_events to anon;

-- 2. Move what is inside the brackets into the new fields --------------------------------
-- Dining services from title tags like "[Eat-In, Take-Out]"
update public.vendor_events
set service_options = array_remove(array[
        case when title ~* '^\s*\[[^\]]*\m(eat[ -]?in|dine[ -]?in)' then 'Eat In' end,
        case when title ~* '^\s*\[[^\]]*\m(take[ -]?out|pick[ -]?up)' then 'Take Out' end,
        case when title ~* '^\s*\[[^\]]*\mdeliver' then 'Delivery' end
    ], null)
where service_options is null
  and title ~* '^\s*\[[^\]]*(eat|dine|take|pick|deliver)';

-- Sales marked only by a "[Sale]" title prefix get the sale category
update public.vendor_events
set category = 'special_sale'
where title ~* '^\s*\[sale\]'
  and lower(coalesce(category, '')) not in ('sale', 'sales', 'retail_sale', 'special_sale', 'local_sales', 'sales_deal');

-- 3. Remove every leading bracket group from titles ------------------------------------
update public.vendor_events
set title = btrim(regexp_replace(title, '^(\s*\[[^\]]*\]\s*)+', ''))
where title ~ '^\s*\[';

-- 4. Newsletter sign-up takes the Monday / Thursday choice --------------------------------
drop function if exists public.register_newsletter_subscriber(text, text, text, text);
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
    sub_record public.newsletter_subscribers%rowtype;
begin
    if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        raise exception 'Invalid email address' using errcode = '22023';
    end if;

    insert into public.newsletter_subscribers (email, first_name, community_area, audience_type, status, wants_thursday, wants_monday)
    values (
        clean_email,
        coalesce(trim(first_name_input), ''),
        coalesce(nullif(trim(area_input), ''), 'All Georgina'),
        case when audience_input in ('reader', 'vendor', 'both') then audience_input else 'reader' end,
        'pending',
        coalesce(thursday_input, true),
        coalesce(monday_input, false)
    )
    on conflict (email) do update
    set first_name = case when excluded.first_name <> '' then excluded.first_name else public.newsletter_subscribers.first_name end,
        community_area = excluded.community_area,
        audience_type = excluded.audience_type,
        status = case when public.newsletter_subscribers.status = 'active' then 'active' else 'pending' end,
        wants_thursday = case when thursday_input is null then public.newsletter_subscribers.wants_thursday else thursday_input end,
        wants_monday = case when monday_input is null then public.newsletter_subscribers.wants_monday else monday_input end
    returning * into sub_record;

    return jsonb_build_object(
        'email', sub_record.email,
        'first_name', sub_record.first_name,
        'community_area', sub_record.community_area,
        'audience_type', sub_record.audience_type,
        'status', sub_record.status,
        'wants_thursday', sub_record.wants_thursday,
        'wants_monday', sub_record.wants_monday
    );
end;
$$;
grant execute on function public.register_newsletter_subscriber(text, text, text, text, boolean, boolean) to anon, authenticated;

-- 5. My Submissions can edit end date, community, deal text, services and sale category --
create or replace function public.update_my_submission(id_input uuid, email_input text, updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
    found_id uuid;
begin
    if not (
        public.wg_is_trusted_caller()
        or (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            and lower(auth.jwt() ->> 'email') = lower(trim(coalesce(email_input, '')))
        )
    ) then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    select id into found_id from public.vendor_events
    where id = id_input and lower(submitter_email) = lower(trim(email_input));

    if found_id is null then
        return jsonb_build_object('success', false, 'error', 'Listing not found or email does not match');
    end if;

    update public.vendor_events
    set
        business_name = coalesce(updates->>'business_name', business_name),
        location = coalesce(updates->>'location', location),
        -- titles never keep leading "[...]" tags
        title = coalesce(nullif(btrim(regexp_replace(updates->>'title', '^(\s*\[[^\]]*\]\s*)+', '')), ''), title),
        event_date_label = coalesce(updates->>'event_date_label', event_date_label),
        event_start_date = case
            when updates ? 'event_start_date' and coalesce(updates->>'event_start_date', '') <> ''
            then (updates->>'event_start_date')::date else event_start_date end,
        expires_after = case
            when updates ? 'expires_after' and coalesce(updates->>'expires_after', '') = '' then null
            when updates ? 'expires_after' then (updates->>'expires_after')::date
            else expires_after end,
        community = coalesce(nullif(updates->>'community', ''), community),
        price_text = case when updates ? 'price_text' then nullif(btrim(updates->>'price_text'), '') else price_text end,
        service_options = case
            when updates ? 'service_options' and jsonb_typeof(updates->'service_options') = 'array'
            then array(select x from jsonb_array_elements_text(updates->'service_options') x
                       where x in ('Eat In', 'Take Out', 'Delivery'))
            else service_options end,
        sale_category = case when updates ? 'sale_category' then nullif(btrim(updates->>'sale_category'), '') else sale_category end,
        category = coalesce(updates->>'category', category),
        link = coalesce(updates->>'link', link),
        summary = coalesce(updates->>'summary', summary),
        status = 'pending'
    where id = id_input;

    return jsonb_build_object('success', true);
end;
$function$;

-- 6. Signing in with the emailed link proves the email address, so that person's listings
--    still waiting for email confirmation are confirmed (they then go to staff for review).
--    Only the signed-in owner's own listings; returns their ids so the page can alert staff.
create or replace function public.confirm_my_submissions()
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
        set status = 'pending', verify_token = null, verify_token_expires_at = null
        where status = 'pending_verification' and lower(submitter_email) = me
        returning id
    )
    select coalesce(array_agg(id), '{}') into ids from done;
    return ids;
end;
$$;
revoke execute on function public.confirm_my_submissions() from anon, public;
grant execute on function public.confirm_my_submissions() to authenticated;
