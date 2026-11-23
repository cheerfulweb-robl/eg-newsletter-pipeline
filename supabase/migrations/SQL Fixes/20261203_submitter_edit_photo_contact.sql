-- 2026-11-16: My Submissions edits can change the photo (replace or remove) and the contact
-- name / phone. Everything except the email address is editable. Any edit takes the listing off
-- the site until staff approve it again (status 'pending'); a listing still waiting for email
-- confirmation stays 'pending_verification'. A new photo is stored with the "pending:" prefix,
-- so it also needs staff approval before it shows.
-- Run in the Supabase SQL editor BEFORE uploading the build that needs it.

create or replace function public.update_my_submission(id_input uuid, email_input text, updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
    found_id uuid;
    new_link text := updates->>'link';
    new_image text := btrim(coalesce(updates->>'image_url', ''));
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
    if updates ? 'image_url' and new_image <> '' then
        new_image := regexp_replace(new_image, '^pending:', '');
        if new_image !~* '^(data:image/(jpeg|png|webp);base64,|https://)' then
            return jsonb_build_object('success', false, 'error', 'The photo must be a JPG, PNG or WEBP image');
        end if;
        if length(new_image) > 1500000 then
            return jsonb_build_object('success', false, 'error', 'The photo is too large');
        end if;
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
        contact_name = case when updates ? 'contact_name' then left(nullif(btrim(updates->>'contact_name'), ''), 120) else contact_name end,
        contact_phone = case when updates ? 'contact_phone' then left(nullif(btrim(updates->>'contact_phone'), ''), 40) else contact_phone end,
        image_url = case
            when not (updates ? 'image_url') then image_url
            when new_image = '' then null
            else 'pending:' || new_image end,
        status = case when status = 'pending_verification' then status else 'pending' end
    where id = id_input;

    return jsonb_build_object('success', true);
end;
$function$;

grant execute on function public.update_my_submission(uuid, text, jsonb) to authenticated;
