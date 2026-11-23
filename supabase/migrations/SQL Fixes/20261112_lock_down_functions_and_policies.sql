-- ============================================================================
-- 20261112_lock_down_functions_and_policies.sql
-- Closes the access holes found in the 2026-11-12 security review.
--
-- Generated from the live function definitions captured on 2026-11-12.
-- Every function keeps its exact existing body; the only change is an access
-- check inserted at the top. Runs as one transaction: all of it applies or none.
--
-- Rollback: 20261112_lock_down_ROLLBACK.sql (restores the previous state).
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 0. Helper: who may use staff-only functions.
--    * the newsletter pipeline (uses the service key), or
--    * a signed-in user with an active row in user_profiles (is_admin / is_staff).
-- ---------------------------------------------------------------------------
create or replace function public.wg_is_trusted_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(auth.role(), '') = 'service_role'
        or public.is_admin()
        or public.is_staff();
$$;

-- ---------------------------------------------------------------------------
-- 1. Staff-only functions: previously callable by anyone on the internet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_all_scrapes_admin()
 RETURNS SETOF vendor_scrape_sources
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.vendor_scrape_sources
    ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_subscribers_admin()
 RETURNS SETOF newsletter_subscribers
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.newsletter_subscribers
    ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_vendor_events_admin()
 RETURNS SETOF vendor_events
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.vendor_events
    ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_pipeline_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    total_events int;
    pending_events int;
    approved_events int;
    pending_dining int;
    pending_sales int;
    active_scrapes int;
    pending_scrapes int;
    total_subscribers int;
    active_subscribers int;
    total_directory int;
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO total_events FROM public.vendor_events;
    SELECT count(*) INTO pending_events FROM public.vendor_events WHERE status = 'pending' OR status = 'pending_verification';
    SELECT count(*) INTO approved_events FROM public.vendor_events WHERE status = 'approved';
    
    SELECT count(*) INTO pending_dining FROM public.vendor_events 
    WHERE (status = 'pending' OR status = 'pending_verification') 
      AND (lower(category) LIKE '%dining%' OR lower(category) LIKE '%restaurant%' OR lower(category) LIKE '%food%');

    SELECT count(*) INTO pending_sales FROM public.vendor_events 
    WHERE (status = 'pending' OR status = 'pending_verification') 
      AND (title LIKE '[Sale]%' OR lower(category) LIKE '%sale%');

    SELECT count(*) INTO active_scrapes FROM public.vendor_scrape_sources WHERE status = 'approved';
    SELECT count(*) INTO pending_scrapes FROM public.vendor_scrape_sources WHERE status = 'pending';
    
    SELECT count(*) INTO total_subscribers FROM public.newsletter_subscribers;
    SELECT count(*) INTO active_subscribers FROM public.newsletter_subscribers WHERE status = 'active' OR unsubscribed_at IS NULL;

    SELECT count(*) INTO total_directory FROM public.directory_listings;

    RETURN jsonb_build_object(
        'total_events', total_events,
        'pending_events', pending_events,
        'approved_events', approved_events,
        'pending_dining', pending_dining,
        'pending_sales', pending_sales,
        'active_scrapes', active_scrapes,
        'pending_scrapes', pending_scrapes,
        'total_subscribers', total_subscribers,
        'active_subscribers', active_subscribers,
        'total_directory', total_directory
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_event_status(event_id_input uuid, status_input text, image_url_input text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    UPDATE public.vendor_events
    SET
        status = status_input,
        image_url = CASE 
            WHEN image_url_input IS NOT NULL AND image_url_input != '' THEN image_url_input 
            ELSE image_url 
        END
    WHERE id = event_id_input;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_event(event_id_input uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.vendor_events
    WHERE id = event_id_input;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_newsletter_edition(edition_input text, subject_input text, html_input text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    IF edition_input NOT IN ('reader', 'vendor') THEN
        RETURN false;
    END IF;

    -- Upsert latest edition cache
    INSERT INTO public.newsletter_editions (edition, subject, html_content, updated_at)
    VALUES (edition_input, subject_input, html_input, now())
    ON CONFLICT (edition) DO UPDATE
    SET subject = excluded.subject,
        html_content = excluded.html_content,
        updated_at = now();

    -- Append to chronological archive if not already recorded today
    INSERT INTO public.newsletter_archive (edition, subject, html_content, issue_date, published_at)
    VALUES (edition_input, subject_input, html_input, CURRENT_DATE, now());

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_newsletter_setting(key_input text, value_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    insert into public.newsletter_settings (setting_key, setting_value, updated_at)
    values (trim(key_input), coalesce(value_input, '{}'::jsonb), now())
    on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = now();

    return coalesce(value_input, '{}'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_authorize_claim_and_issue_wallet(target_claim_id uuid, admin_id text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_claim record;
    v_wallet_id uuid;
    v_partner record;
    v_coupons_count int := 0;
    v_is_business boolean;
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    -- Fetch claim
    SELECT * INTO v_claim FROM public.claims WHERE id = target_claim_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim not found';
    END IF;

    v_is_business := (v_claim.user_type = 'New Business');

    -- Update verification status
    UPDATE public.claims 
    SET verification_status = 'authorized',
        verified_at = now(),
        status = CASE WHEN status = 'New' THEN 'Approved' ELSE status END
    WHERE id = target_claim_id;

    -- Upsert wallet (prevent duplicate wallet for same email)
    INSERT INTO public.wallets (
        claim_id,
        owner_email,
        recipient_name,
        recipient_type,
        business_name,
        status
    ) VALUES (
        target_claim_id,
        lower(trim(v_claim.email)),
        trim(v_claim.full_name),
        CASE WHEN v_is_business THEN 'business' ELSE 'resident' END,
        coalesce(v_claim.business_name, v_claim.business_description),
        'active'
    )
    ON CONFLICT (owner_email) DO UPDATE
    SET claim_id = EXCLUDED.claim_id,
        status = 'active',
        activated_at = now()
    RETURNING id INTO v_wallet_id;

    -- Update or ensure user_profiles has capability 'hamper_recipient'
    UPDATE public.user_profiles
    SET capabilities = array_append(array_remove(capabilities, 'hamper_recipient'), 'hamper_recipient')
    WHERE lower(email) = lower(trim(v_claim.email));

    -- Automatically issue coupons from active approved partner deals
    FOR v_partner IN 
        SELECT id, business_name, 
               coalesce(offer_b2c, offer_details) as b2c_deal,
               offer_b2b as b2b_deal,
               coalesce(business_description, '') as offer_description
        FROM public.partners 
        WHERE status = 'Approved' OR status = 'Active' OR status = 'is_example'
    LOOP
        -- 1. Issue B2C Resident Offer:
        -- Loaded into resident hampers, and also available to new businesses
        IF v_partner.b2c_deal IS NOT NULL AND trim(v_partner.b2c_deal) <> '' THEN
            INSERT INTO public.coupons (
                wallet_id,
                partner_id,
                partner_name,
                offer_title,
                offer_description,
                terms,
                target_audience,
                status
            ) VALUES (
                v_wallet_id,
                v_partner.id,
                v_partner.business_name,
                v_partner.b2c_deal,
                v_partner.offer_description,
                'Present your digital redemption code at checkout. Valid for one-time use per household.',
                'Business to Resident',
                'available'
            )
            ON CONFLICT DO NOTHING;
            v_coupons_count := v_coupons_count + 1;
        END IF;

        -- 2. Issue B2B Business Offer:
        -- If recipient is a New Business, issue the B2B coupon!
        IF v_is_business AND v_partner.b2b_deal IS NOT NULL AND trim(v_partner.b2b_deal) <> '' THEN
            INSERT INTO public.coupons (
                wallet_id,
                partner_id,
                partner_name,
                offer_title,
                offer_description,
                terms,
                target_audience,
                status
            ) VALUES (
                v_wallet_id,
                v_partner.id,
                v_partner.business_name,
                v_partner.b2b_deal,
                v_partner.offer_description,
                'Present your digital redemption code at checkout. Valid for one-time commercial / B2B use.',
                'Business to Business',
                'available'
            )
            ON CONFLICT DO NOTHING;
            v_coupons_count := v_coupons_count + 1;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'wallet_id', v_wallet_id,
        'coupons_issued', v_coupons_count,
        'recipient', v_claim.full_name,
        'recipient_type', CASE WHEN v_is_business THEN 'business' ELSE 'resident' END
    );
END;
$function$;


-- ---------------------------------------------------------------------------
-- 2. "My submissions" and lookup functions: previously trusted whatever email
--    was typed into the request. Now the caller must be signed in as that
--    email address (or be staff).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_scrapes(email_input text)
 RETURNS SETOF vendor_scrape_sources
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(email_input, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.vendor_scrape_sources
    WHERE lower(submitter_email) = lower(trim(email_input))
    ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_submissions(email_input text)
 RETURNS SETOF vendor_events
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(email_input, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.vendor_events
    WHERE lower(submitter_email) = lower(trim(email_input))
    ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_submission(id_input uuid, email_input text, updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    found_id uuid;
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(email_input, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO found_id FROM public.vendor_events
    WHERE id = id_input AND lower(submitter_email) = lower(trim(email_input));

    IF found_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Listing not found or email does not match');
    END IF;

    UPDATE public.vendor_events
    SET
        business_name = COALESCE(updates->>'business_name', business_name),
        location = COALESCE(updates->>'location', location),
        title = COALESCE(updates->>'title', title),
        event_date_label = COALESCE(updates->>'event_date_label', event_date_label),
        event_start_date = CASE 
            WHEN updates ? 'event_start_date' AND updates->>'event_start_date' IS NOT NULL AND updates->>'event_start_date' != '' 
            THEN (updates->>'event_start_date')::date 
            ELSE event_start_date 
        END,
        category = COALESCE(updates->>'category', category),
        link = COALESCE(updates->>'link', link),
        summary = COALESCE(updates->>'summary', summary),
        status = 'pending'
    WHERE id = id_input;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_submission(id_input uuid, email_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    found_id uuid;
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(email_input, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO found_id FROM public.vendor_events
    WHERE id = id_input AND lower(submitter_email) = lower(trim(email_input));

    IF found_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Listing not found or email does not match');
    END IF;

    DELETE FROM public.vendor_events
    WHERE id = id_input;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_scrape(id_input uuid, email_input text, updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    found_id uuid;
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(email_input, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO found_id FROM public.vendor_scrape_sources
    WHERE id = id_input AND lower(submitter_email) = lower(trim(email_input));

    IF found_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Source not found or email does not match');
    END IF;

    UPDATE public.vendor_scrape_sources
    SET
        business_name = COALESCE(updates->>'business_name', business_name),
        default_location = COALESCE(updates->>'default_location', default_location),
        scrape_url = COALESCE(updates->>'scrape_url', scrape_url),
        notes = COALESCE(updates->>'notes', notes),
        status = 'pending'
    WHERE id = id_input;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_scrape(id_input uuid, email_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    found_id uuid;
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(email_input, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO found_id FROM public.vendor_scrape_sources
    WHERE id = id_input AND lower(submitter_email) = lower(trim(email_input));

    IF found_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Source not found or email does not match');
    END IF;

    DELETE FROM public.vendor_scrape_sources
    WHERE id = id_input;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_claim_status(lookup_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_claim record;
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(lookup_email, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_claim 
    FROM public.claims 
    WHERE lower(email) = lower(trim(lookup_email))
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('found', false);
    END IF;

    RETURN json_build_object(
        'found', true,
        'id', v_claim.id,
        'user_type', v_claim.user_type,
        'email', v_claim.email,
        'full_name', v_claim.full_name,
        'first_name', v_claim.first_name,
        'last_name', v_claim.last_name,
        'business_name', v_claim.business_name,
        'address', v_claim.address,
        'join_newsletter', v_claim.join_newsletter,
        'email_confirmed', coalesce(v_claim.email_confirmed, true),
        'verification_status', coalesce(v_claim.verification_status, 'pending_verification'),
        'created_at', v_claim.created_at
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_partner_status(lookup_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_partner record;
BEGIN
    -- Access check added 2026-11-12: the signed-in owner of this email, or staff.
    IF NOT (
        public.wg_is_trusted_caller()
        OR (
            coalesce(auth.jwt() ->> 'email', '') <> ''
            AND lower(auth.jwt() ->> 'email') = lower(trim(coalesce(lookup_email, '')))
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_partner 
    FROM public.partners 
    WHERE lower(contact_email) = lower(trim(lookup_email))
       OR lower(business_name) = lower(trim(lookup_email))
    ORDER BY created_at DESC 
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('found', false);
    END IF;

    RETURN json_build_object(
        'found', true,
        'id', v_partner.id,
        'business_name', v_partner.business_name,
        'contact_name', coalesce(v_partner.contact_name, ''),
        'contact_email', coalesce(v_partner.contact_email, ''),
        'contact_phone', coalesce(v_partner.contact_phone, ''),
        'location', coalesce(v_partner.location, ''),
        'street_address', coalesce(v_partner.street_address, ''),
        'city', coalesce(v_partner.city, 'Georgina'),
        'postal_code', coalesce(v_partner.postal_code, ''),
        'tier', coalesce(v_partner.tier, 'Community Partner'),
        'category', coalesce(v_partner.category, 'Local Business'),
        'status', coalesce(v_partner.status, 'Submitted'),
        'offer_details', coalesce(v_partner.offer_details, ''),
        'offer_b2c', coalesce(v_partner.offer_b2c, v_partner.offer_details, ''),
        'offer_b2b', coalesce(v_partner.offer_b2b, ''),
        'business_description', coalesce(v_partner.business_description, ''),
        'target_audience', coalesce(v_partner.target_audience, 'Both (B2C & B2B)'),
        'join_newsletter', coalesce(v_partner.join_newsletter, false),
        'created_at', v_partner.created_at
    );
END;
$function$;


-- ---------------------------------------------------------------------------
-- 3. Table rules: remove the rules that let anyone (or any signed-up account)
--    read or change data, and replace them with staff-only rules.
--    Public READ rules that the site needs are left untouched:
--    approved events, approved directory listings, approved partners,
--    published press articles, the newsletter archive and latest editions.
-- ---------------------------------------------------------------------------

drop policy if exists "Allow public select on claims" on public.claims;
drop policy if exists "Allow public select" on public.partners;
drop policy if exists "Coupons viewable by all" on public.coupons;
drop policy if exists "Wallets are viewable by owner or admin" on public.wallets;
drop policy if exists "Tokens viewable by all" on public.presentation_tokens;
drop policy if exists "Redemptions viewable by all" on public.redemptions;
drop policy if exists "Full access to directory listings" on public.directory_listings;
drop policy if exists "Authenticated users can manage newsletter archive" on public.newsletter_archive;
drop policy if exists "Authenticated users can manage press articles" on public.press_articles;
drop policy if exists "Allow crawler automated sync to vendor_events" on public.vendor_events;

drop policy if exists "Staff can manage coupons" on public.coupons;
create policy "Staff can manage coupons"
    on public.coupons for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

drop policy if exists "Staff can manage wallets" on public.wallets;
create policy "Staff can manage wallets"
    on public.wallets for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

drop policy if exists "Staff can manage presentation tokens" on public.presentation_tokens;
create policy "Staff can manage presentation tokens"
    on public.presentation_tokens for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

drop policy if exists "Staff can manage redemptions" on public.redemptions;
create policy "Staff can manage redemptions"
    on public.redemptions for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

drop policy if exists "Staff can manage directory listings" on public.directory_listings;
create policy "Staff can manage directory listings"
    on public.directory_listings for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

drop policy if exists "Staff can manage newsletter archive" on public.newsletter_archive;
create policy "Staff can manage newsletter archive"
    on public.newsletter_archive for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

drop policy if exists "Staff can manage press articles" on public.press_articles;
create policy "Staff can manage press articles"
    on public.press_articles for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

-- Staff adding events from the Approvals page (replaces the open "crawler" rule).
-- The pipeline itself uses the service key, which is not subject to these rules.
drop policy if exists "Staff can insert events" on public.vendor_events;
create policy "Staff can insert events"
    on public.vendor_events for insert
    with check (public.is_admin() or public.is_staff());

commit;

-- ---------------------------------------------------------------------------
-- After running: this should list every function below with anon_blocked = true
-- (run it separately; it changes nothing).
-- ---------------------------------------------------------------------------
-- select p.proname, p.prosrc ~ 'wg_is_trusted_caller' as anon_blocked
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in ('get_all_scrapes_admin', 'get_all_subscribers_admin', 'get_all_vendor_events_admin', 'get_admin_pipeline_metrics', 'admin_set_event_status', 'admin_delete_event', 'save_newsletter_edition', 'save_newsletter_setting', 'admin_authorize_claim_and_issue_wallet', 'get_my_scrapes', 'get_my_submissions', 'update_my_submission', 'delete_my_submission', 'update_my_scrape', 'delete_my_scrape', 'get_claim_status', 'get_partner_status')
-- order by 1;
