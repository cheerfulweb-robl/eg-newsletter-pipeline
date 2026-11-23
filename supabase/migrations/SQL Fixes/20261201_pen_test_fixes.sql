-- 2026-11-15 pen test fixes (v64.4). Run once in the Supabase SQL editor; safe to re-run.
-- UPLOAD THE v64.4 SITE BUILD FIRST: after this file, signed-in users (staff included) can
-- only read the public columns of listings directly; the v64.4 staff pages read the rest
-- through the admin functions.

-- 1. Signed-in visitors can no longer read submitter emails -------------------------------
--    (20261125 hid them from the public key only; anyone can sign in with a magic link.)
revoke select on public.vendor_events from authenticated;
grant select (id, slug, old_slugs, title, business_name, category, community, contact_phone, created_at, date_type,
              event_date_label, event_start_date, expires_after, image_url, is_featured, latitude, longitude, link,
              location, price_text, recurrence_rule, save_count, status, summary, view_count, service_options, sale_category)
    on public.vendor_events to authenticated;

revoke select on public.vendor_scrape_sources from authenticated;
grant select (id, business_name, scrape_url, default_location, status, created_at, last_scraped_at)
    on public.vendor_scrape_sources to authenticated;

-- 2. Newsletter: a sign-up can never bring its own confirmation token ---------------------
--    The confirm link uses unsubscribe_token; a client-chosen token allowed "confirming" a
--    stranger's address without their click.
create or replace function public.wg_newsletter_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
    if not public.wg_is_trusted_caller() then
        new.unsubscribe_token := gen_random_uuid();
        new.confirmed_at := null;
        if new.status = 'active' then
            new.status := 'pending';
        end if;
    end if;
    return new;
end;
$$;
drop trigger if exists wg_newsletter_guard_insert on public.newsletter_subscribers;
create trigger wg_newsletter_guard_insert
    before insert on public.newsletter_subscribers
    for each row execute function public.wg_newsletter_guard_insert();

-- 3. Newsletter sign-up cannot rewrite an existing subscriber ------------------------------
--    New or still-pending rows take the submitted details. An ACTIVE subscriber keeps their
--    name, area and edition; a sign-up can only switch an edition ON for them (never off).
--    An unsubscribed address goes back to pending and must confirm by email again.
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
                            when monday_input is null then s.wants_monday else monday_input end
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

-- 4. Public submissions cannot carry hidden fields ----------------------------------------
--    Anyone who is not staff / the pipeline gets these reset on insert: featured flag, view
--    and save counts, address aliases, confidence score, owner id, created time, map point;
--    category limited to the public form's list; text lengths capped; link must be http(s).
create or replace function public.wg_vendor_events_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
    if not public.wg_is_trusted_caller() then
        new.verify_token := null;
        new.verify_token_expires_at := null;
        new.verified_at := null;
        new.is_featured := false;
        new.view_count := 0;
        new.save_count := 0;
        new.old_slugs := '{}';
        new.data_confidence := null;
        new.confidence_notes := null;
        new.vendor_id := auth.uid();
        new.created_at := now();
        new.latitude := null;
        new.longitude := null;
        if lower(coalesce(new.category, '')) not in (
            'arts', 'business_event', 'community_events', 'family', 'fundraisers', 'live_music',
            'markets', 'news', 'sports', 'workshops', 'dining', 'special_sale'
        ) then
            new.category := 'community_events';
        end if;
        if coalesce(new.link, '') !~* '^https?://' then
            new.link := 'https://welcomegeorgina.ca/events';
        end if;
        new.link := left(new.link, 500);
        new.title := left(btrim(regexp_replace(coalesce(new.title, ''), '^(\s*\[[^\]]*\]\s*)+', '')), 200);
        new.business_name := left(new.business_name, 200);
        new.summary := left(new.summary, 4000);
        new.location := left(new.location, 300);
        new.event_date_label := left(new.event_date_label, 300);
        new.price_text := left(new.price_text, 200);
        new.community := left(new.community, 80);
        new.sale_category := left(new.sale_category, 80);
        new.contact_name := left(new.contact_name, 160);
        new.contact_phone := left(new.contact_phone, 40);
        if new.service_options is not null then
            new.service_options := array(select x from unnest(new.service_options) x where x in ('Eat In', 'Take Out', 'Delivery'));
        end if;
    end if;
    return new;
end;
$$;
-- (trigger wg_vendor_events_guard_insert from 20261124 keeps pointing at this function;
--  it runs after vendor_events_set_slug, so the address the site generated is kept)

-- Owners edit through update_my_submission only; direct table updates are staff-only.
drop policy if exists "Submitters or admins can update pending event" on public.vendor_events;
drop policy if exists "Staff can update events" on public.vendor_events;
create policy "Staff can update events"
    on public.vendor_events for update
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

-- 5. My Submissions edits: no category change, real links only, length caps; a listing still
--    waiting for email confirmation stays that way until it is confirmed.
create or replace function public.update_my_submission(id_input uuid, email_input text, updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
    found_id uuid;
    new_link text := updates->>'link';
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
    if new_link is not null and new_link <> '' and new_link !~* '^https?://' then
        return jsonb_build_object('success', false, 'error', 'The website link must start with https://');
    end if;

    update public.vendor_events
    set
        business_name = left(coalesce(updates->>'business_name', business_name), 200),
        location = left(coalesce(updates->>'location', location), 300),
        title = left(coalesce(nullif(btrim(regexp_replace(updates->>'title', '^(\s*\[[^\]]*\]\s*)+', '')), ''), title), 200),
        event_date_label = left(coalesce(updates->>'event_date_label', event_date_label), 300),
        event_start_date = case
            when updates ? 'event_start_date' and coalesce(updates->>'event_start_date', '') <> ''
            then (updates->>'event_start_date')::date else event_start_date end,
        expires_after = case
            when updates ? 'expires_after' and coalesce(updates->>'expires_after', '') = '' then null
            when updates ? 'expires_after' then (updates->>'expires_after')::date
            else expires_after end,
        community = left(coalesce(nullif(updates->>'community', ''), community), 80),
        price_text = case when updates ? 'price_text' then left(nullif(btrim(updates->>'price_text'), ''), 200) else price_text end,
        service_options = case
            when updates ? 'service_options' and jsonb_typeof(updates->'service_options') = 'array'
            then array(select x from jsonb_array_elements_text(updates->'service_options') x
                       where x in ('Eat In', 'Take Out', 'Delivery'))
            else service_options end,
        sale_category = case when updates ? 'sale_category' then left(nullif(btrim(updates->>'sale_category'), ''), 80) else sale_category end,
        link = left(coalesce(nullif(new_link, ''), link), 500),
        summary = left(coalesce(updates->>'summary', summary), 4000),
        status = case when status = 'pending_verification' then status else 'pending' end
    where id = id_input;

    return jsonb_build_object('success', true);
end;
$function$;

-- 6. Email rate limit decided in one step (no race), per inbox and overall ----------------
alter table public.email_rate_log add column if not exists recipient_key text;
create index if not exists idx_email_rate_log_key_time on public.email_rate_log (recipient_key, created_at desc);

create or replace function public.wg_email_rate_allow(
    recipient_input text,
    form_type_input text,
    per_recipient int default 3,
    global_cap int default 150
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    addr text := lower(trim(coalesce(recipient_input, '')));
    local_part text := split_part(addr, '@', 1);
    domain_part text := split_part(addr, '@', 2);
    k text;
begin
    -- one key per real inbox: drop "+tag", and dots for Gmail
    local_part := split_part(local_part, '+', 1);
    if domain_part in ('gmail.com', 'googlemail.com') then
        local_part := replace(local_part, '.', '');
        domain_part := 'gmail.com';
    end if;
    k := local_part || '@' || domain_part;

    perform pg_advisory_xact_lock(hashtext('wg_email_rate'));
    if (select count(*) from public.email_rate_log where created_at > now() - interval '1 hour') >= global_cap then
        return false;
    end if;
    if (select count(*) from public.email_rate_log
        where coalesce(recipient_key, recipient) = k and created_at > now() - interval '1 hour') >= per_recipient then
        return false;
    end if;
    insert into public.email_rate_log (recipient, recipient_key, form_type) values (addr, k, left(form_type_input, 60));
    delete from public.email_rate_log where created_at < now() - interval '7 days';
    return true;
end;
$$;
revoke execute on function public.wg_email_rate_allow(text, text, int, int) from public, anon, authenticated;
grant execute on function public.wg_email_rate_allow(text, text, int, int) to service_role;

-- 7. Today's backup tables: not readable by anyone but the database owner -----------------
do $$
declare t text;
begin
    foreach t in array array['vendor_events_backup_20261115', 'vendor_events_deleted_20261115', 'vendor_events_deleted_20261115b'] loop
        if to_regclass('public.' || t) is not null then
            execute format('alter table public.%I enable row level security', t);
            execute format('revoke all on public.%I from anon, authenticated', t);
        end if;
    end loop;
end $$;

-- 8. Subscriber management by admins (Special Edition roster) ----------------------------
--    20261124 limited every insert to "pending", which also stopped the admin CSV import
--    (contacts are added as active). There was never a delete rule, so "Remove" and
--    "Reset / Dump roster" silently did nothing. Admins only; viewers stay read-only.
drop policy if exists "Admins can add subscribers" on public.newsletter_subscribers;
create policy "Admins can add subscribers"
    on public.newsletter_subscribers for insert
    with check (public.is_admin());

drop policy if exists "Admins can delete subscribers" on public.newsletter_subscribers;
create policy "Admins can delete subscribers"
    on public.newsletter_subscribers for delete
    using (public.is_admin());

-- (row-level rules above still decide who may do it)
grant insert, update, delete on public.newsletter_subscribers to authenticated;
