--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.12

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public; (already exists in Supabase)


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

-- COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: admin_authorize_claim_and_issue_wallet(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_authorize_claim_and_issue_wallet(target_claim_id uuid, admin_id text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: admin_confirm_new_user(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_confirm_new_user(target_user_id uuid, target_email text, target_name text, target_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
    BEGIN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can create and confirm staff accounts';
      END IF;

      UPDATE auth.users
      SET email_confirmed_at = COALESCE(email_confirmed_at, now())
      WHERE id = target_user_id;

      INSERT INTO public.user_profiles (id, email, full_name, role, active)
      VALUES (target_user_id, target_email, target_name, target_role, true)
      ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          active = true;
    END;
    $$;


--
-- Name: admin_delete_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_event(event_id_input uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.vendor_events
    WHERE id = event_id_input;

    RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: admin_delete_scrape_source(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_scrape_source(id_input uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    changed integer;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    delete from public.vendor_scrape_sources
    where id = id_input;

    get diagnostics changed = row_count;
    return jsonb_build_object('success', changed > 0, 'rows', changed);
end;
$$;


--
-- Name: admin_set_event_status(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_event_status(event_id_input uuid, status_input text, image_url_input text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: admin_update_scrape_source(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_scrape_source(id_input uuid, updates_input jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    changed integer;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    update public.vendor_scrape_sources
    set
        business_name    = case when updates_input ? 'business_name'    then updates_input->>'business_name'    else business_name end,
        submitter_email  = case when updates_input ? 'submitter_email'  then updates_input->>'submitter_email'  else submitter_email end,
        scrape_url       = case when updates_input ? 'scrape_url'       then updates_input->>'scrape_url'       else scrape_url end,
        default_location = case when updates_input ? 'default_location' then updates_input->>'default_location' else default_location end,
        notes            = case when updates_input ? 'notes'            then updates_input->>'notes'            else notes end,
        status           = case when updates_input ? 'status'           then updates_input->>'status'           else status end
    where id = id_input;

    get diagnostics changed = row_count;
    return jsonb_build_object('success', changed > 0, 'rows', changed);
end;
$$;


--
-- Name: confirm_claim_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_claim_email(target_token text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_claim record;
BEGIN
    SELECT * INTO v_claim FROM public.claims WHERE confirmation_token = target_token;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired confirmation token');
    END IF;

    UPDATE public.claims 
    SET email_confirmed = true,
        confirmed_at = coalesce(confirmed_at, now())
    WHERE id = v_claim.id;

    RETURN json_build_object(
        'success', true,
        'claim_id', v_claim.id,
        'user_type', v_claim.user_type,
        'email', v_claim.email,
        'full_name', v_claim.full_name,
        'join_newsletter', v_claim.join_newsletter
    );
END;
$$;


--
-- Name: confirm_my_submissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_my_submissions() RETURNS uuid[]
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ select '{}'::uuid[] $$;


--
-- Name: confirm_my_submissions(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_my_submissions(ids_input uuid[]) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
          and id = any(coalesce(ids_input, '{}'::uuid[]))
        returning id
    )
    select coalesce(array_agg(id), '{}') into ids from done;
    return ids;
end;
$$;


--
-- Name: confirm_newsletter_subscriber(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_newsletter_subscriber(token_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
    sub_record public.newsletter_subscribers%rowtype;
begin
    update public.newsletter_subscribers
    set status = 'active',
        confirmed_at = coalesce(confirmed_at, now())
    where unsubscribe_token::text = trim(token_input)
    returning * into sub_record;

    if sub_record.id is null then
        return jsonb_build_object('confirmed', false);
    end if;

    return jsonb_build_object(
        'confirmed', true,
        'email', sub_record.email,
        'first_name', sub_record.first_name,
        'audience_type', sub_record.audience_type,
        'token', sub_record.unsubscribe_token::text
    );
end;
$$;


--
-- Name: delete_my_scrape(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_scrape(id_input uuid, email_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: delete_my_submission(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_submission(id_input uuid, email_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: delete_url_blacklist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_url_blacklist(id_input uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    if not (public.is_admin() or public.is_staff()) then
        raise exception 'Only admins or staff can manage the URL blacklist';
    end if;

    delete from public.scraped_url_blacklist
    where id = id_input;
    return found;
end;
$$;


--
-- Name: enforce_partner_update_security(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_partner_update_security() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
    BEGIN
      -- If user is not an admin, they can only change assigned_to, assigned_name, assigned_at
      IF NOT public.is_admin() THEN
        NEW.status := OLD.status;
        NEW.business_name := OLD.business_name;
        NEW.offer_details := OLD.offer_details;
        NEW.logo_url := OLD.logo_url;
        NEW.category := OLD.category;
        NEW.location := OLD.location;
        NEW.color := OLD.color;
        NEW.tier := OLD.tier;
        NEW.target_audience := OLD.target_audience;
      END IF;
      RETURN NEW;
    END;
    $$;


--
-- Name: generate_presentation_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_presentation_token(target_coupon_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_coupon record;
    v_token_code text;
    v_fallback_code text;
    v_expires_at timestamptz;
BEGIN
    SELECT * INTO v_coupon FROM public.coupons WHERE id = target_coupon_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Coupon not found';
    END IF;

    IF v_coupon.status != 'available' THEN
        RAISE EXCEPTION 'This offer is no longer available (status: %)', v_coupon.status;
    END IF;

    -- Generate 6-character code without hyphen (e.g. WG2345)
    v_fallback_code := 'WG' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    v_token_code := 'WGTKN-' || gen_random_uuid()::text;
    v_expires_at := now() + interval '3 minutes';

    -- Invalidate any previous active tokens for this coupon
    DELETE FROM public.presentation_tokens WHERE coupon_id = target_coupon_id;

    INSERT INTO public.presentation_tokens (
        coupon_id,
        wallet_id,
        token_code,
        fallback_code,
        expires_at
    ) VALUES (
        target_coupon_id,
        v_coupon.wallet_id,
        v_token_code,
        v_fallback_code,
        v_expires_at
    );

    RETURN json_build_object(
        'success', true,
        'fallback_code', v_fallback_code,
        'token_code', v_token_code,
        'expires_at', v_expires_at
    );
END;
$$;


--
-- Name: get_admin_pipeline_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_pipeline_metrics() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: vendor_scrape_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_scrape_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_id uuid,
    business_name text NOT NULL,
    submitter_email text NOT NULL,
    scrape_url text NOT NULL,
    default_location text DEFAULT 'East Gwillimbury, ON'::text NOT NULL,
    notes text DEFAULT ''::text,
    status text DEFAULT 'pending'::text NOT NULL,
    last_scraped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendor_scrape_sources_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: get_all_scrapes_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_scrapes_admin() RETURNS SETOF public.vendor_scrape_sources
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.vendor_scrape_sources
    ORDER BY created_at DESC;
END;
$$;


--
-- Name: newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    first_name text DEFAULT ''::text,
    community_area text DEFAULT 'All East Gwillimbury'::text,
    audience_type text DEFAULT 'reader'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    unsubscribe_token uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unsubscribed_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    wants_thursday boolean DEFAULT true NOT NULL,
    wants_monday boolean DEFAULT false NOT NULL,
    CONSTRAINT newsletter_subscribers_audience_type_check CHECK ((audience_type = ANY (ARRAY['reader'::text, 'vendor'::text, 'both'::text]))),
    CONSTRAINT newsletter_subscribers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'unsubscribed'::text])))
);


--
-- Name: get_all_subscribers_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_subscribers_admin() RETURNS SETOF public.newsletter_subscribers
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.newsletter_subscribers
    ORDER BY created_at DESC;
END;
$$;


--
-- Name: vendor_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_id uuid,
    business_name text NOT NULL,
    submitter_email text NOT NULL,
    title text NOT NULL,
    event_date_label text NOT NULL,
    event_start_date date,
    expires_after date,
    location text DEFAULT 'East Gwillimbury, ON'::text NOT NULL,
    link text DEFAULT 'https://welcomeeg.ca'::text NOT NULL,
    summary text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text,
    category text DEFAULT 'Community'::text,
    community text DEFAULT 'East Gwillimbury'::text,
    price_text text DEFAULT 'Free'::text,
    image_url text,
    latitude double precision,
    longitude double precision,
    is_featured boolean DEFAULT false,
    view_count integer DEFAULT 0,
    save_count integer DEFAULT 0,
    contact_name text,
    contact_phone text,
    date_type text,
    recurrence_rule text,
    verify_token text,
    verify_token_expires_at timestamp with time zone,
    verify_sent_at timestamp with time zone,
    verified_at timestamp with time zone,
    hamper_contact boolean DEFAULT false NOT NULL,
    old_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    service_options text[],
    sale_category text,
    data_confidence smallint,
    confidence_notes text,
    is_suspected_duplicate boolean DEFAULT false NOT NULL,
    duplicate_match_id text,
    duplicate_score smallint,
    duplicate_notes text,
    is_spotlight boolean DEFAULT false NOT NULL,
    CONSTRAINT vendor_events_data_confidence_check CHECK (((data_confidence IS NULL) OR ((data_confidence >= 0) AND (data_confidence <= 100)))),
    CONSTRAINT vendor_events_duplicate_score_check CHECK (((duplicate_score IS NULL) OR ((duplicate_score >= 0) AND (duplicate_score <= 100))))
);


--
-- Name: get_all_vendor_events_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_vendor_events_admin() RETURNS SETOF public.vendor_events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Access check added 2026-11-12: staff, admins, or the server-side pipeline only.
    IF NOT public.wg_is_trusted_caller() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT * FROM public.vendor_events
    ORDER BY created_at DESC;
END;
$$;


--
-- Name: get_claim_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_claim_status(lookup_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_my_scrapes(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_scrapes(email_input text) RETURNS SETOF public.vendor_scrape_sources
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: get_my_submissions(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_submissions(email_input text) RETURNS SETOF public.vendor_events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: get_partner_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_partner_status(lookup_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
        'city', coalesce(v_partner.city, 'East Gwillimbury'),
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
$$;


--
-- Name: hamper_admin_clear_proof(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_clear_proof(id_input uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
        raise exception 'Only an admin can delete proof files.' using errcode = '42501';
    end if;
    update public.hamper_applications
       set proof_path = null, proof_deleted_at = now(), updated_at = now()
     where id = id_input and proof_path is not null;
    get diagnostics v_rows = row_count;
    return jsonb_build_object('success', v_rows = 1, 'rows', v_rows);
end;
$$;


--
-- Name: hamper_admin_delete_application(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_delete_application(id_input uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_path text;
begin
    if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
        raise exception 'Only an admin can delete applications.' using errcode = '42501';
    end if;
    delete from public.hamper_applications where id = id_input returning proof_path into v_path;
    return jsonb_build_object('success', v_path is not null, 'proof_path', v_path);
end;
$$;


--
-- Name: hamper_admin_issue_coupons(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_issue_coupons(id_input uuid, expires_input date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_status text;
    o record;
    v_count int := 0;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    select status into v_status from public.hamper_applications where id = id_input for update;
    if v_status is distinct from 'approved' then
        raise exception 'Coupons can only be issued to approved applications.' using errcode = '22023';
    end if;
    for o in
        select * from public.hamper_offers
         where active and (valid_until is null or valid_until >= public.hamper_today())
           and not exists (select 1 from public.hamper_coupons c
                            where c.application_id = id_input and c.offer_id = hamper_offers.id and c.status <> 'void')
    loop
        -- A voided coupon (e.g. from an earlier decline) is replaced by a fresh one.
        delete from public.hamper_coupons where application_id = id_input and offer_id = o.id and status = 'void';
        insert into public.hamper_coupons (application_id, offer_id, code, expires_at)
        values (id_input, o.id, public.hamper_new_code(),
                -- Earlier of the staff-chosen date and the offer's own end date (LEAST ignores nulls);
                -- valid through the end of that day, Toronto time. No date = no expiry.
                ((least(expires_input, o.valid_until) + 1)::timestamp at time zone 'America/Toronto'));
        v_count := v_count + 1;
    end loop;
    update public.hamper_applications set coupons_issued_at = coalesce(coupons_issued_at, now()), updated_at = now()
     where id = id_input and v_count > 0;
    return jsonb_build_object('success', true, 'issued', v_count);
end;
$$;


--
-- Name: hamper_admin_list_applications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_list_applications() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(to_jsonb(a) - 'verify_token' - 'verify_token_expires_at'
                         || jsonb_build_object(
                              'coupon_count', (select count(*) from public.hamper_coupons c where c.application_id = a.id and c.status <> 'void'),
                              'redeemed_count', (select count(*) from public.hamper_coupons c where c.application_id = a.id and c.status = 'redeemed'))
                         order by a.created_at desc)
          from public.hamper_applications a), '[]'::jsonb);
end;
$$;


--
-- Name: hamper_admin_list_coupons(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_list_coupons(application_input uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
                   'id', c.id, 'code', c.code, 'status', c.status, 'issued_at', c.issued_at,
                   'expires_at', c.expires_at, 'redeemed_at', c.redeemed_at, 'redeemed_by', c.redeemed_by,
                   'merchant_name', o.merchant_name, 'offer_title', o.offer_title,
                   'application_id', a.id, 'holder', a.first_name || ' ' || a.last_name, 'holder_email', a.email)
               order by c.issued_at desc)
          from public.hamper_coupons c
          join public.hamper_offers o on o.id = c.offer_id
          join public.hamper_applications a on a.id = c.application_id
         where application_input is null or c.application_id = application_input), '[]'::jsonb);
end;
$$;


--
-- Name: hamper_admin_list_offers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_list_offers() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(to_jsonb(o) || jsonb_build_object(
                   'issued_count', (select count(*) from public.hamper_coupons c where c.offer_id = o.id and c.status <> 'void'),
                   'redeemed_count', (select count(*) from public.hamper_coupons c where c.offer_id = o.id and c.status = 'redeemed'))
               order by o.active desc, o.merchant_name)
          from public.hamper_offers o), '[]'::jsonb);
end;
$$;


--
-- Name: hamper_admin_save_note(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_save_note(id_input uuid, note_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    update public.hamper_applications set staff_note = left(note_input, 2000), updated_at = now() where id = id_input;
    get diagnostics v_rows = row_count;
    return jsonb_build_object('success', v_rows = 1, 'rows', v_rows);
end;
$$;


--
-- Name: hamper_admin_save_offer(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_save_offer(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
    v_id uuid := nullif(p ->> 'id', '')::uuid;
    v_name text := btrim(coalesce(p ->> 'merchant_name', ''));
    v_email text := lower(btrim(coalesce(p ->> 'merchant_email', '')));
    v_title text := btrim(coalesce(p ->> 'offer_title', ''));
    v_until date := nullif(p ->> 'valid_until', '')::date;
    v_site text := nullif(btrim(coalesce(p ->> 'merchant_website', '')), '');
    v_rows int;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if length(v_name) not between 1 and 120 or length(v_title) not between 1 and 160 then
        raise exception 'Merchant name and offer title are required.' using errcode = '22023';
    end if;
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        raise exception 'A valid merchant email is required (the merchant signs in with it to redeem).' using errcode = '22023';
    end if;
    if v_site is not null and v_site ~* '^www\.' then
        v_site := 'https://' || v_site;
    end if;
    if v_site is not null and (v_site !~* '^https?://[^/@\s]+' or v_site ~ '\s' or length(v_site) > 500) then
        raise exception 'Merchant website must be a web address starting with https://' using errcode = '22023';
    end if;
    if v_id is null then
        insert into public.hamper_offers (merchant_name, merchant_email, offer_title, offer_details, terms, community, active, valid_until, merchant_website)
        values (v_name, v_email, v_title, left(p ->> 'offer_details', 1000), left(p ->> 'terms', 1000),
                nullif(btrim(coalesce(p ->> 'community', '')), ''), coalesce((p ->> 'active')::boolean, true), v_until, v_site)
        returning id into v_id;
        v_rows := 1;
    else
        update public.hamper_offers
           set merchant_name = v_name, merchant_email = v_email, offer_title = v_title,
               offer_details = left(p ->> 'offer_details', 1000), terms = left(p ->> 'terms', 1000),
               community = nullif(btrim(coalesce(p ->> 'community', '')), ''),
               active = coalesce((p ->> 'active')::boolean, active), valid_until = v_until,
               merchant_website = v_site
         where id = v_id;
        get diagnostics v_rows = row_count;
    end if;
    return jsonb_build_object('success', v_rows = 1, 'id', v_id);
end;
$_$;


--
-- Name: hamper_admin_set_status(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_set_status(id_input uuid, status_input text, note_input text DEFAULT NULL::text, reason_input text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if status_input not in ('review', 'approved', 'declined') then
        raise exception 'Unknown status' using errcode = '22023';
    end if;
    update public.hamper_applications
       set status = status_input,
           staff_note = coalesce(note_input, staff_note),
           decline_reason = case when status_input = 'declined' then reason_input else null end,
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           updated_at = now()
     where id = id_input and status <> 'unverified';
    get diagnostics v_rows = row_count;
    -- A declined household can no longer use coupons it was already given.
    if v_rows = 1 and status_input = 'declined' then
        update public.hamper_coupons set status = 'void' where application_id = id_input and status = 'available';
    end if;
    return jsonb_build_object('success', v_rows = 1, 'rows', v_rows);
end;
$$;


--
-- Name: hamper_admin_void_coupon(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_admin_void_coupon(id_input uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_rows int;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    update public.hamper_coupons set status = 'void' where id = id_input and status = 'available';
    get diagnostics v_rows = row_count;
    return jsonb_build_object('success', v_rows = 1, 'rows', v_rows);
end;
$$;


--
-- Name: hamper_apply(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_apply(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
    v_first text := btrim(coalesce(p ->> 'first_name', ''));
    v_last text := btrim(coalesce(p ->> 'last_name', ''));
    v_email text := lower(btrim(coalesce(p ->> 'email', '')));
    v_phone text := btrim(coalesce(p ->> 'phone', ''));
    v_street text := btrim(coalesce(p ->> 'street_address', ''));
    v_unit text := nullif(btrim(coalesce(p ->> 'unit', '')), '');
    v_comm text := btrim(coalesce(p ->> 'community', ''));
    v_postal text := upper(regexp_replace(coalesce(p ->> 'postal_code', ''), '\s', '', 'g'));
    v_move date;
    v_size int;
    v_interests text := nullif(btrim(coalesce(p ->> 'interests', '')), '');
    v_news boolean := coalesce((p ->> 'newsletter_opt_in')::boolean, false);
    v_ptype text := btrim(coalesce(p ->> 'proof_type', ''));
    v_ppath text := nullif(btrim(coalesce(p ->> 'proof_path', '')), '');
    v_today date := public.hamper_today();
    v_id uuid;
    v_key text;
begin
    if length(v_first) not between 1 and 80 or length(v_last) not between 1 and 80 then
        raise exception 'Please enter your first and last name.' using errcode = '22023';
    end if;
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 254 then
        raise exception 'Please enter a valid email address.' using errcode = '22023';
    end if;
    -- Exactly 10 digits (a leading 1 country code is allowed and dropped).
    if length(regexp_replace(regexp_replace(v_phone, '\D', '', 'g'), '^1', '')) <> 10 then
        raise exception 'Please enter a 10-digit phone number, like (905) 555-0123.' using errcode = '22023';
    end if;
    v_phone := public.hamper_format_phone(v_phone);
    if length(v_street) not between 3 and 160 or length(coalesce(v_unit, '')) > 40 then
        raise exception 'Please enter your street address.' using errcode = '22023';
    end if;
    if v_comm not in ('Holland Landing', 'Mount Albert', 'Queensville', 'Sharon', 'River Drive Park', 'Holt',
                      'Franklin', 'Brown Hill', 'Ravenshoe', 'Other (East Gwillimbury)') then
        raise exception 'Please choose your East Gwillimbury community.' using errcode = '22023';
    end if;
    if v_postal !~ '^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$' then
        raise exception 'Please enter a valid postal code.' using errcode = '22023';
    end if;
    v_postal := substr(v_postal, 1, 3) || ' ' || substr(v_postal, 4, 3);

    begin
        v_move := (p ->> 'move_in_date')::date;
    exception when others then
        v_move := null;
    end;
    if v_move is null then
        raise exception 'Please enter your move-in date.' using errcode = '22023';
    end if;
    if v_move > v_today then
        raise exception 'Your move-in date cannot be in the future.' using errcode = '22023';
    end if;
    if v_move < (v_today - interval '3 months')::date then
        raise exception 'The Welcome Hamper is for residents who moved to East Gwillimbury in the last 3 months.' using errcode = '22023';
    end if;

    begin
        v_size := nullif(p ->> 'household_size', '')::int;
    exception when others then
        v_size := null;
    end;
    if v_size is not null and v_size not between 1 and 15 then
        raise exception 'Household size must be between 1 and 15.' using errcode = '22023';
    end if;
    if length(coalesce(v_interests, '')) > 600 then
        raise exception 'Please shorten your interests (600 characters at most).' using errcode = '22023';
    end if;
    if v_ptype not in ('utility_bill', 'lease', 'other', 'phone_call') then
        raise exception 'Please choose how we should verify your address.' using errcode = '22023';
    end if;

    if v_ptype = 'phone_call' then
        -- Staff will phone the applicant; no document is attached.
        v_ppath := null;
    -- The proof file must be a fresh upload under apply/ that no other application uses.
    elsif v_ppath is null
       or v_ppath !~ '^apply/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
       or not exists (select 1 from storage.objects o
                      where o.bucket_id = 'hamper-proofs' and o.name = v_ppath
                        and o.created_at > now() - interval '2 hours')
       or exists (select 1 from public.hamper_applications a where a.proof_path = v_ppath) then
        raise exception 'Your proof of residence upload was not found. Please attach it again.' using errcode = '22023';
    end if;

    v_key := lower(regexp_replace(v_street || '|' || coalesce(v_unit, '') || '|' || v_postal, '\s', '', 'g'));

    -- An unconfirmed application from a DIFFERENT email for this address is only replaced
    -- once its 48-hour confirmation window has passed, so a stranger can't wipe a household's
    -- fresh application.
    if exists (select 1 from public.hamper_applications
                where status = 'unverified' and address_key = v_key and lower(email) <> v_email
                  and created_at > now() - interval '48 hours') then
        raise exception 'An application for this address is waiting for email confirmation. Please check your email, or try again in 48 hours.' using errcode = '23505';
    end if;
    delete from public.hamper_applications
     where status = 'unverified' and address_key = v_key and lower(email) <> v_email;

    -- The same email applying again while unconfirmed updates its existing application, which
    -- keeps the confirmation-email counters (send-email limits how many it sends per application).
    select id into v_id from public.hamper_applications
     where status = 'unverified' and lower(email) = v_email
     limit 1;

    if exists (select 1 from public.hamper_applications
                where status not in ('declined', 'unverified') and (lower(email) = v_email or address_key = v_key)) then
        raise exception 'An application already exists for this email address or household.' using errcode = '23505';
    end if;

    if v_id is not null then
        update public.hamper_applications
           set first_name = v_first, last_name = v_last, phone = v_phone, street_address = v_street,
               unit = v_unit, community = v_comm, postal_code = v_postal, move_in_date = v_move,
               household_size = v_size, interests = v_interests, newsletter_opt_in = v_news,
               proof_type = v_ptype, proof_path = v_ppath, proof_deleted_at = null, updated_at = now()
         where id = v_id;
        return jsonb_build_object('id', v_id);
    end if;

    insert into public.hamper_applications (
        first_name, last_name, email, phone, street_address, unit, community, postal_code,
        move_in_date, household_size, interests, newsletter_opt_in, proof_type, proof_path)
    values (
        v_first, v_last, v_email, v_phone, v_street, v_unit, v_comm, v_postal,
        v_move, v_size, v_interests, v_news, v_ptype, v_ppath)
    returning id into v_id;

    return jsonb_build_object('id', v_id);
end;
$_$;


--
-- Name: hamper_caller_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_caller_email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
    select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;


--
-- Name: hamper_format_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_format_phone(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    select case
        when length(d) = 10 then '(' || substr(d, 1, 3) || ') ' || substr(d, 4, 3) || '-' || substr(d, 7, 4)
        when length(d) = 11 and left(d, 1) = '1' then '(' || substr(d, 2, 3) || ') ' || substr(d, 5, 3) || '-' || substr(d, 8, 4)
        else btrim(coalesce(p, ''))
    end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;


--
-- Name: hamper_merchant_check(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_merchant_check(code_input text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_code text := upper(regexp_replace(coalesce(code_input, ''), '[\s-]', '', 'g'));
    r record;
begin
    if v_code !~ '^WG[A-HJ-NP-Z2-9]{6}$' then
        return jsonb_build_object('found', false);
    end if;

    select c.code, c.status, c.expires_at, c.redeemed_at, o.merchant_name, o.merchant_email,
           o.offer_title, o.offer_details, o.terms, o.valid_until,
           a.first_name, left(a.last_name, 1) as last_initial
      into r
      from public.hamper_coupons c
      join public.hamper_offers o on o.id = c.offer_id
      join public.hamper_applications a on a.id = c.application_id
     where c.code = v_code;

    if not found then
        return jsonb_build_object('found', false);
    end if;

    return jsonb_build_object(
        'found', true,
        'code', r.code,
        'status', r.status,
        'expired', ((r.expires_at is not null and r.expires_at < now())
                    or (r.valid_until is not null and r.valid_until < public.hamper_today())),
        'expires_at', r.expires_at,
        'redeemed_at', r.redeemed_at,
        'merchant_name', r.merchant_name,
        'offer_title', r.offer_title,
        'offer_details', r.offer_details,
        'terms', r.terms,
        'holder', r.first_name || ' ' || r.last_initial || '.'
    );
end;
$_$;


--
-- Name: hamper_merchant_redeem(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_merchant_redeem(code_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_email text := coalesce(nullif(public.hamper_caller_email(), ''), 'merchant-terminal');
    v_code text := upper(regexp_replace(coalesce(code_input, ''), '[\s-]', '', 'g'));
    r record;
    v_rows int;
    v_at timestamptz;
begin
    if v_code !~ '^WG[A-HJ-NP-Z2-9]{6}$' then
        raise exception 'Please enter a valid 8-character coupon code starting with WG.' using errcode = '22023';
    end if;

    select c.id, c.status, c.expires_at, c.redeemed_at, o.merchant_email, o.valid_until
      into r
      from public.hamper_coupons c
      join public.hamper_offers o on o.id = c.offer_id
     where c.code = v_code
     for update of c;

    if not found then
        raise exception 'This coupon code was not found. Please check the code and try again.' using errcode = '22023';
    end if;
    if r.status = 'redeemed' then
        raise exception 'This coupon was already redeemed on %.',
            to_char(r.redeemed_at at time zone 'America/Toronto', 'Mon DD, YYYY HH24:MI') using errcode = '22023';
    end if;
    if r.status <> 'available' then
        raise exception 'This coupon has been cancelled.' using errcode = '22023';
    end if;
    if (r.expires_at is not null and r.expires_at < now())
       or (r.valid_until is not null and r.valid_until < public.hamper_today()) then
        raise exception 'This coupon has expired.' using errcode = '22023';
    end if;

    update public.hamper_coupons
       set status = 'redeemed',
           redeemed_at = now(),
           redeemed_by = v_email
     where id = r.id and status = 'available'
    returning redeemed_at into v_at;

    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
        raise exception 'This coupon was already redeemed.' using errcode = '22023';
    end if;

    return jsonb_build_object('success', true, 'redeemed_at', v_at);
end;
$_$;


--
-- Name: hamper_my_wallet(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_my_wallet() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_email text := public.hamper_caller_email();
    v_app record;
begin
    if v_email = '' then
        raise exception 'Please sign in first.' using errcode = '42501';
    end if;
    select id, first_name, status, created_at, coupons_issued_at
      into v_app
      from public.hamper_applications
     where lower(email) = v_email and status <> 'declined'
     order by created_at desc limit 1;
    if not found then
        select id, first_name, status, created_at, coupons_issued_at
          into v_app
          from public.hamper_applications
         where lower(email) = v_email
         order by created_at desc limit 1;
        if not found then
            return jsonb_build_object('application', null, 'coupons', '[]'::jsonb);
        end if;
    end if;
    return jsonb_build_object(
        'application', jsonb_build_object(
            'first_name', v_app.first_name, 'status', v_app.status,
            'created_at', v_app.created_at, 'coupons_issued_at', v_app.coupons_issued_at),
        'coupons', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'code', c.code, 'status', c.status, 'expires_at', c.expires_at,
                       'redeemed_at', c.redeemed_at, 'merchant_name', o.merchant_name,
                       'offer_title', o.offer_title, 'offer_details', o.offer_details,
                       'terms', o.terms, 'community', o.community,
                       'offer_id', o.id, 'has_website', (coalesce(o.merchant_website, '') <> ''))
                   order by o.merchant_name)
              from public.hamper_coupons c join public.hamper_offers o on o.id = c.offer_id
             where c.application_id = v_app.id and c.status <> 'void'), '[]'::jsonb));
end;
$$;


--
-- Name: hamper_new_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_new_code() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions'
    AS $$
declare
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    b bytea;
    c text;
    i int;
begin
    loop
        b := extensions.gen_random_bytes(6);
        c := 'WG';
        for i in 0..5 loop
            c := c || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
        end loop;
        exit when not exists (select 1 from public.hamper_coupons where code = c);
    end loop;
    return c;
end;
$$;


--
-- Name: hamper_today(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hamper_today() RETURNS date
    LANGUAGE sql STABLE
    AS $$
    select (now() at time zone 'America/Toronto')::date;
$$;


--
-- Name: increment_listing_impression(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_listing_impression(target_table text, target_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
    if target_table = 'vendor_events' then
        update public.vendor_events
        set view_count = coalesce(view_count, 0) + 1
        where id = target_id;
    elsif target_table = 'partners' then
        update public.partners
        set view_count = coalesce(view_count, 0) + 1
        where id = target_id;
    end if;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    select exists (
        select 1
        from public.user_profiles
        where id = auth.uid()
          and role = 'admin'
          and active = true
    );
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND active = true
      );
    $$;


--
-- Name: redeem_coupon_code(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_coupon_code(code_input text, merchant_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_clean_code text := upper(trim(code_input));
    v_token record;
    v_coupon record;
    v_receipt text;
BEGIN
    -- Locate active presentation token by fallback code or full token code
    SELECT * INTO v_token 
    FROM public.presentation_tokens 
    WHERE (fallback_code = v_clean_code OR token_code = trim(code_input))
      AND expires_at > now()
      AND consumed_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Code is expired, invalid, or has already been redeemed.'
        );
    END IF;

    -- Check coupon state
    SELECT * INTO v_coupon FROM public.coupons WHERE id = v_token.coupon_id;
    IF v_coupon.status != 'available' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This offer has already been redeemed (' || v_coupon.status || ').'
        );
    END IF;

    -- Atomic status update
    UPDATE public.coupons 
    SET status = 'redeemed',
        redeemed_at = now()
    WHERE id = v_coupon.id;

    -- Consume token
    UPDATE public.presentation_tokens 
    SET consumed_at = now()
    WHERE id = v_token.id;

    -- Generate receipt
    v_receipt := 'REC-' || upper(substring(gen_random_uuid()::text, 1, 8));

    INSERT INTO public.redemptions (
        coupon_id,
        wallet_id,
        partner_id,
        partner_name,
        offer_title,
        redeemed_by_merchant_email,
        receipt_code
    ) VALUES (
        v_coupon.id,
        v_coupon.wallet_id,
        v_coupon.partner_id,
        v_coupon.partner_name,
        v_coupon.offer_title,
        lower(trim(merchant_email)),
        v_receipt
    );

    RETURN json_build_object(
        'success', true,
        'partner_name', v_coupon.partner_name,
        'offer_title', v_coupon.offer_title,
        'receipt_code', v_receipt,
        'redeemed_at', now()
    );
END;
$$;


--
-- Name: register_newsletter_subscriber(text, text, text, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_newsletter_subscriber(email_input text, first_name_input text DEFAULT ''::text, area_input text DEFAULT 'All East Gwillimbury'::text, audience_input text DEFAULT 'reader'::text, thursday_input boolean DEFAULT true, monday_input boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
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
        left(coalesce(nullif(trim(area_input), ''), 'All East Gwillimbury'), 80),
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
$_$;


--
-- Name: save_newsletter_edition(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_newsletter_edition(edition_input text, subject_input text, html_input text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if edition_input not in ('reader', 'vendor', 'monday') then
        return false;
    end if;

    insert into public.newsletter_editions (edition, subject, html_content, updated_at)
    values (edition_input, subject_input, html_input, now())
    on conflict (edition) do update
    set subject = excluded.subject,
        html_content = excluded.html_content,
        updated_at = now();

    -- One archive entry per edition per day
    delete from public.newsletter_archive
    where edition = edition_input and issue_date = current_date;
    insert into public.newsletter_archive (edition, subject, html_content, issue_date, published_at)
    values (edition_input, subject_input, html_input, current_date, now());

    return true;
end;
$$;


--
-- Name: save_newsletter_setting(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_newsletter_setting(key_input text, value_input jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: unsubscribe_reader(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unsubscribe_reader(token_input text DEFAULT NULL::text, email_input text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
    t text := btrim(coalesce(token_input, ''));
    target_email text := null;
begin
    -- email_input is ignored on purpose: only the link from one of our emails can unsubscribe.
    if t = '' then
        return false;
    end if;

    update public.newsletter_subscribers
    set status = 'unsubscribed',
        unsubscribed_at = now()
    where unsubscribe_token::text = t
    returning email into target_email;

    if target_email is null then
        select email into target_email from public.wg_unsubscribe_tokens where token::text = t;
        if target_email is null then
            return false;
        end if;
        insert into public.newsletter_subscribers (email, status, unsubscribed_at)
        values (target_email, 'unsubscribed', now())
        on conflict (email) do update
        set status = 'unsubscribed',
            unsubscribed_at = now();
    end if;

    update public.partners
    set join_newsletter = false
    where lower(trim(contact_email)) = lower(trim(target_email));

    update public.claims
    set join_newsletter = false
    where lower(trim(email)) = lower(trim(target_email));

    return true;
end;
$$;


--
-- Name: update_my_scrape(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_my_scrape(id_input uuid, email_input text, updates jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: update_my_submission(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_my_submission(id_input uuid, email_input text, updates jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    found_id uuid;
    new_link text := updates->>'link';
    new_image text := btrim(coalesce(updates->>'image_url', ''));
    new_date_type text := lower(btrim(coalesce(updates->>'date_type', '')));
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
    if updates ? 'date_type' and new_date_type <> ''
       and new_date_type not in ('one_time', 'date_range', 'multiple', 'recurring') then
        return jsonb_build_object('success', false, 'error', 'Invalid schedule pattern');
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
        date_type = case
            when updates ? 'date_type' and new_date_type <> '' then new_date_type
            else date_type end,
        recurrence_rule = case
            when updates ? 'recurrence_rule' and coalesce(updates->>'recurrence_rule', '') = '' then null
            when updates ? 'recurrence_rule' then left(updates->>'recurrence_rule', 4000)
            else recurrence_rule end,
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
$$;


--
-- Name: upsert_url_blacklist(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_url_blacklist(target_url_input text, match_type_input text DEFAULT 'exact_url'::text, source_label_input text DEFAULT ''::text, reason_input text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    clean_target text := trim(target_url_input);
    valid_match text := case when match_type_input in ('domain', 'exact_url', 'prefix') then match_type_input else 'exact_url' end;
    rec public.scraped_url_blacklist%rowtype;
begin
    if not (public.is_admin() or public.is_staff()) then
        raise exception 'Only admins or staff can manage the URL blacklist';
    end if;

    if clean_target = '' then
        raise exception 'Target URL or domain cannot be empty';
    end if;

    insert into public.scraped_url_blacklist (target_url, match_type, source_label, reason, active)
    values (
        clean_target,
        valid_match,
        coalesce(trim(source_label_input), ''),
        coalesce(trim(reason_input), ''),
        true
    )
    on conflict (target_url) do update
    set match_type = excluded.match_type,
        source_label = case when excluded.source_label <> '' then excluded.source_label else public.scraped_url_blacklist.source_label end,
        reason = case when excluded.reason <> '' then excluded.reason else public.scraped_url_blacklist.reason end,
        active = true
    returning * into rec;

    return to_jsonb(rec);
end;
$$;


--
-- Name: verify_presentation_code(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_presentation_code(input_code text, partner_email text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_token record;
    v_coupon record;
    v_clean_code text;
BEGIN
    v_clean_code := replace(replace(upper(trim(input_code)), '-', ''), ' ', '');

    SELECT * INTO v_token 
    FROM public.presentation_tokens 
    WHERE (
        replace(fallback_code, '-', '') = v_clean_code
        OR token_code = input_code
    )
    AND expires_at > now()
    AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired code. Enter code 6 characters "WG2345" do not use a hyphen.');
    END IF;

    SELECT * INTO v_coupon FROM public.coupons WHERE id = v_token.coupon_id;

    RETURN json_build_object(
        'success', true,
        'token_id', v_token.id,
        'fallback_code', v_token.fallback_code,
        'coupon', row_to_json(v_coupon)
    );
END;
$$;


--
-- Name: wg_active_search_sponsors(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_active_search_sponsors() RETURNS TABLE(id uuid, keyword text, target_kind text, search_query text, business_slug text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: wg_active_spotlight(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_active_spotlight() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select s.listing_id
      from public.spotlight_schedule s
      join public.vendor_events v on v.id = s.listing_id and v.status = 'approved'
     where s.active and now() >= s.starts_at and now() < s.ends_at
     order by s.priority desc, s.starts_at desc, s.created_at desc
     limit 1;
$$;


--
-- Name: wg_admin_business_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_admin_business_accounts() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
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


--
-- Name: wg_admin_decide_claim(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_admin_decide_claim(claim_id_input uuid, decision_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
declare
    v_claim public.business_claims%rowtype;
    v_decision text := lower(trim(coalesce(decision_input, '')));
    v_link_res jsonb;
begin
    if not public.is_admin() then
        raise exception 'Only admins can decide business claims' using errcode = '42501';
    end if;

    if v_decision not in ('approved', 'rejected') then
        return jsonb_build_object('success', false, 'error', 'Invalid decision.');
    end if;

    select * into v_claim
    from public.business_claims
    where id = claim_id_input
    for update;

    if v_claim.id is null then
        return jsonb_build_object('success', false, 'error', 'Claim not found.');
    end if;

    if v_claim.status <> 'pending' then
        return jsonb_build_object('success', false, 'error', 'Only email-verified pending claims can be decided.');
    end if;

    if v_decision = 'approved' then
        v_link_res := public.wg_admin_set_business_account(v_claim.claimant_email, v_claim.business_id);
        if coalesce((v_link_res->>'success')::boolean, false) is false then
            return v_link_res;
        end if;
    end if;

    update public.business_claims
    set status = v_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = v_claim.id;

    return jsonb_build_object('success', true, 'status', v_decision);
end;
$$;


--
-- Name: wg_admin_delete_subscriber(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_admin_delete_subscriber(sub_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    deleted_email text;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    delete from public.newsletter_subscribers
     where id = sub_id
    returning email into deleted_email;

    if deleted_email is null then
        return jsonb_build_object('success', false, 'error', 'Subscriber not found');
    end if;

    return jsonb_build_object('success', true, 'email', deleted_email);
end;
$$;


--
-- Name: wg_admin_set_business_account(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_admin_set_business_account(email_input text, business_id_input uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
declare
    uid uuid;
begin
    if not (public.wg_is_trusted_caller() and not public.wg_is_viewer()) then
        raise exception 'Only non-viewer staff or admins can manage business accounts' using errcode = '42501';
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


--
-- Name: wg_admin_set_subscriber_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_admin_set_subscriber_status(sub_id uuid, status_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    s text := lower(btrim(coalesce(status_input, '')));
    updated_rec record;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    if s not in ('active', 'pending', 'unsubscribed') then
        return jsonb_build_object('success', false, 'error', 'Invalid status. Must be active, pending, or unsubscribed');
    end if;

    update public.newsletter_subscribers
       set status = s,
           unsubscribed_at = case when s = 'unsubscribed' then coalesce(unsubscribed_at, now()) else null end
     where id = sub_id
    returning id, email, status, unsubscribed_at into updated_rec;

    if updated_rec.id is null then
        return jsonb_build_object('success', false, 'error', 'Subscriber not found');
    end if;

    -- If disabled/unsubscribed, also sync CASL flags on claims and partners
    if s = 'unsubscribed' then
        update public.partners set join_newsletter = false where lower(trim(contact_email)) = lower(trim(updated_rec.email));
        update public.claims set join_newsletter = false where lower(trim(email)) = lower(trim(updated_rec.email));
    end if;

    return jsonb_build_object(
        'success', true,
        'id', updated_rec.id,
        'email', updated_rec.email,
        'status', updated_rec.status,
        'unsubscribed_at', updated_rec.unsubscribed_at
    );
end;
$$;


--
-- Name: wg_archive_month_clicks(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_archive_month_clicks(month_input text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_tor_today date := (now() at time zone 'America/Toronto')::date;
    v_cur_month_start date := date_trunc('month', v_tor_today)::date;
    v_m_start date;
    v_m_end date;
    v_month text;
    v_from timestamptz;
    v_to timestamptz;
    v_written int := 0;
    v_biz record;
begin
    if month_input is null or btrim(month_input) = '' then
        v_m_start := (v_cur_month_start - interval '1 month')::date;
    else
        v_m_start := to_date(month_input || '-01', 'YYYY-MM-DD');
    end if;

    -- Only archive completed months (past midnight at the end of that month, Toronto time)
    if v_m_start >= v_cur_month_start then
        return 0;
    end if;

    v_m_end := (v_m_start + interval '1 month')::date;
    v_month := to_char(v_m_start, 'YYYY-MM');
    v_from := v_m_start::timestamp at time zone 'America/Toronto';
    v_to := v_m_end::timestamp at time zone 'America/Toronto';

    -- A. Site-wide monthly archive snapshot
    with clean as (
        select k.*
          from public.link_clicks k
         where k.clicked_at >= v_from and k.clicked_at < v_to
           and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                 or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
    ), imp as (
        select i.*
          from public.sponsor_impressions i
         where i.viewed_at >= v_from and i.viewed_at < v_to
           and not (coalesce(i.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)')
    ), is_search as (
        select id from clean
         where item_kind in ('search_sponsor', 'search_result', 'search')
            or coalesce(page, '') in ('home-search', 'discovery', 'search', 'search-results')
    )
    insert into public.click_monthly_archives (
        archive_month, scope, business_id, business_name, summary, by_business, by_item, by_search, by_day, archived_at
    )
    values (
        v_month, 'site', null, 'All Businesses',
        (select jsonb_build_object(
            'clicks', count(*),
            'unique_visitors', count(distinct nullif(visitor_hash, '')),
            'website_clicks', count(*) filter (where item_kind is not null),
            'newsletter_clicks', count(*) filter (where item_kind is null),
            'search_clicks', count(*) filter (where id in (select id from is_search)),
            'sponsored_impressions', (select count(*) from imp)
        ) from clean),
        coalesce((
            select jsonb_agg(b order by (b ->> 'clicks')::int desc)
              from (select jsonb_build_object(
                           'business', source_name,
                           'clicks', count(*),
                           'unique_visitors', count(distinct nullif(visitor_hash, '')),
                           'website_clicks', count(*) filter (where item_kind is not null),
                           'newsletter_clicks', count(*) filter (where item_kind is null),
                           'search_clicks', count(*) filter (where id in (select id from is_search)),
                           'listings', count(distinct coalesce(item_id::text, article_title))) as b
                      from clean group by source_name) s), '[]'::jsonb),
        coalesce((
            select jsonb_agg(i order by (i ->> 'clicks')::int desc)
              from (select jsonb_build_object(
                           'business', source_name,
                           'title', article_title,
                           'kind', coalesce(item_kind, 'newsletter'),
                           'category', min(category),
                           'item_id', item_id,
                           'target_url', min(target_url),
                           'clicks', count(*),
                           'unique_visitors', count(distinct nullif(visitor_hash, '')),
                           'last_click', max(clicked_at)) as i
                      from clean
                     where id not in (select id from is_search)
                     group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
        coalesce((
            select jsonb_agg(i order by (i ->> 'clicks')::int desc)
              from (select jsonb_build_object(
                           'business', source_name,
                           'title', article_title,
                           'kind', coalesce(item_kind, 'search_result'),
                           'page', min(coalesce(page, 'search-results')),
                           'target_url', min(target_url),
                           'clicks', count(*),
                           'unique_visitors', count(distinct nullif(visitor_hash, '')),
                           'last_click', max(clicked_at)) as i
                      from clean
                     where id in (select id from is_search)
                     group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
        coalesce((
            select jsonb_agg(jsonb_build_object('day', day, 'clicks', clicks, 'unique_visitors', uniq, 'search_clicks', sc) order by day)
              from (select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM-DD') as day,
                           count(*) as clicks,
                           count(distinct nullif(visitor_hash, '')) as uniq,
                           count(*) filter (where id in (select id from is_search)) as sc
                      from clean group by 1) s), '[]'::jsonb),
        now()
    )
    on conflict (archive_month, scope, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set
        summary = excluded.summary,
        by_business = excluded.by_business,
        by_item = excluded.by_item,
        by_search = excluded.by_search,
        by_day = excluded.by_day,
        archived_at = now();
    v_written := v_written + 1;

    -- B. Per-business monthly archive snapshots (for every directory business with activity)
    for v_biz in
        select d.id, d.name, d.slug
          from public.directory_listings d
         where d.status = 'approved'
           and (
               exists (select 1 from public.link_clicks k
                        where k.clicked_at >= v_from and k.clicked_at < v_to
                          and (k.item_id = d.id or lower(btrim(k.source_name)) = lower(btrim(d.name))))
               or exists (select 1 from public.search_sponsors sp
                           where sp.business_id = d.id)
           )
    loop
        with spots as (
            select sp.id from public.search_sponsors sp where sp.business_id = v_biz.id
        ), listings as (
            select e.id from public.vendor_events e where lower(btrim(e.business_name)) = lower(btrim(v_biz.name))
        ), clean as (
            select k.*,
                   (k.item_kind in ('search_sponsor', 'search_result', 'search')
                    or coalesce(k.page, '') in ('home-search', 'discovery', 'search', 'search-results')) as is_search
              from public.link_clicks k
             where k.clicked_at >= v_from and k.clicked_at < v_to
               and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                     or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
               and ((k.item_kind = 'search_sponsor' and k.item_id in (select id from spots))
                 or (k.item_kind = 'directory' and k.item_id = v_biz.id)
                 or (k.item_kind = 'listing' and k.item_id in (select id from listings))
                 or (k.item_kind = 'search_result' and (k.item_id = v_biz.id or k.item_id in (select id from listings) or lower(btrim(k.source_name)) = lower(btrim(v_biz.name))))
                 or (k.item_kind is null and lower(btrim(k.source_name)) = lower(btrim(v_biz.name))))
        ), imp as (
            select i.*
              from public.sponsor_impressions i
             where i.viewed_at >= v_from and i.viewed_at < v_to
               and i.sponsor_id in (select id from spots)
               and not (coalesce(i.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)')
        )
        insert into public.click_monthly_archives (
            archive_month, scope, business_id, business_name, summary, by_item, by_search, by_day, archived_at
        )
        select
            v_month, 'business', v_biz.id, v_biz.name,
            jsonb_build_object(
                'total_clicks', (select count(*) from clean),
                'search_clicks', (select count(*) from clean where is_search),
                'sponsored_clicks', (select count(*) from clean where item_kind = 'search_sponsor'),
                'sponsored_impressions', (select count(*) from imp),
                'sponsored_ctr', case when (select count(*) from imp) > 0
                    then round(((select count(*)::numeric from clean where item_kind = 'search_sponsor') / (select count(*)::numeric from imp)) * 100.0, 1)
                    else 0.0 end,
                'business_page', (select count(*) from clean where not is_search and item_kind = 'directory'),
                'listings', (select count(*) from clean where not is_search and item_kind = 'listing'),
                'newsletter', (select count(*) from clean where not is_search and item_kind is null)
            ),
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'title', article_title, 'kind', coalesce(item_kind, 'newsletter'),
                    'target_url', min(target_url), 'clicks', count(*),
                    'unique_visitors', count(distinct nullif(visitor_hash, '')), 'last_click', max(clicked_at)
                ) order by count(*) desc)
                  from clean where not is_search group by article_title, item_kind, item_id), '[]'::jsonb),
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'title', article_title, 'kind', coalesce(item_kind, 'search_result'),
                    'page', min(coalesce(page, 'search-results')), 'target_url', min(target_url),
                    'clicks', count(*), 'unique_visitors', count(distinct nullif(visitor_hash, '')),
                    'last_click', max(clicked_at)
                ) order by count(*) desc)
                  from clean where is_search group by article_title, item_kind, item_id), '[]'::jsonb),
            coalesce((
                select jsonb_agg(jsonb_build_object(
                    'day', to_char(g::date, 'YYYY-MM-DD'),
                    'search_clicks', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and is_search),
                    'sponsored_clicks', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and item_kind = 'search_sponsor'),
                    'sponsored_impressions', (select count(*) from imp where (viewed_at at time zone 'America/Toronto')::date = g::date),
                    'business_page', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and not is_search and item_kind = 'directory'),
                    'listings', (select count(*) from clean where (clicked_at at time zone 'America/Toronto')::date = g::date and not is_search and item_kind = 'listing')
                ) order by g)
                  from generate_series(v_m_start::timestamp, (v_m_end - interval '1 day')::timestamp, interval '1 day') g), '[]'::jsonb),
            now()
        where (select count(*) from clean) > 0 or (select count(*) from imp) > 0
        on conflict (archive_month, scope, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid))
        do update set
            summary = excluded.summary,
            by_item = excluded.by_item,
            by_search = excluded.by_search,
            by_day = excluded.by_day,
            archived_at = now();
        v_written := v_written + 1;
    end loop;

    return v_written;
end;
$_$;


--
-- Name: wg_block_viewer_writes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_block_viewer_writes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: wg_check_listing_duplicate(text, date, date, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_check_listing_duplicate(p_title text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_location text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_link text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_kind text DEFAULT 'event'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_clean_cand_title text;
    v_clean_cand_link text;
    v_clean_cand_email text;
    v_cand_location text;
    v_cand_comm text;
    
    r record;
    v_best_id text := null;
    v_best_title text := null;
    v_best_dates text := null;
    v_best_loc text := null;
    v_best_comm text := null;
    v_best_link text := null;
    v_best_status text := null;
    v_best_score integer := 0;
    v_best_reasons text[] := array[]::text[];
    
    v_cur_score integer;
    v_cur_reasons text[];
    v_title_sim real;
    v_clean_rec_link text;
    v_clean_rec_title text;
begin
    -- Sanitize candidate inputs
    v_clean_cand_title := lower(trim(regexp_replace(coalesce(p_title, ''), '^\s*\[[^\]]+\]\s*', '', 'g')));
    v_clean_cand_email := lower(trim(coalesce(p_email, '')));
    v_cand_location := lower(trim(coalesce(p_location, '')));
    v_cand_comm := lower(trim(coalesce(p_community, '')));
    
    -- Normalize link: strip http/https, www., query strings, trailing slashes
    if p_link is not null and length(trim(p_link)) > 5 then
        v_clean_cand_link := regexp_replace(lower(trim(p_link)), '^https?://(www\.)?', '');
        v_clean_cand_link := split_part(v_clean_cand_link, '?', 1);
        v_clean_cand_link := rtrim(v_clean_cand_link, '/');
    else
        v_clean_cand_link := '';
    end if;

    if length(v_clean_cand_title) < 2 then
        return jsonb_build_object(
            'has_duplicate', false,
            'confidence', 'none',
            'score', 0,
            'reasons', '[]'::jsonb,
            'matched_listing', null
        );
    end if;

    -- Search across relevant listings: active/pending, within a 14-day window (or non-expired)
    for r in
        select 
            id,
            title,
            event_date_label,
            event_start_date,
            expires_after,
            location,
            community,
            link,
            submitter_email,
            status
        from public.vendor_events
        where status in ('approved', 'pending', 'pending_verification')
          and (
              -- If candidate date is known, search within 14 days; otherwise search unexpired listings
              (p_start_date is not null and (
                  event_start_date between (p_start_date - interval '14 days') and (p_start_date + interval '14 days')
                  or (expires_after is not null and expires_after >= p_start_date)
              ))
              or (p_start_date is null and (expires_after is null or expires_after >= current_date - interval '7 days'))
          )
        order by created_at desc
        limit 150
    loop
        v_cur_score := 0;
        v_cur_reasons := array[]::text[];
        v_clean_rec_title := lower(trim(regexp_replace(coalesce(r.title, ''), '^\s*\[[^\]]+\]\s*', '', 'g')));

        -- 1. Exact Link / URL match (+50)
        if length(v_clean_cand_link) > 5 and r.link is not null and length(trim(r.link)) > 5 then
            v_clean_rec_link := regexp_replace(lower(trim(r.link)), '^https?://(www\.)?', '');
            v_clean_rec_link := split_part(v_clean_rec_link, '?', 1);
            v_clean_rec_link := rtrim(v_clean_rec_link, '/');
            if v_clean_cand_link = v_clean_rec_link then
                v_cur_score := v_cur_score + 50;
                v_cur_reasons := array_append(v_cur_reasons, 'Matching event link / URL');
            end if;
        end if;

        -- 2. Date match (+30 for exact start, +15 for overlap)
        if p_start_date is not null and r.event_start_date is not null then
            if p_start_date = r.event_start_date then
                v_cur_score := v_cur_score + 30;
                v_cur_reasons := array_append(v_cur_reasons, 'Same event date (' || to_char(p_start_date, 'Mon DD, YYYY') || ')');
            elsif p_end_date is not null and r.expires_after is not null and (p_start_date <= r.expires_after and p_end_date >= r.event_start_date) then
                v_cur_score := v_cur_score + 15;
                v_cur_reasons := array_append(v_cur_reasons, 'Overlapping event dates');
            end if;
        end if;

        -- 3. Fuzzy Title Similarity via pg_trgm (+45 for >= 0.85, +25 for >= 0.65)
        v_title_sim := similarity(v_clean_rec_title, v_clean_cand_title);
        if v_title_sim >= 0.85 then
            v_cur_score := v_cur_score + 45;
            v_cur_reasons := array_append(v_cur_reasons, round((v_title_sim * 100)::numeric, 0)::text || '% title match');
        elsif v_title_sim >= 0.65 then
            v_cur_score := v_cur_score + 25;
            v_cur_reasons := array_append(v_cur_reasons, round((v_title_sim * 100)::numeric, 0)::text || '% title match');
        end if;

        -- 4. Location / Venue Match (+20)
        if length(v_cand_location) > 3 and r.location is not null and length(trim(r.location)) > 3 then
            if lower(r.location) like '%' || v_cand_location || '%' or v_cand_location like '%' || lower(r.location) || '%' then
                v_cur_score := v_cur_score + 20;
                v_cur_reasons := array_append(v_cur_reasons, 'Matching venue / address');
            end if;
        end if;

        -- 5. Community Match (+5)
        if length(v_cand_comm) > 2 and r.community is not null and lower(trim(r.community)) = v_cand_comm then
            v_cur_score := v_cur_score + 5;
        end if;

        -- 6. Same Submitter Email (+15)
        if length(v_clean_cand_email) > 3 and r.submitter_email is not null and lower(trim(r.submitter_email)) = v_clean_cand_email then
            v_cur_score := v_cur_score + 15;
            v_cur_reasons := array_append(v_cur_reasons, 'Submitted under same contact email');
        end if;

        -- Cap score at 100
        if v_cur_score > 100 then
            v_cur_score := 100;
        end if;

        -- Retain highest scoring candidate
        if v_cur_score > v_best_score then
            v_best_score := v_cur_score;
            v_best_id := r.id;
            v_best_title := r.title;
            v_best_dates := coalesce(r.event_date_label, to_char(r.event_start_date, 'Mon DD, YYYY'));
            v_best_loc := r.location;
            v_best_comm := r.community;
            v_best_link := r.link;
            v_best_status := r.status;
            v_best_reasons := v_cur_reasons;
        end if;
    end loop;

    -- Return JSONB payload
    if v_best_score >= 70 then
        return jsonb_build_object(
            'has_duplicate', true,
            'confidence', 'high',
            'score', v_best_score,
            'reasons', to_jsonb(v_best_reasons),
            'matched_listing', jsonb_build_object(
                'id', v_best_id,
                'title', v_best_title,
                'event_date_label', v_best_dates,
                'location', v_best_loc,
                'community', v_best_comm,
                'link', v_best_link,
                'status', v_best_status
            )
        );
    elsif v_best_score >= 45 then
        return jsonb_build_object(
            'has_duplicate', true,
            'confidence', 'medium',
            'score', v_best_score,
            'reasons', to_jsonb(v_best_reasons),
            'matched_listing', jsonb_build_object(
                'id', v_best_id,
                'title', v_best_title,
                'event_date_label', v_best_dates,
                'location', v_best_loc,
                'community', v_best_comm,
                'link', v_best_link,
                'status', v_best_status
            )
        );
    else
        return jsonb_build_object(
            'has_duplicate', false,
            'confidence', 'none',
            'score', v_best_score,
            'reasons', '[]'::jsonb,
            'matched_listing', null
        );
    end if;
end;
$$;


--
-- Name: wg_claimed_business_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_claimed_business_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    select coalesce(array_agg(distinct business_id), '{}'::uuid[])
    from public.business_accounts;
$$;


--
-- Name: wg_click_ip_hash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_click_ip_hash() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
    select nullif(md5('wg-click:' || btrim(split_part(coalesce(
        current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1))), md5('wg-click:'));
$$;


--
-- Name: wg_click_report(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_click_report(from_input date, to_input date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_from timestamptz;
    v_to timestamptz;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    v_from := (coalesce(from_input, (now() at time zone 'America/Toronto')::date - 30))::timestamp at time zone 'America/Toronto';
    v_to := (coalesce(to_input, (now() at time zone 'America/Toronto')::date) + 1)::timestamp at time zone 'America/Toronto';

    return (
        with clean as (
            select k.*,
                   (k.item_kind in ('search_sponsor', 'search_result', 'search')
                    or coalesce(k.page, '') in ('home-search', 'discovery', 'search', 'search-results')) as is_search
              from public.link_clicks k
             where k.clicked_at >= v_from and k.clicked_at < v_to
               and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                     or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
        )
        select jsonb_build_object(
            'from', v_from, 'to', v_to,
            'totals', (
                select jsonb_build_object(
                    'clicks', count(*),
                    'unique_visitors', count(distinct nullif(visitor_hash, '')),
                    'website_clicks', count(*) filter (where item_kind is not null),
                    'newsletter_clicks', count(*) filter (where item_kind is null),
                    'search_clicks', count(*) filter (where is_search))
                  from clean),
            'by_business', coalesce((
                select jsonb_agg(b order by (b ->> 'clicks')::int desc)
                  from (select jsonb_build_object(
                               'business', c.source_name,
                               'business_id', (select d.id from public.directory_listings d
                                                where d.status = 'approved'
                                                  and lower(btrim(d.name)) = lower(btrim(c.source_name))
                                                limit 1),
                               'clicks', count(*),
                               'unique_visitors', count(distinct nullif(c.visitor_hash, '')),
                               'website_clicks', count(*) filter (where c.item_kind is not null),
                               'newsletter_clicks', count(*) filter (where c.item_kind is null),
                               'search_clicks', count(*) filter (where c.is_search),
                               'listings', count(distinct coalesce(c.item_id::text, c.article_title))) as b
                          from clean c
                         group by c.source_name) s), '[]'::jsonb),
            'by_item', coalesce((
                select jsonb_agg(i order by (i ->> 'clicks')::int desc)
                  from (select jsonb_build_object(
                               'business', source_name,
                               'title', article_title,
                               'kind', coalesce(item_kind, 'newsletter'),
                               'category', min(category),
                               'item_id', item_id,
                               'target_url', min(target_url),
                               'clicks', count(*),
                               'unique_visitors', count(distinct nullif(visitor_hash, '')),
                               'last_click', max(clicked_at)) as i
                          from clean
                         where not is_search
                         group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
            'by_search', coalesce((
                select jsonb_agg(i order by (i ->> 'clicks')::int desc)
                  from (select jsonb_build_object(
                               'business', source_name,
                               'title', article_title,
                               'kind', coalesce(item_kind, 'search_result'),
                               'page', min(coalesce(page, 'search-results')),
                               'item_id', item_id,
                               'target_url', min(target_url),
                               'clicks', count(*),
                               'unique_visitors', count(distinct nullif(visitor_hash, '')),
                               'last_click', max(clicked_at)) as i
                          from clean
                         where is_search
                         group by source_name, article_title, item_kind, item_id) s), '[]'::jsonb),
            'by_day', coalesce((
                select jsonb_agg(jsonb_build_object('day', day, 'clicks', clicks, 'unique_visitors', uniq, 'search_clicks', sc) order by day)
                  from (select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM-DD') as day,
                               count(*) as clicks,
                               count(distinct nullif(visitor_hash, '')) as uniq,
                               count(*) filter (where is_search) as sc
                          from clean group by 1) s), '[]'::jsonb),
            'by_month', coalesce((
                select jsonb_agg(jsonb_build_object('month', m, 'clicks', clicks, 'unique_visitors', uniq, 'search_clicks', sc) order by m)
                  from (select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM') as m,
                               count(*) as clicks,
                               count(distinct nullif(visitor_hash, '')) as uniq,
                               count(*) filter (where is_search) as sc
                          from clean group by 1) s), '[]'::jsonb),
            'by_page', coalesce((
                select jsonb_agg(jsonb_build_object('page', pg, 'clicks', clicks) order by clicks desc)
                  from (select coalesce(page, case when item_kind is null then 'newsletter' else 'other' end) as pg,
                               count(*) as clicks
                          from clean group by 1) s), '[]'::jsonb))
    );
end;
$_$;


--
-- Name: wg_click_should_count(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_click_should_count(id_input uuid, visitor_input text, ip_input text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
    select case
        when ip_input is not null then
            not exists (select 1 from public.link_clicks c
                         where c.item_id = id_input and c.ip_hash = ip_input
                           and c.clicked_at > now() - interval '30 minutes')
            and (select count(*) from public.link_clicks c
                  where c.ip_hash = ip_input and c.clicked_at > now() - interval '1 hour') < 60
        else
            visitor_input = '' or not exists (select 1 from public.link_clicks c
                         where c.item_id = id_input and c.visitor_hash = visitor_input
                           and c.clicked_at > now() - interval '30 seconds')
    end;
$$;


--
-- Name: wg_confirm_business_claim(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_confirm_business_claim(token_input text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    v_token text := trim(coalesce(token_input, ''));
    v_row public.business_claims%rowtype;
begin
    if length(v_token) < 16 then
        return jsonb_build_object('success', false, 'error', 'Missing or invalid confirmation token.');
    end if;

    select * into v_row
    from public.business_claims
    where verify_token = v_token
    limit 1
    for update;

    if v_row.id is null or v_row.status <> 'pending_verification' then
        return jsonb_build_object('success', false, 'error', 'This confirmation link is invalid or has already been used.');
    end if;

    if v_row.verify_token_expires_at is not null and v_row.verify_token_expires_at < now() then
        return jsonb_build_object('success', false, 'error', 'This confirmation link has expired. Please submit a new claim.');
    end if;

    update public.business_claims
    set status = 'pending',
        verified_at = now(),
        verify_token = ''
    where id = v_row.id and status = 'pending_verification';

    return jsonb_build_object(
        'success', true,
        'business_id', v_row.business_id,
        'business_name', v_row.business_name
    );
end;
$$;


--
-- Name: wg_create_ad_order(text, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_create_ad_order(ad_type_input text, plan_input text, sponsor_name_input text, contact_email_input text, target_type_input text, target_url_input text, headline_input text DEFAULT NULL::text, body_text_input text DEFAULT NULL::text, image_data_url_input text DEFAULT NULL::text, edition_input text DEFAULT 'both'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  new_id uuid;
  clean_email text := lower(trim(coalesce(contact_email_input, '')));
  clean_sponsor text := trim(coalesce(sponsor_name_input, ''));
  clean_url text := trim(coalesce(target_url_input, ''));
begin
  if ad_type_input not in ('gallery', 'newsletter') then
    raise exception 'Invalid ad_type';
  end if;
  if plan_input not in ('gallery_weekly', 'gallery_monthly', 'newsletter_single', 'newsletter_four_pack') then
    raise exception 'Invalid plan';
  end if;
  if length(clean_sponsor) < 2 then
    raise exception 'Sponsor name is required';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Valid contact email is required';
  end if;
  if length(clean_url) < 2 then
    raise exception 'Destination URL or path is required';
  end if;

  insert into public.ad_orders (
    ad_type, plan, sponsor_name, contact_email, headline, body_text,
    image_data_url, target_type, target_url, edition, status
  ) values (
    ad_type_input,
    plan_input,
    clean_sponsor,
    clean_email,
    nullif(trim(coalesce(headline_input, '')), ''),
    nullif(trim(coalesce(body_text_input, '')), ''),
    nullif(trim(coalesce(image_data_url_input, '')), ''),
    coalesce(nullif(trim(target_type_input), ''), 'external'),
    clean_url,
    coalesce(nullif(trim(edition_input), ''), 'both'),
    'pending_payment'
  )
  returning id into new_id;

  return new_id;
end;
$_$;


--
-- Name: wg_create_sponsor_order(text, text, text, text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_create_sponsor_order(plan_input text, keyword_input text, sponsor_name_input text, contact_email_input text, target_kind_input text, website_url_input text DEFAULT NULL::text, business_id_input uuid DEFAULT NULL::uuid, search_query_input text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_plan text := lower(btrim(coalesce(plan_input, '')));
    v_keyword text := btrim(coalesce(keyword_input, ''));
    v_name text := btrim(coalesce(sponsor_name_input, ''));
    v_email text := lower(btrim(coalesce(contact_email_input, '')));
    v_kind text := lower(btrim(coalesce(target_kind_input, '')));
    v_url text := nullif(btrim(coalesce(website_url_input, '')), '');
    v_query text := nullif(btrim(coalesce(search_query_input, '')), '');
    v_order_id uuid;
begin
    if v_plan not in ('weekly', 'monthly') then
        raise exception 'Invalid plan. Choose weekly or monthly.';
    end if;

    if char_length(v_keyword) < 2 or char_length(v_keyword) > 22 then
        raise exception 'Quick Search keyword must be between 2 and 22 characters.';
    end if;

    if char_length(v_name) < 1 or char_length(v_name) > 120 then
        raise exception 'Business / Sponsor name is required (max 120 characters).';
    end if;

    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
        raise exception 'Please enter a valid contact email address.';
    end if;

    if v_kind not in ('search', 'website', 'business') then
        raise exception 'Invalid destination type.';
    end if;

    if v_kind = 'website' then
        if v_url is null or v_url !~* '^https?://' then
            raise exception 'Please enter a valid website URL starting with https:// or http://.';
        end if;
    end if;

    if v_kind = 'business' and business_id_input is null then
        raise exception 'Please select your Welcome East Gwillimbury business listing.';
    end if;

    insert into public.search_sponsor_orders (
        plan,
        keyword,
        sponsor_name,
        contact_email,
        target_kind,
        website_url,
        business_id,
        search_query,
        status
    )
    values (
        v_plan,
        v_keyword,
        v_name,
        v_email,
        v_kind,
        case when v_kind = 'website' then left(v_url, 500) else null end,
        case when v_kind = 'business' then business_id_input else null end,
        case when v_kind = 'search' then left(coalesce(v_query, v_keyword), 80) else null end,
        'pending_payment'
    )
    returning id into v_order_id;

    return v_order_id;
end;
$_$;


--
-- Name: wg_directory_set_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_directory_set_slug() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
    if tg_op = 'INSERT' or new.slug is null then
        new.slug := public.wg_unique_directory_slug(coalesce(public.wg_slugify(new.name, 60), 'business'), new.id);
    elsif new.slug is distinct from old.slug then
        new.slug := old.slug;
    end if;
    return new;
end;
$$;


--
-- Name: wg_discovery_rate_allow(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_discovery_rate_allow(ip_hash_input text, max_per_hour integer DEFAULT 40, daily_ai_cap integer DEFAULT 400) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  now_ts timestamptz := now();
  today_key text := 'ai_day:' || to_char(now_ts at time zone 'America/Toronto', 'YYYY-MM-DD');
  ip_key text := 'ip:' || coalesce(nullif(btrim(ip_hash_input), ''), 'unknown');
  ip_hits int := 0;
  ai_hits int := 0;
begin
  -- Clean stale IP buckets (> 2 hours old)
  delete from public.discovery_rate_limits
  where bucket_key like 'ip:%' and window_start < now_ts - interval '2 hours';

  insert into public.discovery_rate_limits (bucket_key, window_start, hit_count)
  values (ip_key, now_ts, 1)
  on conflict (bucket_key) do update
  set hit_count = case
        when public.discovery_rate_limits.window_start < now_ts - interval '1 hour' then 1
        else public.discovery_rate_limits.hit_count + 1
      end,
      window_start = case
        when public.discovery_rate_limits.window_start < now_ts - interval '1 hour' then now_ts
        else public.discovery_rate_limits.window_start
      end
  returning hit_count into ip_hits;

  if ip_hits > max_per_hour then
    return jsonb_build_object('allowed', false, 'ai_allowed', false, 'reason', 'rate_limited');
  end if;

  insert into public.discovery_rate_limits (bucket_key, window_start, hit_count)
  values (today_key, now_ts, 1)
  on conflict (bucket_key) do update
  set hit_count = public.discovery_rate_limits.hit_count + 1
  returning hit_count into ai_hits;

  return jsonb_build_object(
    'allowed', true,
    'ai_allowed', (ai_hits <= daily_ai_cap),
    'ip_hits', ip_hits,
    'ai_hits', ai_hits
  );
end;
$$;


--
-- Name: wg_discovery_record_metric(text, text, integer, boolean, boolean, boolean, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_discovery_record_metric(intent_input text, community_input text, result_count_input integer, used_ai_input boolean, is_lead_input boolean DEFAULT false, is_error_input boolean DEFAULT false, est_cost_input numeric DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  today_d date := (now() at time zone 'America/Toronto')::date;
  bucket text := case
    when result_count_input <= 0 then '0'
    when result_count_input <= 3 then '1-3'
    when result_count_input <= 10 then '4-10'
    else '11+'
  end;
begin
  insert into public.discovery_metrics_daily (
    metric_date, intent, community, result_count_bucket,
    request_count, ai_calls, fallback_calls, lead_count, error_count, estimated_cost_usd
  )
  values (
    today_d,
    left(coalesce(nullif(btrim(intent_input), ''), 'unknown'), 40),
    left(coalesce(nullif(btrim(community_input), ''), 'all'), 40),
    bucket,
    1,
    case when used_ai_input then 1 else 0 end,
    case when not used_ai_input and not is_lead_input then 1 else 0 end,
    case when is_lead_input then 1 else 0 end,
    case when is_error_input then 1 else 0 end,
    coalesce(est_cost_input, 0)
  )
  on conflict (metric_date, intent, community, result_count_bucket) do update
  set request_count = public.discovery_metrics_daily.request_count + 1,
      ai_calls = public.discovery_metrics_daily.ai_calls + (case when used_ai_input then 1 else 0 end),
      fallback_calls = public.discovery_metrics_daily.fallback_calls + (case when not used_ai_input and not is_lead_input then 1 else 0 end),
      lead_count = public.discovery_metrics_daily.lead_count + (case when is_lead_input then 1 else 0 end),
      error_count = public.discovery_metrics_daily.error_count + (case when is_error_input then 1 else 0 end),
      estimated_cost_usd = public.discovery_metrics_daily.estimated_cost_usd + coalesce(est_cost_input, 0);
end;
$$;


--
-- Name: wg_email_rate_allow(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_email_rate_allow(recipient_input text, form_type_input text, per_recipient integer DEFAULT 3, global_cap integer DEFAULT 150) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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


--
-- Name: wg_ensure_monthly_archives(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_ensure_monthly_archives() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    v_cur_month text := to_char(now() at time zone 'America/Toronto', 'YYYY-MM');
    v_m record;
    v_done int := 0;
begin
    -- Allowed for staff, signed-in business accounts, or scheduled cron jobs (auth.uid() is null in cron)
    if auth.uid() is not null
       and not public.wg_is_trusted_caller()
       and not exists (select 1 from public.business_accounts a where a.user_id = auth.uid()) then
        return 0;
    end if;

    for v_m in
        select distinct m as archive_month
          from (
              select to_char(clicked_at at time zone 'America/Toronto', 'YYYY-MM') as m
                from public.link_clicks
               where clicked_at < date_trunc('month', now() at time zone 'America/Toronto') at time zone 'America/Toronto'
              union
              select to_char(viewed_at at time zone 'America/Toronto', 'YYYY-MM') as m
                from public.sponsor_impressions
               where viewed_at < date_trunc('month', now() at time zone 'America/Toronto') at time zone 'America/Toronto'
          ) months
         where m < v_cur_month
           and not exists (
               select 1 from public.click_monthly_archives a
                where a.archive_month = months.m and a.scope = 'site'
           )
         order by 1
    loop
        perform public.wg_archive_month_clicks(v_m.archive_month);
        v_done := v_done + 1;
    end loop;

    return v_done;
end;
$$;


--
-- Name: wg_get_click_archive(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_get_click_archive(month_input text, business_id_input uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    v_is_staff boolean := public.wg_is_trusted_caller();
    v_biz_id uuid;
    v_row public.click_monthly_archives%rowtype;
begin
    if v_is_staff then
        if business_id_input is null then
            select * into v_row from public.click_monthly_archives
             where archive_month = month_input and scope = 'site' limit 1;
        else
            select * into v_row from public.click_monthly_archives
             where archive_month = month_input and scope = 'business' and business_id = business_id_input limit 1;
        end if;
    else
        select a.business_id into v_biz_id from public.business_accounts a where a.user_id = auth.uid();
        if v_biz_id is null then return null; end if;
        select * into v_row from public.click_monthly_archives
         where archive_month = month_input and scope = 'business' and business_id = v_biz_id limit 1;
    end if;

    if not found then return null; end if;
    return jsonb_build_object(
        'archive_month', v_row.archive_month,
        'scope', v_row.scope,
        'business_id', v_row.business_id,
        'business_name', v_row.business_name,
        'summary', v_row.summary,
        'by_business', v_row.by_business,
        'by_item', v_row.by_item,
        'by_search', v_row.by_search,
        'by_day', v_row.by_day,
        'archived_at', v_row.archived_at
    );
end;
$$;


--
-- Name: wg_guard_ad_orders_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_guard_ad_orders_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  clean_url text;
begin
  clean_url := btrim(coalesce(new.target_url, ''));
  if clean_url = '' or clean_url !~* '^(https?://|/[^/])' then
    raise exception 'Invalid target_url scheme';
  end if;
  new.target_url := left(clean_url, 1000);
  if new.image_data_url is not null and length(new.image_data_url) > 2000000 then
    raise exception 'Image payload too large';
  end if;
  return new;
end;
$$;


--
-- Name: wg_home_gallery_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_home_gallery_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
    new.updated_at := now();
    return new;
end;
$$;


--
-- Name: wg_is_admin_page(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_is_admin_page(page_input text DEFAULT NULL::text, url_input text DEFAULT NULL::text, referrer_input text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_headers jsonb;
    v_ref text;
begin
    if coalesce(page_input, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)' then
        return true;
    end if;
    if coalesce(url_input, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)' then
        return true;
    end if;
    v_ref := coalesce(referrer_input, '');
    if v_ref = '' then
        begin
            v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
            v_ref := coalesce(v_headers ->> 'referer', v_headers ->> 'referrer', '');
        exception when others then
            v_ref := '';
        end;
    end if;
    if v_ref ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)' then
        return true;
    end if;
    return false;
end;
$_$;


--
-- Name: wg_is_trusted_caller(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_is_trusted_caller() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    select current_user = 'service_role'
        or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        or coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') = 'service_role'
        or public.is_admin()
        or public.is_staff();
$$;


--
-- Name: wg_is_viewer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_is_viewer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    select exists (
        select 1 from public.user_profiles
        where id = auth.uid() and active = true and lower(coalesce(role, '')) = 'viewer'
    );
$$;


--
-- Name: wg_list_click_archives(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_list_click_archives(business_id_input uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    v_is_staff boolean := public.wg_is_trusted_caller();
    v_biz_id uuid;
begin
    if v_is_staff then
        if business_id_input is null then
            return coalesce((
                select jsonb_agg(jsonb_build_object(
                    'archive_month', a.archive_month, 'scope', a.scope,
                    'business_id', a.business_id, 'business_name', a.business_name,
                    'summary', a.summary, 'archived_at', a.archived_at
                ) order by a.archive_month desc)
                  from public.click_monthly_archives a
                 where a.scope = 'site'
            ), '[]'::jsonb);
        else
            return coalesce((
                select jsonb_agg(jsonb_build_object(
                    'archive_month', a.archive_month, 'scope', a.scope,
                    'business_id', a.business_id, 'business_name', a.business_name,
                    'summary', a.summary, 'archived_at', a.archived_at
                ) order by a.archive_month desc)
                  from public.click_monthly_archives a
                 where a.scope = 'business' and a.business_id = business_id_input
            ), '[]'::jsonb);
        end if;
    end if;

    -- Merchant: strictly limited to their own linked business
    select a.business_id into v_biz_id from public.business_accounts a where a.user_id = auth.uid();
    if v_biz_id is null then
        return '[]'::jsonb;
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'archive_month', a.archive_month, 'scope', a.scope,
            'business_id', a.business_id, 'business_name', a.business_name,
            'summary', a.summary, 'archived_at', a.archived_at
        ) order by a.archive_month desc)
          from public.click_monthly_archives a
         where a.scope = 'business' and a.business_id = v_biz_id
    ), '[]'::jsonb);
end;
$$;


--
-- Name: wg_listing_slug_base(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_listing_slug_base(title text, community text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
    t text := coalesce(public.wg_slugify(title, 60), 'listing');
    c text := public.wg_slugify(community, 30);
begin
    if c is null or c = 'east-gwillimbury' and t like '%east-gwillimbury%' or t = c or t like '%-' || c then
        return t;
    end if;
    return t || '-' || c;
end;
$$;


--
-- Name: wg_my_business_report(date, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_my_business_report(from_input date, to_input date, business_id_input uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_is_staff boolean := public.wg_is_trusted_caller();
    b public.directory_listings%rowtype;
    v_has_biz boolean := false;
    d_to date := least(coalesce(to_input, (now() at time zone 'America/Toronto')::date),
                       (now() at time zone 'America/Toronto')::date);
    d_from date;
    v_from timestamptz;
    v_to timestamptz;
begin
    if v_is_staff then
        if business_id_input is not null then
            select d.* into b from public.directory_listings d where d.id = business_id_input;
            v_has_biz := found;
        end if;
    else
        select d.* into b
          from public.business_accounts a
          join public.directory_listings d on d.id = a.business_id
         where a.user_id = auth.uid();
        if not found then
            return jsonb_build_object('linked', false, 'viewer_role', 'merchant');
        end if;
        v_has_biz := true;
    end if;

    d_from := greatest(coalesce(from_input, d_to - 29), d_to - 365);
    if d_from > d_to then d_from := d_to; end if;
    v_from := d_from::timestamp at time zone 'America/Toronto';
    v_to := (d_to + 1)::timestamp at time zone 'America/Toronto';

    return (
        with spots as (
            select s.* from public.search_sponsors s
             where (not v_has_biz) or s.business_id = b.id
        ), listings as (
            select e.id from public.vendor_events e
             where (not v_has_biz) or lower(btrim(e.business_name)) = lower(btrim(b.name))
        ), raw_c as (
            select k.*,
                   (k.clicked_at at time zone 'America/Toronto')::date as day,
                   to_char(k.clicked_at at time zone 'America/Toronto', 'YYYY-MM') as month,
                   (k.item_kind in ('search_sponsor', 'search_result', 'search')
                    or coalesce(k.page, '') in ('home-search', 'discovery', 'search', 'search-results')) as is_search
              from public.link_clicks k
             where k.clicked_at >= v_from and k.clicked_at < v_to
               and not (coalesce(k.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)'
                     or coalesce(k.target_url, '') ~* '(/staff/|/admin(/|$|\?)|/hamper/admin\.html)')
               and (
                   (not v_has_biz)
                   or (k.item_kind = 'search_sponsor' and k.item_id in (select id from spots))
                   or (k.item_kind = 'directory' and k.item_id = b.id)
                   or (k.item_kind = 'listing' and k.item_id in (select id from listings))
                   or (k.item_kind = 'search_result' and (k.item_id = b.id or k.item_id in (select id from listings) or lower(btrim(k.source_name)) = lower(btrim(b.name))))
                   or (k.item_kind is null and lower(btrim(k.source_name)) = lower(btrim(b.name)))
               )
        ), imp as (
            select (i.viewed_at at time zone 'America/Toronto')::date as day,
                   to_char(i.viewed_at at time zone 'America/Toronto', 'YYYY-MM') as month,
                   i.sponsor_id
              from public.sponsor_impressions i
             where i.viewed_at >= v_from and i.viewed_at < v_to
               and i.sponsor_id in (select id from spots)
               and not (coalesce(i.page, '') ~* '(^|/|_|-)(staff|admin|hamper-admin)(/|$|_|-)')
        )
        select jsonb_build_object(
            'linked', true,
            'viewer_role', case when v_is_staff then 'admin' else 'merchant' end,
            'business', case when v_has_biz
                then jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug)
                else jsonb_build_object('id', null, 'name', 'All Businesses (Site Overview)', 'slug', null)
            end,
            'businesses_list', case when v_is_staff then coalesce((
                select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'slug', d.slug) order by d.name)
                  from public.directory_listings d
                 where d.status = 'approved'
            ), '[]'::jsonb) else '[]'::jsonb end,
            'from', d_from, 'to', d_to,
            'totals', jsonb_build_object(
                'total_clicks', (select count(*) from raw_c),
                'search_clicks', (select count(*) from raw_c where is_search),
                'sponsored_clicks', (select count(*) from raw_c where item_kind = 'search_sponsor'),
                'sponsored_impressions', (select count(*) from imp),
                'sponsored_ctr', (
                    case when (select count(*) from imp) > 0
                         then round(((select count(*)::numeric from raw_c where item_kind = 'search_sponsor') / (select count(*)::numeric from imp)) * 100.0, 1)
                         else 0.0 end
                ),
                'sponsored', (select count(*) from raw_c where item_kind = 'search_sponsor'),
                'business_page', (select count(*) from raw_c where not is_search and item_kind = 'directory'),
                'listings', (select count(*) from raw_c where not is_search and item_kind = 'listing'),
                'newsletter', (select count(*) from raw_c where not is_search and item_kind is null)
            ),
            'spots', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'id', s.id, 'keyword', s.keyword, 'target_kind', s.target_kind,
                           'search_query', s.search_query, 'website_url', s.website_url,
                           'starts_at', s.starts_at, 'ends_at', s.ends_at, 'active', s.active,
                           'impressions', (select count(*) from imp where imp.sponsor_id = s.id),
                           'clicks', (select count(*) from raw_c where raw_c.item_kind = 'search_sponsor' and raw_c.item_id = s.id),
                           'ctr', case when (select count(*) from imp where imp.sponsor_id = s.id) > 0
                                then round(((select count(*)::numeric from raw_c where raw_c.item_kind = 'search_sponsor' and raw_c.item_id = s.id) /
                                            (select count(*)::numeric from imp where imp.sponsor_id = s.id)) * 100.0, 1)
                                else 0.0 end)
                       order by s.starts_at desc)
                  from spots s), '[]'::jsonb),
            'search_items', coalesce((
                select jsonb_agg(item order by (item->>'clicks')::int desc)
                  from (
                      select jsonb_build_object(
                                 'title', article_title,
                                 'business', source_name,
                                 'kind', coalesce(item_kind, 'search_result'),
                                 'page', min(coalesce(page, 'search-results')),
                                 'target_url', min(target_url),
                                 'clicks', count(*),
                                 'unique_visitors', count(distinct nullif(visitor_hash, '')),
                                 'last_click', max(clicked_at)) as item
                        from raw_c
                       where is_search
                       group by article_title, source_name, item_kind, item_id
                  ) s), '[]'::jsonb),
            'listing_items', coalesce((
                select jsonb_agg(item order by (item->>'clicks')::int desc)
                  from (
                      select jsonb_build_object(
                                 'title', article_title,
                                 'business', source_name,
                                 'kind', coalesce(item_kind, 'newsletter'),
                                 'target_url', min(target_url),
                                 'clicks', count(*),
                                 'unique_visitors', count(distinct nullif(visitor_hash, '')),
                                 'last_click', max(clicked_at)) as item
                        from raw_c
                       where not is_search
                       group by article_title, source_name, item_kind, item_id
                  ) l), '[]'::jsonb),
            'daily', (
                select jsonb_agg(jsonb_build_object(
                           'day', g::date,
                           'search_clicks', (select count(*) from raw_c where raw_c.day = g::date and is_search),
                           'sponsored_clicks', (select count(*) from raw_c where raw_c.day = g::date and item_kind = 'search_sponsor'),
                           'sponsored_impressions', (select count(*) from imp where imp.day = g::date),
                           'sponsored', (select count(*) from raw_c where raw_c.day = g::date and item_kind = 'search_sponsor'),
                           'business_page', (select count(*) from raw_c where raw_c.day = g::date and not is_search and item_kind = 'directory'),
                           'listings', (select count(*) from raw_c where raw_c.day = g::date and not is_search and item_kind = 'listing'),
                           'newsletter', (select count(*) from raw_c where raw_c.day = g::date and not is_search and item_kind is null))
                       order by g)
                  from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') g),
            'monthly', coalesce((
                select jsonb_agg(jsonb_build_object(
                           'month', m,
                           'search_clicks', (select count(*) from raw_c where raw_c.month = m and is_search),
                           'sponsored_clicks', (select count(*) from raw_c where raw_c.month = m and item_kind = 'search_sponsor'),
                           'sponsored_impressions', (select count(*) from imp where imp.month = m),
                           'business_page', (select count(*) from raw_c where raw_c.month = m and not is_search and item_kind = 'directory'),
                           'listings', (select count(*) from raw_c where raw_c.month = m and not is_search and item_kind = 'listing'),
                           'newsletter', (select count(*) from raw_c where raw_c.month = m and not is_search and item_kind is null))
                       order by m)
                  from (
                      select distinct to_char(g::date, 'YYYY-MM') as m
                        from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') g
                  ) ms), '[]'::jsonb)
        )
    );
end;
$_$;


--
-- Name: wg_my_click_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_my_click_counts() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
    if v_email = '' then
        raise exception 'Please sign in first.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_object_agg(e.id::text, jsonb_build_object(
                   'clicks', coalesce(c.clicks, 0),
                   'unique_visitors', coalesce(c.uniq, 0),
                   'views', coalesce(e.view_count, 0)))
          from public.vendor_events e
          left join (select item_id, count(*) as clicks, count(distinct nullif(visitor_hash, '')) as uniq
                       from public.link_clicks
                      where item_kind = 'listing'
                      group by item_id) c on c.item_id = e.id
         where lower(e.submitter_email) = v_email), '{}'::jsonb);
end;
$$;


--
-- Name: wg_newsletter_guard_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_newsletter_guard_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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


--
-- Name: wg_public_spotlights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_public_spotlights() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
    select jsonb_build_object(
        'current_ids', coalesce((
            select jsonb_agg(sub.listing_id)
              from (
                  select s.listing_id
                    from public.spotlight_schedule s
                    join public.vendor_events v on v.id = s.listing_id and v.status = 'approved'
                   where s.active
                     and now() >= s.starts_at
                     and now() < s.ends_at
                   order by s.priority desc, s.starts_at desc, s.created_at desc
              ) sub
        ), '[]'::jsonb),
        'past_ids', coalesce((
            select jsonb_agg(sub.listing_id)
              from (
                  select distinct on (s.listing_id) s.listing_id, s.ends_at
                    from public.spotlight_schedule s
                    join public.vendor_events v on v.id = s.listing_id and v.status = 'approved'
                   where s.ends_at <= now()
                     and s.ends_at >= (now() - interval '13 months')
                   order by s.listing_id, s.ends_at desc
              ) sub
        ), '[]'::jsonb)
    );
$$;


--
-- Name: wg_record_gallery_ad_event(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_record_gallery_ad_event(p_photo_id uuid, p_event_type text DEFAULT 'click'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_photo_id is null then
    return;
  end if;
  if lower(coalesce(p_event_type, '')) = 'impression' then
    update public.home_gallery
      set impressions = coalesce(impressions, 0) + 1
      where id = p_photo_id and active = true;
  else
    update public.home_gallery
      set clicks = coalesce(clicks, 0) + 1
      where id = p_photo_id and active = true;
  end if;
end;
$$;


--
-- Name: wg_record_search_click(text, text, text, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_record_search_click(query_input text, title_input text DEFAULT NULL::text, business_input text DEFAULT NULL::text, item_id_input uuid DEFAULT NULL::uuid, target_url_input text DEFAULT NULL::text, page_input text DEFAULT 'search-results'::text, visitor_input text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_q text := left(btrim(coalesce(query_input, '')), 120);
    v_title text := left(nullif(btrim(coalesce(title_input, '')), ''), 300);
    v_biz text := left(coalesce(nullif(btrim(coalesce(business_input, '')), ''), 'Search Results'), 200);
    v_url text := left(coalesce(nullif(btrim(coalesce(target_url_input, '')), ''), '/discovery?q=' || replace(v_q, ' ', '+')), 2000);
    v_page text := left(coalesce(nullif(btrim(coalesce(page_input, '')), ''), 'search-results'), 60);
    v_visitor text := left(coalesce(visitor_input, ''), 64);
    v_ip text := public.wg_click_ip_hash();
    v_resolved_biz text;
begin
    if v_q = '' and v_title is null then
        return false;
    end if;

    -- Only permit relative paths (/...) or http(s):// URLs
    if v_url !~* '^(/($|[^/])|https?://[^/@\s]+)' or v_url ~ '[\s\x00-\x1f]' then
        v_url := '/discovery?q=' || replace(v_q, ' ', '+');
    end if;

    if public.wg_is_admin_page(v_page, v_url) then
        return false;
    end if;

    -- Derive source_name server-side when item_id_input is supplied
    if item_id_input is not null then
        select d.name into v_resolved_biz
        from public.directory_listings d
        where d.id = item_id_input and d.status = 'approved'
        limit 1;

        if v_resolved_biz is null then
            select coalesce(nullif(btrim(e.business_name), ''), e.title) into v_resolved_biz
            from public.vendor_events e
            where e.id = item_id_input and e.status = 'approved'
            limit 1;
        end if;

        if v_resolved_biz is not null then
            v_biz := left(v_resolved_biz, 200);
        else
            v_biz := 'Search Results';
        end if;
    end if;

    -- Rate limit per IP (or global fallback when IP hash is null)
    if v_ip is not null then
        if (
            select count(*) from public.link_clicks
             where ip_hash = v_ip and item_kind = 'search_result'
               and clicked_at > now() - interval '1 minute'
        ) >= 30 then
            return false;
        end if;
    else
        if (
            select count(*) from public.link_clicks
             where ip_hash is null and item_kind = 'search_result'
               and clicked_at > now() - interval '1 minute'
        ) >= 60 then
            return false;
        end if;
    end if;

    -- Deduplicate same search click within 30 seconds
    if (v_visitor <> '' and exists (
        select 1 from public.link_clicks
         where item_kind = 'search_result'
           and visitor_hash = v_visitor
           and article_title = coalesce(v_title, 'Search: ' || v_q)
           and clicked_at > now() - interval '30 seconds'
    )) then
        return false;
    end if;

    insert into public.link_clicks (
        issue_date, article_title, source_name, category, target_url,
        visitor_hash, user_agent, item_kind, item_id, page, ip_hash
    ) values (
        to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
        coalesce(v_title, 'Search: ' || v_q),
        v_biz,
        'search_results',
        v_url,
        v_visitor,
        '',
        'search_result',
        item_id_input,
        v_page,
        v_ip
    );
    return true;
end;
$_$;


--
-- Name: wg_record_sponsor_click(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_record_sponsor_click(id_input uuid, page_input text DEFAULT NULL::text, visitor_input text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

    if not public.wg_is_admin_page(v_page, v_dest)
       and public.wg_click_should_count(id_input, v_visitor, v_ip) then
        insert into public.link_clicks (issue_date, article_title, source_name, category, target_url,
                                        visitor_hash, user_agent, item_kind, item_id, page, ip_hash)
        values (to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
                left('Quick search: ' || btrim(s.keyword), 300), left(btrim(s.sponsor_name), 200),
                'search_sponsor', left(v_dest, 2000), v_visitor, '', 'search_sponsor', id_input,
                coalesce(v_page, 'home-search'), v_ip);
    end if;

    return case when s.target_kind = 'website' then v_dest else '' end;
end;
$$;


--
-- Name: wg_record_sponsor_impressions(uuid[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_record_sponsor_impressions(ids_input uuid[], page_input text DEFAULT NULL::text, visitor_input text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    v_visitor text := left(coalesce(visitor_input, ''), 64);
    v_page text := left(nullif(btrim(coalesce(page_input, '')), ''), 60);
    v_ip text := public.wg_click_ip_hash();
    v_id uuid;
    v_count integer := 0;
begin
    if ids_input is null or array_length(ids_input, 1) is null then
        return 0;
    end if;
    if public.wg_is_admin_page(v_page) then
        return 0;
    end if;

    foreach v_id in array ids_input[1:10] loop
        if exists (
            select 1 from public.search_sponsors
             where id = v_id and active and now() >= starts_at and now() < ends_at
        ) then
            if (v_ip is not null and not exists (
                select 1 from public.sponsor_impressions
                 where sponsor_id = v_id and ip_hash = v_ip
                   and viewed_at > now() - interval '30 minutes'
            ) and (select count(*) from public.sponsor_impressions
                    where ip_hash = v_ip and viewed_at > now() - interval '1 hour') < 120)
            or (v_ip is null and (v_visitor = '' or not exists (
                select 1 from public.sponsor_impressions
                 where sponsor_id = v_id and visitor_hash = v_visitor
                   and viewed_at > now() - interval '30 minutes'
            ))) then
                insert into public.sponsor_impressions (
                    sponsor_id, impression_date, viewed_at, page, visitor_hash, ip_hash
                ) values (
                    v_id, (now() at time zone 'America/Toronto')::date, now(),
                    coalesce(v_page, 'home-search'), v_visitor, coalesce(v_ip, '')
                );
                v_count := v_count + 1;
            end if;
        end if;
    end loop;

    return v_count;
end;
$$;


--
-- Name: wg_search_sponsor_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_search_sponsor_report() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(r order by r ->> 'starts_at' desc)
          from (select jsonb_build_object(
                       'id', s.id,
                       'clicks', count(distinct c.id),
                       'unique_visitors', count(distinct nullif(c.visitor_hash, '')),
                       'clicks_7d', count(distinct c.id) filter (where c.clicked_at > now() - interval '7 days'),
                       'last_click', max(c.clicked_at),
                       'impressions', count(distinct i.id),
                       'impressions_7d', count(distinct i.id) filter (where i.viewed_at > now() - interval '7 days'),
                       'last_impression', max(i.viewed_at),
                       'ctr', case when count(distinct i.id) > 0
                                   then round((count(distinct c.id)::numeric / count(distinct i.id)::numeric) * 100.0, 1)
                                   else 0.0 end,
                       'starts_at', s.starts_at) as r
                  from public.search_sponsors s
                  left join public.link_clicks c on c.item_kind = 'search_sponsor' and c.item_id = s.id
                  left join public.sponsor_impressions i on i.sponsor_id = s.id
                 group by s.id, s.starts_at) x), '[]'::jsonb);
end;
$$;


--
-- Name: wg_search_sponsors_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_search_sponsors_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
    new.updated_at := now();
    return new;
end;
$$;


--
-- Name: wg_slugify(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_slugify(input text, max_len integer DEFAULT 60) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
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


--
-- Name: wg_spotlight_schedule_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_spotlight_schedule_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
    new.updated_at := now();
    return new;
end;
$$;


--
-- Name: wg_submit_business_claim(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_submit_business_claim(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
    v_biz_id uuid;
    v_name text := left(trim(coalesce(p->>'claimant_name', '')), 120);
    v_role text := left(coalesce(nullif(trim(coalesce(p->>'claimant_role', '')), ''), 'Owner'), 80);
    v_email text := left(lower(trim(coalesce(p->>'claimant_email', ''))), 254);
    v_phone text := left(nullif(trim(coalesce(p->>'claimant_phone', '')), ''), 40);
    v_req_method text := coalesce(nullif(trim(coalesce(p->>'verification_method', '')), ''), 'phone_call');
    v_method text;
    v_proof text := nullif(trim(coalesce(p->>'proof_path', '')), '');
    v_notes text := left(nullif(trim(coalesce(p->>'notes', '')), ''), 1000);
    v_biz record;
    v_email_domain text;
    v_site_host text;
    v_domain_match boolean := false;
    v_already_claimed boolean := false;
    v_token text;
    v_claim_id uuid;
begin
    begin
        v_biz_id := nullif(trim(coalesce(p->>'business_id', '')), '')::uuid;
    exception when invalid_text_representation then
        v_biz_id := null;
    end;
    if v_biz_id is null or length(v_name) < 2 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'error', 'Please enter your name and a valid email address.');
    end if;

    if v_proof is not null and v_proof !~* '^claims/[0-9a-f-]+/[0-9a-f-]+\.(pdf|jpg|jpeg|png|webp)$' then
        return jsonb_build_object('success', false, 'error', 'Invalid verification document path.');
    end if;

    -- Rate limit: max 5 claims per business in the last hour
    if (
        select count(*) from public.business_claims
        where business_id = v_biz_id
          and created_at > now() - interval '1 hour'
    ) >= 5 then
        return jsonb_build_object('success', false, 'error', 'Too many claim requests for this business. Please try again later.');
    end if;

    select id, name, link, status into v_biz
    from public.directory_listings
    where id = v_biz_id and status = 'approved'
    limit 1;

    if v_biz.id is null then
        return jsonb_build_object('success', false, 'error', 'This business listing was not found.');
    end if;

    select exists(select 1 from public.business_accounts where business_id = v_biz_id) into v_already_claimed;

    if exists (
        select 1 from public.business_claims
        where business_id = v_biz_id
          and lower(claimant_email) = v_email
          and status in ('pending_verification', 'pending')
    ) then
        return jsonb_build_object('success', false, 'error', 'A claim for this business with that email is already pending.');
    end if;

    v_email_domain := split_part(v_email, '@', 2);
    if v_biz.link is not null and v_biz.link ~* '^https?://' then
        v_site_host := lower(
            regexp_replace(
                regexp_replace(
                    regexp_replace(v_biz.link, '^https?://([^@/]+@)?(www\.)?', '', 'i'),
                    '[:/?#].*$', ''
                ),
                '\s+', '', 'g'
            )
        );
        if v_site_host <> '' and v_site_host not like '%welcomeeg.ca%' and (v_email_domain = v_site_host or v_email_domain like '%.' || v_site_host) then
            v_domain_match := true;
        end if;
    end if;

    -- Compute verification_method server-side
    if v_domain_match then
        v_method := 'domain_email';
    elsif v_req_method = 'document_upload' and v_proof is not null then
        v_method := 'document_upload';
    else
        v_method := 'phone_call';
    end if;

    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    insert into public.business_claims (
        business_id, business_name, claimant_name, claimant_role, claimant_email,
        claimant_phone, verification_method, domain_matched, already_claimed,
        proof_path, notes, verify_token, verify_token_expires_at, status
    ) values (
        v_biz.id, v_biz.name, v_name, v_role, v_email,
        v_phone, v_method, v_domain_match, v_already_claimed,
        v_proof, v_notes, v_token, now() + interval '48 hours', 'pending_verification'
    )
    returning id into v_claim_id;

    return jsonb_build_object(
        'success', true,
        'id', v_claim_id,
        'domain_matched', v_domain_match,
        'already_claimed', v_already_claimed
    );
end;
$_$;


--
-- Name: wg_track_click(text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_track_click(kind_input text, id_input uuid, page_input text DEFAULT NULL::text, visitor_input text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    v_url text;
    v_title text;
    v_business text;
    v_category text;
    v_visitor text := left(coalesce(visitor_input, ''), 64);
    v_page text := left(nullif(btrim(coalesce(page_input, '')), ''), 60);
    v_ip text := public.wg_click_ip_hash();
begin
    if kind_input = 'listing' then
        select e.link, e.title, e.business_name, coalesce(e.category, 'listing')
          into v_url, v_title, v_business, v_category
          from public.vendor_events e
         where e.id = id_input and e.status = 'approved';
    elsif kind_input = 'directory' then
        select d.link, d.name, d.name, 'directory'
          into v_url, v_title, v_business, v_category
          from public.directory_listings d
         where d.id = id_input and d.status = 'approved';
    elsif kind_input = 'hamper_offer' then
        select o.merchant_website, o.offer_title, o.merchant_name, 'hamper_offer'
          into v_url, v_title, v_business, v_category
          from public.hamper_offers o
         where o.id = id_input;
    else
        return null;
    end if;

    v_url := btrim(coalesce(v_url, ''));
    if v_url ~* '^www\.' then
        v_url := 'https://' || v_url;
    end if;
    if v_url !~* '^https?://[^/@\s]+' or v_url ~ '\s' then
        return null;
    end if;

    -- Never track clicks triggered from admin/staff pages (still return destination URL)
    if not public.wg_is_admin_page(v_page, v_url)
       and public.wg_click_should_count(id_input, v_visitor, v_ip) then
        insert into public.link_clicks (issue_date, article_title, source_name, category, target_url,
                                        visitor_hash, user_agent, item_kind, item_id, page, ip_hash)
        values (to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD'),
                left(coalesce(v_title, ''), 300), left(coalesce(nullif(v_business, ''), 'Welcome East Gwillimbury'), 200),
                left(v_category, 80), left(v_url, 2000), v_visitor, '', kind_input, id_input, v_page, v_ip);
    end if;
    return v_url;
end;
$$;


--
-- Name: wg_unique_directory_slug(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_unique_directory_slug(base text, self_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: wg_unique_listing_slug(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_unique_listing_slug(base text, self_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: wg_unsubscribe_tokens_for(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_unsubscribe_tokens_for(emails_input text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
    result jsonb;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    insert into public.wg_unsubscribe_tokens (email)
    select distinct lower(btrim(e))
    from unnest(coalesce(emails_input, '{}'::text[])) e
    where position('@' in coalesce(e, '')) > 1
    on conflict (email) do nothing;

    select coalesce(jsonb_object_agg(t.email, t.token::text), '{}'::jsonb) into result
    from public.wg_unsubscribe_tokens t
    where t.email in (select lower(btrim(e)) from unnest(coalesce(emails_input, '{}'::text[])) e);

    return result;
end;
$$;


--
-- Name: wg_vendor_events_guard_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_vendor_events_guard_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
            new.link := 'https://welcomeeg.ca/events';
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


--
-- Name: wg_vendor_events_set_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wg_vendor_events_set_slug() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    user_name text NOT NULL,
    user_email text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    activity_type text NOT NULL,
    outcome text,
    notes text NOT NULL,
    next_followup_date date,
    meeting_date timestamp with time zone,
    meeting_title text DEFAULT ''::text,
    meeting_type text DEFAULT 'Phone Call'::text,
    meeting_status text DEFAULT 'scheduled'::text,
    CONSTRAINT activity_logs_activity_type_check CHECK ((activity_type = ANY (ARRAY['Phone Call'::text, 'Follow-up Email'::text, 'In-Person Visit'::text, 'Note'::text, 'Status Change'::text]))),
    CONSTRAINT activity_logs_target_type_check CHECK ((target_type = ANY (ARRAY['partner'::text, 'claim'::text])))
);


--
-- Name: ad_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_type text NOT NULL,
    plan text NOT NULL,
    sponsor_name text NOT NULL,
    contact_email text NOT NULL,
    headline text,
    body_text text,
    image_data_url text,
    target_type text DEFAULT 'external'::text NOT NULL,
    target_url text NOT NULL,
    edition text DEFAULT 'both'::text,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    stripe_session_id text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_subscription_id text,
    CONSTRAINT ad_orders_ad_type_check CHECK ((ad_type = ANY (ARRAY['gallery'::text, 'newsletter'::text]))),
    CONSTRAINT ad_orders_edition_check CHECK ((edition = ANY (ARRAY['monday'::text, 'thursday'::text, 'both'::text]))),
    CONSTRAINT ad_orders_plan_check CHECK ((plan = ANY (ARRAY['gallery_weekly'::text, 'gallery_monthly'::text, 'newsletter_single'::text, 'newsletter_four_pack'::text]))),
    CONSTRAINT ad_orders_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'paid'::text, 'active'::text, 'cancelled'::text]))),
    CONSTRAINT ad_orders_target_type_check CHECK ((target_type = ANY (ARRAY['external'::text, 'listing'::text, 'business_page'::text])))
);


--
-- Name: link_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.link_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    issue_date text NOT NULL,
    article_title text NOT NULL,
    source_name text DEFAULT 'Welcome East Gwillimbury'::text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    target_url text NOT NULL,
    visitor_hash text DEFAULT ''::text,
    user_agent text DEFAULT ''::text,
    clicked_at timestamp with time zone DEFAULT now() NOT NULL,
    item_kind text,
    item_id uuid,
    page text,
    ip_hash text
);


--
-- Name: advertiser_click_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.advertiser_click_summary WITH (security_invoker='true') AS
 SELECT issue_date,
    source_name,
    article_title,
    category,
    target_url,
    count(*) AS total_clicks,
    count(DISTINCT NULLIF(visitor_hash, ''::text)) AS unique_visitors,
    max(clicked_at) AS last_clicked_at
   FROM public.link_clicks
  GROUP BY issue_date, source_name, article_title, category, target_url
  ORDER BY (max(clicked_at)) DESC, (count(*)) DESC;


--
-- Name: business_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_accounts (
    user_id uuid NOT NULL,
    business_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid()
);


--
-- Name: business_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    business_name text NOT NULL,
    claimant_name text NOT NULL,
    claimant_role text DEFAULT 'Owner'::text NOT NULL,
    claimant_email text NOT NULL,
    claimant_phone text,
    verification_method text DEFAULT 'phone_call'::text NOT NULL,
    domain_matched boolean DEFAULT false NOT NULL,
    already_claimed boolean DEFAULT false NOT NULL,
    proof_path text,
    notes text,
    verify_token text NOT NULL,
    verified_at timestamp with time zone,
    status text DEFAULT 'pending_verification'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verify_token_expires_at timestamp with time zone,
    verify_sent_at timestamp with time zone,
    verify_send_count integer DEFAULT 0 NOT NULL
);


--
-- Name: claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_type text NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    address text NOT NULL,
    interests text,
    family_size integer,
    date text NOT NULL,
    business_description text,
    join_newsletter boolean DEFAULT false,
    status text DEFAULT 'New'::text,
    assigned_to uuid,
    assigned_name text,
    assigned_at timestamp with time zone,
    categories text[] DEFAULT '{}'::text[],
    logo_url text DEFAULT ''::text,
    qr_code_url text DEFAULT ''::text,
    storefront_image_url text DEFAULT ''::text,
    interior_image_url text DEFAULT ''::text,
    staff_image_url text DEFAULT ''::text,
    owner_image_url text DEFAULT ''::text,
    product_images text[] DEFAULT '{}'::text[],
    verification_status text DEFAULT 'pending_verification'::text,
    verified_at timestamp with time zone,
    verified_by uuid,
    first_name text,
    last_name text,
    business_name text,
    street_address text,
    unit text,
    city text DEFAULT 'East Gwillimbury'::text,
    province text DEFAULT 'Ontario'::text,
    postal_code text,
    email_confirmed boolean DEFAULT false,
    confirmation_token text DEFAULT (gen_random_uuid())::text,
    confirmed_at timestamp with time zone
);


--
-- Name: click_monthly_archives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.click_monthly_archives (
    id bigint NOT NULL,
    archive_month text NOT NULL,
    scope text NOT NULL,
    business_id uuid,
    business_name text DEFAULT ''::text NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    by_business jsonb DEFAULT '[]'::jsonb NOT NULL,
    by_item jsonb DEFAULT '[]'::jsonb NOT NULL,
    by_search jsonb DEFAULT '[]'::jsonb NOT NULL,
    by_day jsonb DEFAULT '[]'::jsonb NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT click_monthly_archives_archive_month_check CHECK ((archive_month ~ '^\d{4}-\d{2}$'::text)),
    CONSTRAINT click_monthly_archives_scope_check CHECK ((scope = ANY (ARRAY['site'::text, 'business'::text])))
);


--
-- Name: click_monthly_archives_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.click_monthly_archives ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.click_monthly_archives_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    partner_id uuid,
    partner_name text NOT NULL,
    offer_title text NOT NULL,
    offer_description text,
    terms text,
    status text DEFAULT 'available'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval),
    redeemed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    target_audience text DEFAULT 'Business to Resident'::text,
    CONSTRAINT coupons_status_check CHECK ((status = ANY (ARRAY['available'::text, 'redeemed'::text, 'expired'::text, 'voided'::text])))
);


--
-- Name: directory_listing_admin_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_listing_admin_notes (
    business_id uuid NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: directory_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'Local Business'::text NOT NULL,
    community text DEFAULT 'Keswick'::text NOT NULL,
    location text NOT NULL,
    link text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    status text DEFAULT 'approved'::text NOT NULL,
    source text DEFAULT 'curated'::text NOT NULL,
    listing_type text DEFAULT 'business'::text NOT NULL,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    slug text,
    old_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    image_url text,
    google_place_id text
);


--
-- Name: discovery_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    session_key text NOT NULL,
    intent text,
    community text,
    source_page text,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    lead_id uuid,
    status text DEFAULT 'open'::text NOT NULL,
    admin_notes text,
    replied_at timestamp with time zone,
    CONSTRAINT discovery_conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'replied'::text, 'archived'::text])))
);


--
-- Name: discovery_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_type text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    business_name text,
    message text NOT NULL,
    consent_to_contact boolean DEFAULT false NOT NULL,
    contact_consent_at timestamp with time zone DEFAULT now() NOT NULL,
    newsletter_opt_in boolean DEFAULT false NOT NULL,
    newsletter_consent_at timestamp with time zone,
    source_page text,
    status text DEFAULT 'new'::text NOT NULL,
    conversation_id uuid,
    admin_reply text,
    replied_at timestamp with time zone,
    replied_by text,
    CONSTRAINT discovery_leads_consent_to_contact_check CHECK ((consent_to_contact = true)),
    CONSTRAINT discovery_leads_lead_type_check CHECK ((lead_type = ANY (ARRAY['resident'::text, 'business'::text, 'sponsor'::text, 'hamper'::text, 'general'::text]))),
    CONSTRAINT discovery_leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'replied'::text, 'contacted'::text, 'archived'::text])))
);


--
-- Name: discovery_metrics_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_metrics_daily (
    metric_date date DEFAULT ((now() AT TIME ZONE 'America/Toronto'::text))::date NOT NULL,
    intent text NOT NULL,
    community text DEFAULT 'all'::text NOT NULL,
    result_count_bucket text DEFAULT '0'::text NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    ai_calls integer DEFAULT 0 NOT NULL,
    fallback_calls integer DEFAULT 0 NOT NULL,
    lead_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,4) DEFAULT 0 NOT NULL
);


--
-- Name: discovery_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_rate_limits (
    bucket_key text NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL
);


--
-- Name: hamper_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hamper_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_name text NOT NULL,
    merchant_email text NOT NULL,
    offer_title text NOT NULL,
    offer_details text,
    terms text,
    community text,
    active boolean DEFAULT true NOT NULL,
    valid_until date,
    merchant_website text
);


--
-- Name: press_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.press_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    excerpt text,
    image_url text,
    content text NOT NULL,
    business_name text NOT NULL,
    business_address text NOT NULL,
    business_phone text NOT NULL,
    business_website text,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    summary text,
    image_alt text,
    image_caption text,
    CONSTRAINT press_articles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: discovery_search_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.discovery_search_view AS
 SELECT (e.id)::text AS record_id,
        CASE
            WHEN (lower(COALESCE(e.category, ''::text)) = ANY (ARRAY['local_news'::text, 'municipal_news'::text, 'news'::text, 'past_events'::text, 'article'::text, 'press'::text])) THEN 'news'::text
            WHEN (lower(COALESCE(e.category, ''::text)) = ANY (ARRAY['dining'::text, 'restaurant'::text, 'food_and_drink'::text, 'dining_deals'::text])) THEN 'dining'::text
            WHEN ((lower(COALESCE(e.category, ''::text)) = ANY (ARRAY['special_sale'::text, 'retail_sale'::text, 'sale'::text, 'sales'::text, 'local_sales'::text, 'sales_deal'::text])) OR (e.title ~* '^\s*\[sale\]'::text)) THEN 'offer'::text
            ELSE 'event'::text
        END AS record_type,
    e.title,
    e.business_name,
    e.summary,
    COALESCE(NULLIF(btrim(e.location), ''::text), 'East Gwillimbury, ON'::text) AS location,
        CASE
            WHEN (COALESCE(e.location, ''::text) ~* 'out of area'::text) THEN 'Out of Area'::text
            WHEN (COALESCE(e.location, ''::text) ~* '\m(holland\s+landing|mount\s+albert|queensville|sharon|river\s+drive\s+park|river\s+drive|holt|franklin|brown\s+hill|ravenshoe)\M'::text) THEN initcap(COALESCE((regexp_match(e.location, '\m(holland\s+landing|mount\s+albert|queensville|sharon|river\s+drive\s+park|river\s+drive|holt|franklin|brown\s+hill|ravenshoe)\M'::text, 'i'::text))[1], 'East Gwillimbury'::text))
            ELSE 'East Gwillimbury'::text
        END AS community,
    (COALESCE(e.location, ''::text) ~* 'out of area'::text) AS is_out_of_area,
    COALESCE(e.category, 'community_events'::text) AS category,
    (COALESCE(e.price_text, ''::text) ~* '^\s*(free|\$?0(\.00)?)\s*$'::text) AS is_free,
    NULLIF(btrim(e.price_text), ''::text) AS price_label,
    e.event_start_date AS starts_at,
    e.expires_after,
    e.event_date_label AS date_label,
    e.recurrence_rule,
        CASE
            WHEN (lower(COALESCE(e.category, ''::text)) = ANY (ARRAY['dining'::text, 'restaurant'::text, 'food_and_drink'::text, 'dining_deals'::text])) THEN ('/dining/'::text || COALESCE(NULLIF(e.slug, ''::text), (e.id)::text))
            WHEN (lower(COALESCE(e.category, ''::text)) = ANY (ARRAY['special_sale'::text, 'retail_sale'::text, 'sale'::text, 'sales'::text, 'local_sales'::text, 'sales_deal'::text])) THEN ('/sales/'::text || COALESCE(NULLIF(e.slug, ''::text), (e.id)::text))
            WHEN (lower(COALESCE(e.category, ''::text)) = ANY (ARRAY['local_news'::text, 'municipal_news'::text, 'news'::text])) THEN '/newsroom'::text
            ELSE ('/events/'::text || COALESCE(NULLIF(e.slug, ''::text), (e.id)::text))
        END AS site_url,
    e.link AS source_url,
    e.created_at AS verified_at
   FROM public.vendor_events e
  WHERE ((e.status = 'approved'::text) AND ((COALESCE(e.expires_after, e.event_start_date) IS NULL) OR (COALESCE(e.expires_after, e.event_start_date) >= ((now() AT TIME ZONE 'America/Toronto'::text))::date)))
UNION ALL
 SELECT (d.id)::text AS record_id,
    'business'::text AS record_type,
    d.name AS title,
    d.name AS business_name,
    COALESCE(NULLIF(btrim(d.notes), ''::text), ((COALESCE(d.category, 'Local Business'::text) || ' in '::text) || COALESCE(d.community, 'East Gwillimbury'::text))) AS summary,
    COALESCE(NULLIF(btrim(d.location), ''::text), (COALESCE(d.community, 'East Gwillimbury'::text) || ', ON'::text)) AS location,
    COALESCE(NULLIF(btrim(d.community), ''::text), 'East Gwillimbury'::text) AS community,
    ((lower(COALESCE(d.community, ''::text)) = 'out of area'::text) OR (COALESCE(d.location, ''::text) ~* 'out of area'::text)) AS is_out_of_area,
    COALESCE(d.category, 'Local Business'::text) AS category,
    false AS is_free,
    NULL::text AS price_label,
    NULL::date AS starts_at,
    NULL::date AS expires_after,
    NULL::text AS date_label,
    NULL::text AS recurrence_rule,
    ('/businesses/'::text || COALESCE(NULLIF(d.slug, ''::text), (d.id)::text)) AS site_url,
    d.link AS source_url,
    d.created_at AS verified_at
   FROM public.directory_listings d
  WHERE (d.status = 'approved'::text)
UNION ALL
 SELECT (h.id)::text AS record_id,
    'hamper'::text AS record_type,
    h.offer_title AS title,
    h.merchant_name AS business_name,
    COALESCE(NULLIF(btrim(h.offer_details), ''::text), h.terms, 'Welcome Hamper local merchant perk'::text) AS summary,
    (COALESCE(NULLIF(btrim(h.community), ''::text), 'East Gwillimbury'::text) || ', ON'::text) AS location,
    COALESCE(NULLIF(btrim(h.community), ''::text), 'East Gwillimbury'::text) AS community,
    false AS is_out_of_area,
    'welcome_hamper'::text AS category,
    true AS is_free,
    'Welcome Hamper Perk'::text AS price_label,
    NULL::date AS starts_at,
    h.valid_until AS expires_after,
        CASE
            WHEN (h.valid_until IS NOT NULL) THEN ('Valid until '::text || (h.valid_until)::text)
            ELSE 'Active Welcome Hamper Offer'::text
        END AS date_label,
    NULL::text AS recurrence_rule,
    '/hamper/'::text AS site_url,
    NULL::text AS source_url,
    h.created_at AS verified_at
   FROM public.hamper_offers h
  WHERE ((h.active = true) AND ((h.valid_until IS NULL) OR (h.valid_until >= ((now() AT TIME ZONE 'America/Toronto'::text))::date)))
UNION ALL
 SELECT (p.id)::text AS record_id,
    'press'::text AS record_type,
    p.title,
    p.business_name,
    COALESCE(NULLIF(btrim(p.summary), ''::text), ('Official press release from '::text || p.business_name)) AS summary,
    COALESCE(NULLIF(btrim(p.business_address), ''::text), 'East Gwillimbury, ON'::text) AS location,
    'East Gwillimbury'::text AS community,
    false AS is_out_of_area,
    'press_release'::text AS category,
    false AS is_free,
    NULL::text AS price_label,
    (p.published_at)::date AS starts_at,
    NULL::date AS expires_after,
    to_char((p.published_at AT TIME ZONE 'America/Toronto'::text), 'Mon DD, YYYY'::text) AS date_label,
    NULL::text AS recurrence_rule,
    ('/press/'::text || COALESCE(NULLIF(p.slug, ''::text), (p.id)::text)) AS site_url,
    p.business_website AS source_url,
    COALESCE(p.published_at, p.created_at) AS verified_at
   FROM public.press_articles p
  WHERE (p.status = 'published'::text);


--
-- Name: editorial_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editorial_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    issue_date date DEFAULT ((now() AT TIME ZONE 'America/Toronto'::text))::date NOT NULL,
    edition_target text DEFAULT 'both'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    original_claim text,
    correction_text text NOT NULL,
    action_taken text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT editorial_corrections_edition_target_check CHECK ((edition_target = ANY (ARRAY['both'::text, 'monday'::text, 'thursday'::text, 'reader'::text, 'vendor'::text]))),
    CONSTRAINT editorial_corrections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'draft'::text, 'archived'::text])))
);


--
-- Name: email_rate_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_rate_log (
    id bigint NOT NULL,
    recipient text NOT NULL,
    form_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_key text
);


--
-- Name: email_rate_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.email_rate_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.email_rate_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: facebook_post_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facebook_post_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_table text NOT NULL,
    source_id text NOT NULL,
    slot text NOT NULL,
    fb_post_id text,
    target_url text NOT NULL,
    caption text,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT facebook_post_log_slot_check CHECK ((slot = ANY (ARRAY['morning'::text, 'midday'::text, 'afternoon'::text, 'manual'::text])))
);


--
-- Name: hamper_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hamper_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    street_address text NOT NULL,
    unit text,
    community text NOT NULL,
    postal_code text NOT NULL,
    move_in_date date NOT NULL,
    household_size integer,
    interests text,
    newsletter_opt_in boolean DEFAULT false NOT NULL,
    proof_type text NOT NULL,
    proof_path text,
    status text DEFAULT 'unverified'::text NOT NULL,
    staff_note text,
    decline_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    coupons_issued_at timestamp with time zone,
    verify_token text,
    verify_token_expires_at timestamp with time zone,
    verify_sent_at timestamp with time zone,
    verify_send_count integer DEFAULT 0 NOT NULL,
    verified_at timestamp with time zone,
    address_key text GENERATED ALWAYS AS (lower(regexp_replace(((((street_address || '|'::text) || COALESCE(unit, ''::text)) || '|'::text) || postal_code), '\s'::text, ''::text, 'g'::text))) STORED,
    proof_deleted_at timestamp with time zone,
    CONSTRAINT hamper_applications_household_size_check CHECK (((household_size >= 1) AND (household_size <= 15))),
    CONSTRAINT hamper_applications_proof_type_check CHECK ((proof_type = ANY (ARRAY['utility_bill'::text, 'lease'::text, 'other'::text, 'phone_call'::text]))),
    CONSTRAINT hamper_applications_status_check CHECK ((status = ANY (ARRAY['unverified'::text, 'review'::text, 'approved'::text, 'declined'::text])))
);


--
-- Name: hamper_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hamper_coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    redeemed_at timestamp with time zone,
    redeemed_by text,
    CONSTRAINT hamper_coupons_code_check CHECK ((code ~ '^WG[A-HJ-NP-Z2-9]{6}$'::text)),
    CONSTRAINT hamper_coupons_status_check CHECK ((status = ANY (ARRAY['available'::text, 'redeemed'::text, 'void'::text])))
);


--
-- Name: home_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.home_gallery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text NOT NULL,
    thumb_url text NOT NULL,
    hover_text text DEFAULT 'Send us your images!'::text NOT NULL,
    highlight boolean DEFAULT false NOT NULL,
    link_url text,
    link_label text,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    is_sponsored boolean DEFAULT false NOT NULL,
    is_complimentary boolean DEFAULT false NOT NULL,
    sponsor_name text,
    clicks integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    stripe_subscription_id text,
    CONSTRAINT home_gallery_image CHECK ((image_url ~ '^https://(www\.|staging\.)?welcomeeg\.ca/gallery/[A-Za-z0-9._-]+\.jpg$'::text)),
    CONSTRAINT home_gallery_label_len CHECK (((link_label IS NULL) OR (char_length(link_label) <= 120))),
    CONSTRAINT home_gallery_link CHECK (((link_url IS NULL) OR (link_url ~ '^/[A-Za-z0-9/_.?=&%-]*$'::text) OR ((link_url ~* '^https?://[^/@\s]+'::text) AND (link_url !~* '^https?://[^/]*@'::text) AND (link_url !~ '\s'::text) AND (char_length(link_url) <= 500)))),
    CONSTRAINT home_gallery_text_len CHECK (((char_length(btrim(hover_text)) >= 1) AND (char_length(btrim(hover_text)) <= 140))),
    CONSTRAINT home_gallery_thumb CHECK ((thumb_url ~ '^https://(www\.|staging\.)?welcomeeg\.ca/gallery/thumbs/[A-Za-z0-9._-]+\.jpg$'::text)),
    CONSTRAINT home_gallery_window CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)))
);


--
-- Name: newsletter_ad_placements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_ad_placements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sponsor_name text NOT NULL,
    headline text NOT NULL,
    body_text text,
    image_url text,
    cta_label text DEFAULT 'Learn More →'::text NOT NULL,
    target_type text DEFAULT 'external'::text NOT NULL,
    target_url text NOT NULL,
    edition text DEFAULT 'both'::text NOT NULL,
    insert_after_index integer DEFAULT 1 NOT NULL,
    sub_order text DEFAULT 'a'::text NOT NULL,
    start_date date,
    end_date date,
    is_complimentary boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_subscription_id text,
    CONSTRAINT newsletter_ad_edition_chk CHECK ((edition = ANY (ARRAY['monday'::text, 'thursday'::text, 'both'::text]))),
    CONSTRAINT newsletter_ad_target_type_chk CHECK ((target_type = ANY (ARRAY['external'::text, 'listing'::text, 'business_page'::text])))
);


--
-- Name: newsletter_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    edition text NOT NULL,
    subject text NOT NULL,
    html_content text NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: newsletter_editions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_editions (
    edition text NOT NULL,
    subject text NOT NULL,
    html_content text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: newsletter_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_settings (
    setting_key text NOT NULL,
    setting_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    business_name text NOT NULL,
    contact_name text NOT NULL,
    contact_email text NOT NULL,
    contact_phone text NOT NULL,
    tier text NOT NULL,
    offer_details text NOT NULL,
    business_description text NOT NULL,
    category text,
    location text,
    status text DEFAULT 'Submitted'::text,
    logo_url text,
    target_audience text,
    join_newsletter boolean DEFAULT false,
    color text,
    assigned_to uuid,
    assigned_name text,
    assigned_at timestamp with time zone,
    categories text[] DEFAULT ARRAY['Vendor (WG)'::text],
    qr_code_url text DEFAULT ''::text,
    storefront_image_url text DEFAULT ''::text,
    interior_image_url text DEFAULT ''::text,
    staff_image_url text DEFAULT ''::text,
    owner_image_url text DEFAULT ''::text,
    product_images text[] DEFAULT '{}'::text[],
    offer_b2c text,
    offer_b2b text,
    street_address text,
    city text DEFAULT 'East Gwillimbury'::text,
    postal_code text,
    slug text,
    sale_headline text,
    sale_discount_badge text,
    sale_start_date date,
    sale_expires_after date,
    latitude double precision,
    longitude double precision,
    view_count integer DEFAULT 0,
    save_count integer DEFAULT 0
);


--
-- Name: presentation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presentation_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    token_code text NOT NULL,
    fallback_code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    partner_id uuid,
    partner_name text NOT NULL,
    offer_title text NOT NULL,
    redeemed_by_merchant_email text,
    redeemed_at timestamp with time zone DEFAULT now(),
    receipt_code text DEFAULT ('REC-'::text || upper("substring"((gen_random_uuid())::text, 1, 8))) NOT NULL
);


--
-- Name: scraped_url_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraped_url_blacklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_url text NOT NULL,
    match_type text DEFAULT 'exact_url'::text NOT NULL,
    source_label text DEFAULT ''::text,
    reason text DEFAULT ''::text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scraped_url_blacklist_match_type_check CHECK ((match_type = ANY (ARRAY['domain'::text, 'exact_url'::text, 'prefix'::text])))
);


--
-- Name: search_sponsor_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_sponsor_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan text NOT NULL,
    keyword text NOT NULL,
    sponsor_name text NOT NULL,
    contact_email text NOT NULL,
    target_kind text NOT NULL,
    website_url text,
    business_id uuid,
    search_query text,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    stripe_session_id text,
    stripe_customer_id text,
    stripe_subscription_id text,
    sponsor_id uuid,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT search_sponsor_orders_business_chk CHECK (((target_kind <> 'business'::text) OR (business_id IS NOT NULL))),
    CONSTRAINT search_sponsor_orders_contact_email_check CHECK (((char_length(btrim(contact_email)) >= 3) AND (char_length(btrim(contact_email)) <= 254))),
    CONSTRAINT search_sponsor_orders_keyword_check CHECK (((char_length(btrim(keyword)) >= 2) AND (char_length(btrim(keyword)) <= 22))),
    CONSTRAINT search_sponsor_orders_plan_check CHECK ((plan = ANY (ARRAY['weekly'::text, 'monthly'::text]))),
    CONSTRAINT search_sponsor_orders_sponsor_name_check CHECK (((char_length(btrim(sponsor_name)) >= 1) AND (char_length(btrim(sponsor_name)) <= 120))),
    CONSTRAINT search_sponsor_orders_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'active'::text, 'cancelled'::text, 'failed'::text]))),
    CONSTRAINT search_sponsor_orders_target_kind_check CHECK ((target_kind = ANY (ARRAY['search'::text, 'website'::text, 'business'::text]))),
    CONSTRAINT search_sponsor_orders_website_chk CHECK (((target_kind <> 'website'::text) OR ((website_url IS NOT NULL) AND (website_url ~* '^https?://'::text))))
);


--
-- Name: search_sponsors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_sponsors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keyword text NOT NULL,
    sponsor_name text NOT NULL,
    target_kind text DEFAULT 'search'::text NOT NULL,
    search_query text,
    website_url text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    business_id uuid,
    stripe_subscription_id text,
    order_id uuid,
    is_complimentary boolean DEFAULT false NOT NULL,
    CONSTRAINT search_sponsors_business_target CHECK (((target_kind <> 'business'::text) OR (business_id IS NOT NULL))),
    CONSTRAINT search_sponsors_keyword_len CHECK (((char_length(btrim(keyword)) >= 2) AND (char_length(btrim(keyword)) <= 90))),
    CONSTRAINT search_sponsors_kind CHECK ((target_kind = ANY (ARRAY['search'::text, 'website'::text, 'business'::text]))),
    CONSTRAINT search_sponsors_name_len CHECK (((char_length(btrim(sponsor_name)) >= 1) AND (char_length(btrim(sponsor_name)) <= 120))),
    CONSTRAINT search_sponsors_notes_len CHECK (((notes IS NULL) OR (char_length(notes) <= 1000))),
    CONSTRAINT search_sponsors_priority CHECK (((priority >= '-100'::integer) AND (priority <= 100))),
    CONSTRAINT search_sponsors_query_len CHECK (((search_query IS NULL) OR (char_length(search_query) <= 80))),
    CONSTRAINT search_sponsors_website CHECK (((target_kind <> 'website'::text) OR ((website_url ~* '^https?://[^/@\s]+'::text) AND (website_url !~* '^https?://[^/]*@'::text) AND (website_url !~ '\s'::text) AND (char_length(website_url) <= 500)))),
    CONSTRAINT search_sponsors_window CHECK ((ends_at > starts_at))
);


--
-- Name: sponsor_impressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sponsor_impressions (
    id bigint NOT NULL,
    sponsor_id uuid NOT NULL,
    impression_date date DEFAULT ((now() AT TIME ZONE 'America/Toronto'::text))::date NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    page text DEFAULT 'home-search'::text NOT NULL,
    visitor_hash text DEFAULT ''::text,
    ip_hash text DEFAULT ''::text
);


--
-- Name: sponsor_impressions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sponsor_impressions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sponsor_impressions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: spotlight_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spotlight_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    CONSTRAINT spotlight_schedule_notes_len CHECK (((notes IS NULL) OR (char_length(notes) <= 1000))),
    CONSTRAINT spotlight_schedule_priority CHECK (((priority >= '-100'::integer) AND (priority <= 100))),
    CONSTRAINT spotlight_schedule_window CHECK ((ends_at > starts_at))
);


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_webhook_events (
    event_id text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'salesperson'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    capabilities text[] DEFAULT '{}'::text[],
    CONSTRAINT user_profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'salesperson'::text, 'viewer'::text])))
);


--
-- Name: vendor_event_admin_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_event_admin_notes (
    event_id uuid NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: vendor_events_backup_20261115; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_events_backup_20261115 (
    id uuid,
    vendor_id uuid,
    business_name text,
    submitter_email text,
    title text,
    event_date_label text,
    event_start_date date,
    expires_after date,
    location text,
    link text,
    summary text,
    status text,
    created_at timestamp with time zone,
    slug text,
    category text,
    community text,
    price_text text,
    image_url text,
    latitude double precision,
    longitude double precision,
    is_featured boolean,
    view_count integer,
    save_count integer,
    contact_name text,
    contact_phone text,
    date_type text,
    recurrence_rule text,
    verify_token text,
    verify_token_expires_at timestamp with time zone,
    verify_sent_at timestamp with time zone,
    verified_at timestamp with time zone,
    hamper_contact boolean,
    old_slugs text[]
);


--
-- Name: vendor_events_deleted_20261115; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_events_deleted_20261115 (
    id uuid,
    vendor_id uuid,
    business_name text,
    submitter_email text,
    title text,
    event_date_label text,
    event_start_date date,
    expires_after date,
    location text,
    link text,
    summary text,
    status text,
    created_at timestamp with time zone,
    slug text,
    category text,
    community text,
    price_text text,
    image_url text,
    latitude double precision,
    longitude double precision,
    is_featured boolean,
    view_count integer,
    save_count integer,
    contact_name text,
    contact_phone text,
    date_type text,
    recurrence_rule text,
    verify_token text,
    verify_token_expires_at timestamp with time zone,
    verify_sent_at timestamp with time zone,
    verified_at timestamp with time zone,
    hamper_contact boolean,
    old_slugs text[],
    service_options text[],
    sale_category text
);


--
-- Name: vendor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    business_name text NOT NULL,
    contact_name text DEFAULT ''::text,
    town_area text DEFAULT 'East Gwillimbury'::text,
    website_url text DEFAULT ''::text,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid,
    owner_email text NOT NULL,
    recipient_name text NOT NULL,
    recipient_type text NOT NULL,
    business_name text,
    status text DEFAULT 'active'::text NOT NULL,
    activated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT wallets_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['resident'::text, 'business'::text]))),
    CONSTRAINT wallets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text])))
);


--
-- Name: wg_unsubscribe_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wg_unsubscribe_tokens (
    email text NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: ad_orders ad_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_orders
    ADD CONSTRAINT ad_orders_pkey PRIMARY KEY (id);


--
-- Name: business_accounts business_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_accounts
    ADD CONSTRAINT business_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: business_claims business_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_claims
    ADD CONSTRAINT business_claims_pkey PRIMARY KEY (id);


--
-- Name: claims claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_pkey PRIMARY KEY (id);


--
-- Name: click_monthly_archives click_monthly_archives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.click_monthly_archives
    ADD CONSTRAINT click_monthly_archives_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: directory_listing_admin_notes directory_listing_admin_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_listing_admin_notes
    ADD CONSTRAINT directory_listing_admin_notes_pkey PRIMARY KEY (business_id);


--
-- Name: directory_listings directory_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_listings
    ADD CONSTRAINT directory_listings_pkey PRIMARY KEY (id);


--
-- Name: discovery_conversations discovery_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_conversations
    ADD CONSTRAINT discovery_conversations_pkey PRIMARY KEY (id);


--
-- Name: discovery_conversations discovery_conversations_session_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_conversations
    ADD CONSTRAINT discovery_conversations_session_key_key UNIQUE (session_key);


--
-- Name: discovery_leads discovery_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_leads
    ADD CONSTRAINT discovery_leads_pkey PRIMARY KEY (id);


--
-- Name: discovery_metrics_daily discovery_metrics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_metrics_daily
    ADD CONSTRAINT discovery_metrics_daily_pkey PRIMARY KEY (metric_date, intent, community, result_count_bucket);


--
-- Name: discovery_rate_limits discovery_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_rate_limits
    ADD CONSTRAINT discovery_rate_limits_pkey PRIMARY KEY (bucket_key);


--
-- Name: editorial_corrections editorial_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editorial_corrections
    ADD CONSTRAINT editorial_corrections_pkey PRIMARY KEY (id);


--
-- Name: email_rate_log email_rate_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_rate_log
    ADD CONSTRAINT email_rate_log_pkey PRIMARY KEY (id);


--
-- Name: facebook_post_log facebook_post_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facebook_post_log
    ADD CONSTRAINT facebook_post_log_pkey PRIMARY KEY (id);


--
-- Name: hamper_applications hamper_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hamper_applications
    ADD CONSTRAINT hamper_applications_pkey PRIMARY KEY (id);


--
-- Name: hamper_coupons hamper_coupons_application_id_offer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hamper_coupons
    ADD CONSTRAINT hamper_coupons_application_id_offer_id_key UNIQUE (application_id, offer_id);


--
-- Name: hamper_coupons hamper_coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hamper_coupons
    ADD CONSTRAINT hamper_coupons_code_key UNIQUE (code);


--
-- Name: hamper_coupons hamper_coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hamper_coupons
    ADD CONSTRAINT hamper_coupons_pkey PRIMARY KEY (id);


--
-- Name: hamper_offers hamper_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hamper_offers
    ADD CONSTRAINT hamper_offers_pkey PRIMARY KEY (id);


--
-- Name: home_gallery home_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_gallery
    ADD CONSTRAINT home_gallery_pkey PRIMARY KEY (id);


--
-- Name: link_clicks link_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_clicks
    ADD CONSTRAINT link_clicks_pkey PRIMARY KEY (id);


--
-- Name: newsletter_ad_placements newsletter_ad_placements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_ad_placements
    ADD CONSTRAINT newsletter_ad_placements_pkey PRIMARY KEY (id);


--
-- Name: newsletter_archive newsletter_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_archive
    ADD CONSTRAINT newsletter_archive_pkey PRIMARY KEY (id);


--
-- Name: newsletter_editions newsletter_editions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_editions
    ADD CONSTRAINT newsletter_editions_pkey PRIMARY KEY (edition);


--
-- Name: newsletter_settings newsletter_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_settings
    ADD CONSTRAINT newsletter_settings_pkey PRIMARY KEY (setting_key);


--
-- Name: newsletter_subscribers newsletter_subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email);


--
-- Name: newsletter_subscribers newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: presentation_tokens presentation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentation_tokens
    ADD CONSTRAINT presentation_tokens_pkey PRIMARY KEY (id);


--
-- Name: presentation_tokens presentation_tokens_token_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentation_tokens
    ADD CONSTRAINT presentation_tokens_token_code_key UNIQUE (token_code);


--
-- Name: press_articles press_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_articles
    ADD CONSTRAINT press_articles_pkey PRIMARY KEY (id);


--
-- Name: press_articles press_articles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_articles
    ADD CONSTRAINT press_articles_slug_key UNIQUE (slug);


--
-- Name: redemptions redemptions_coupon_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_coupon_id_key UNIQUE (coupon_id);


--
-- Name: redemptions redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_pkey PRIMARY KEY (id);


--
-- Name: scraped_url_blacklist scraped_url_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_url_blacklist
    ADD CONSTRAINT scraped_url_blacklist_pkey PRIMARY KEY (id);


--
-- Name: scraped_url_blacklist scraped_url_blacklist_target_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraped_url_blacklist
    ADD CONSTRAINT scraped_url_blacklist_target_url_key UNIQUE (target_url);


--
-- Name: search_sponsor_orders search_sponsor_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_sponsor_orders
    ADD CONSTRAINT search_sponsor_orders_pkey PRIMARY KEY (id);


--
-- Name: search_sponsors search_sponsors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_sponsors
    ADD CONSTRAINT search_sponsors_pkey PRIMARY KEY (id);


--
-- Name: sponsor_impressions sponsor_impressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsor_impressions
    ADD CONSTRAINT sponsor_impressions_pkey PRIMARY KEY (id);


--
-- Name: spotlight_schedule spotlight_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlight_schedule
    ADD CONSTRAINT spotlight_schedule_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (event_id);


--
-- Name: vendor_events uq_vendor_events_biz_date_title; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_events
    ADD CONSTRAINT uq_vendor_events_biz_date_title UNIQUE (business_name, event_start_date, title);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: vendor_event_admin_notes vendor_event_admin_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_event_admin_notes
    ADD CONSTRAINT vendor_event_admin_notes_pkey PRIMARY KEY (event_id);


--
-- Name: vendor_events vendor_events_image_url_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.vendor_events
    ADD CONSTRAINT vendor_events_image_url_check CHECK (((image_url IS NULL) OR (image_url ~* '^(pending:)?(https://|data:image/(png|jpe?g|webp|gif);base64,)'::text))) NOT VALID;


--
-- Name: vendor_events vendor_events_link_http_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.vendor_events
    ADD CONSTRAINT vendor_events_link_http_check CHECK ((link ~* '^https?://'::text)) NOT VALID;


--
-- Name: vendor_events vendor_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_events
    ADD CONSTRAINT vendor_events_pkey PRIMARY KEY (id);


--
-- Name: vendor_profiles vendor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_profiles
    ADD CONSTRAINT vendor_profiles_pkey PRIMARY KEY (id);


--
-- Name: vendor_scrape_sources vendor_scrape_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_scrape_sources
    ADD CONSTRAINT vendor_scrape_sources_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_owner_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_owner_email_key UNIQUE (owner_email);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: wg_unsubscribe_tokens wg_unsubscribe_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wg_unsubscribe_tokens
    ADD CONSTRAINT wg_unsubscribe_tokens_pkey PRIMARY KEY (email);


--
-- Name: wg_unsubscribe_tokens wg_unsubscribe_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wg_unsubscribe_tokens
    ADD CONSTRAINT wg_unsubscribe_tokens_token_key UNIQUE (token);


--
-- Name: directory_listings_old_slugs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directory_listings_old_slugs ON public.directory_listings USING gin (old_slugs);


--
-- Name: directory_listings_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX directory_listings_slug_unique ON public.directory_listings USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: hamper_applications_address_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hamper_applications_address_live ON public.hamper_applications USING btree (address_key) WHERE (status <> 'declined'::text);


--
-- Name: hamper_applications_email_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hamper_applications_email_live ON public.hamper_applications USING btree (lower(email)) WHERE (status <> 'declined'::text);


--
-- Name: hamper_applications_verify_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hamper_applications_verify_token ON public.hamper_applications USING btree (verify_token) WHERE (verify_token IS NOT NULL);


--
-- Name: home_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX home_gallery_order_idx ON public.home_gallery USING btree (sort_order, created_at);


--
-- Name: idx_activity_logs_followup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_followup ON public.activity_logs USING btree (next_followup_date);


--
-- Name: idx_activity_logs_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_meeting ON public.activity_logs USING btree (meeting_date);


--
-- Name: idx_ad_orders_sub_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ad_orders_sub_id ON public.ad_orders USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: idx_business_claims_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_claims_business ON public.business_claims USING btree (business_id);


--
-- Name: idx_business_claims_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_claims_status ON public.business_claims USING btree (status, created_at DESC);


--
-- Name: idx_claims_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_claims_categories ON public.claims USING gin (categories);


--
-- Name: idx_click_monthly_archives_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_click_monthly_archives_month ON public.click_monthly_archives USING btree (archive_month DESC, scope);


--
-- Name: idx_click_monthly_archives_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_click_monthly_archives_uniq ON public.click_monthly_archives USING btree (archive_month, scope, COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: idx_coupons_wallet_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_wallet_status ON public.coupons USING btree (wallet_id, status);


--
-- Name: idx_directory_listings_discovery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_directory_listings_discovery ON public.directory_listings USING btree (status, community);


--
-- Name: idx_directory_listings_google_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_directory_listings_google_place_id ON public.directory_listings USING btree (google_place_id) WHERE ((google_place_id IS NOT NULL) AND (btrim(google_place_id) <> ''::text));


--
-- Name: idx_discovery_conversations_status_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discovery_conversations_status_updated ON public.discovery_conversations USING btree (status, updated_at DESC);


--
-- Name: idx_email_rate_log_key_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_rate_log_key_time ON public.email_rate_log USING btree (recipient_key, created_at DESC);


--
-- Name: idx_email_rate_log_recipient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_rate_log_recipient_time ON public.email_rate_log USING btree (recipient, created_at DESC);


--
-- Name: idx_facebook_post_log_posted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facebook_post_log_posted_at ON public.facebook_post_log USING btree (posted_at DESC);


--
-- Name: idx_facebook_post_log_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facebook_post_log_source ON public.facebook_post_log USING btree (source_table, source_id, posted_at DESC);


--
-- Name: idx_home_gallery_sub_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_home_gallery_sub_id ON public.home_gallery USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: idx_link_clicks_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_link_clicks_issue ON public.link_clicks USING btree (issue_date);


--
-- Name: idx_link_clicks_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_link_clicks_source ON public.link_clicks USING btree (source_name);


--
-- Name: idx_newsletter_ads_sub_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_ads_sub_id ON public.newsletter_ad_placements USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
-- Name: idx_partners_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_categories ON public.partners USING gin (categories);


--
-- Name: idx_partners_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_slug ON public.partners USING btree (slug);


--
-- Name: idx_presentation_tokens_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presentation_tokens_lookup ON public.presentation_tokens USING btree (fallback_code, expires_at);


--
-- Name: idx_redemptions_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_partner ON public.redemptions USING btree (partner_name, redeemed_at DESC);


--
-- Name: idx_scraped_url_blacklist_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraped_url_blacklist_active ON public.scraped_url_blacklist USING btree (active);


--
-- Name: idx_sponsor_impressions_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsor_impressions_dedup ON public.sponsor_impressions USING btree (sponsor_id, ip_hash, viewed_at);


--
-- Name: idx_sponsor_impressions_sponsor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsor_impressions_sponsor ON public.sponsor_impressions USING btree (sponsor_id, impression_date);


--
-- Name: idx_sponsor_impressions_viewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sponsor_impressions_viewed ON public.sponsor_impressions USING btree (viewed_at);


--
-- Name: idx_subscribers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscribers_status ON public.newsletter_subscribers USING btree (status);


--
-- Name: idx_subscribers_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscribers_token ON public.newsletter_subscribers USING btree (unsubscribe_token);


--
-- Name: idx_vendor_events_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_category ON public.vendor_events USING btree (category);


--
-- Name: idx_vendor_events_community; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_community ON public.vendor_events USING btree (community);


--
-- Name: idx_vendor_events_discovery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_discovery ON public.vendor_events USING btree (status, event_start_date, expires_after);


--
-- Name: idx_vendor_events_expires_after; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_expires_after ON public.vendor_events USING btree (expires_after);


--
-- Name: idx_vendor_events_low_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_low_confidence ON public.vendor_events USING btree (data_confidence) WHERE (data_confidence < 60);


--
-- Name: idx_vendor_events_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_start_date ON public.vendor_events USING btree (event_start_date);


--
-- Name: idx_vendor_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_status ON public.vendor_events USING btree (status);


--
-- Name: idx_vendor_events_suspected_duplicate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_suspected_duplicate ON public.vendor_events USING btree (is_suspected_duplicate) WHERE (is_suspected_duplicate = true);


--
-- Name: idx_vendor_events_verify_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_events_verify_token ON public.vendor_events USING btree (verify_token) WHERE (verify_token IS NOT NULL);


--
-- Name: idx_vendor_scrape_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_scrape_status ON public.vendor_scrape_sources USING btree (status);


--
-- Name: link_clicks_clicked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX link_clicks_clicked_at ON public.link_clicks USING btree (clicked_at);


--
-- Name: link_clicks_ip_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX link_clicks_ip_recent ON public.link_clicks USING btree (ip_hash, clicked_at);


--
-- Name: link_clicks_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX link_clicks_item ON public.link_clicks USING btree (item_kind, item_id);


--
-- Name: search_sponsor_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_sponsor_orders_status_idx ON public.search_sponsor_orders USING btree (status, created_at DESC);


--
-- Name: search_sponsor_orders_sub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_sponsor_orders_sub_idx ON public.search_sponsor_orders USING btree (stripe_subscription_id);


--
-- Name: search_sponsors_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_sponsors_business ON public.search_sponsors USING btree (business_id);


--
-- Name: search_sponsors_stripe_sub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_sponsors_stripe_sub_idx ON public.search_sponsors USING btree (stripe_subscription_id);


--
-- Name: search_sponsors_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_sponsors_window_idx ON public.search_sponsors USING btree (active, starts_at, ends_at);


--
-- Name: spotlight_schedule_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spotlight_schedule_listing_idx ON public.spotlight_schedule USING btree (listing_id);


--
-- Name: spotlight_schedule_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spotlight_schedule_window_idx ON public.spotlight_schedule USING btree (active, starts_at, ends_at);


--
-- Name: vendor_events_old_slugs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendor_events_old_slugs ON public.vendor_events USING gin (old_slugs);


--
-- Name: vendor_events_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vendor_events_slug_unique ON public.vendor_events USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: directory_listings directory_listings_set_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER directory_listings_set_slug BEFORE INSERT OR UPDATE OF slug ON public.directory_listings FOR EACH ROW EXECUTE FUNCTION public.wg_directory_set_slug();


--
-- Name: home_gallery home_gallery_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER home_gallery_touch BEFORE UPDATE ON public.home_gallery FOR EACH ROW EXECUTE FUNCTION public.wg_home_gallery_touch();


--
-- Name: search_sponsors search_sponsors_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER search_sponsors_touch BEFORE UPDATE ON public.search_sponsors FOR EACH ROW EXECUTE FUNCTION public.wg_search_sponsors_touch();


--
-- Name: spotlight_schedule spotlight_schedule_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER spotlight_schedule_touch BEFORE UPDATE ON public.spotlight_schedule FOR EACH ROW EXECUTE FUNCTION public.wg_spotlight_schedule_touch();


--
-- Name: ad_orders trg_ad_orders_block_viewer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ad_orders_block_viewer BEFORE INSERT OR DELETE OR UPDATE ON public.ad_orders FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: ad_orders trg_ad_orders_guard_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ad_orders_guard_insert BEFORE INSERT ON public.ad_orders FOR EACH ROW EXECUTE FUNCTION public.wg_guard_ad_orders_insert();


--
-- Name: discovery_conversations trg_discovery_conversations_block_viewer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_discovery_conversations_block_viewer BEFORE INSERT OR DELETE OR UPDATE ON public.discovery_conversations FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: discovery_leads trg_discovery_leads_block_viewer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_discovery_leads_block_viewer BEFORE INSERT OR DELETE OR UPDATE ON public.discovery_leads FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: editorial_corrections trg_editorial_corrections_block_viewer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_editorial_corrections_block_viewer BEFORE INSERT OR DELETE OR UPDATE ON public.editorial_corrections FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: partners trg_enforce_partner_update_security; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_partner_update_security BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_update_security();


--
-- Name: newsletter_ad_placements trg_newsletter_ad_placements_block_viewer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_newsletter_ad_placements_block_viewer BEFORE INSERT OR DELETE OR UPDATE ON public.newsletter_ad_placements FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: vendor_events vendor_events_set_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vendor_events_set_slug BEFORE INSERT OR UPDATE OF slug ON public.vendor_events FOR EACH ROW EXECUTE FUNCTION public.wg_vendor_events_set_slug();


--
-- Name: activity_logs wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: business_accounts wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.business_accounts FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: business_claims wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.business_claims FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: claims wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: click_monthly_archives wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.click_monthly_archives FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: coupons wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: directory_listings wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.directory_listings FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: hamper_applications wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.hamper_applications FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: hamper_coupons wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.hamper_coupons FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: hamper_offers wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.hamper_offers FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: home_gallery wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.home_gallery FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: newsletter_archive wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.newsletter_archive FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: newsletter_editions wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.newsletter_editions FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: newsletter_settings wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.newsletter_settings FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: newsletter_subscribers wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: partners wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: presentation_tokens wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.presentation_tokens FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: press_articles wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.press_articles FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: redemptions wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.redemptions FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: scraped_url_blacklist wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.scraped_url_blacklist FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: search_sponsors wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.search_sponsors FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: spotlight_schedule wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.spotlight_schedule FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: user_profiles wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: vendor_events wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.vendor_events FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: vendor_profiles wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.vendor_profiles FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: vendor_scrape_sources wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.vendor_scrape_sources FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: wallets wg_block_viewer_writes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_block_viewer_writes BEFORE INSERT OR DELETE OR UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.wg_block_viewer_writes();


--
-- Name: newsletter_subscribers wg_newsletter_guard_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_newsletter_guard_insert BEFORE INSERT ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.wg_newsletter_guard_insert();


--
-- Name: vendor_events wg_vendor_events_guard_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wg_vendor_events_guard_insert BEFORE INSERT ON public.vendor_events FOR EACH ROW EXECUTE FUNCTION public.wg_vendor_events_guard_insert();


--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: business_accounts business_accounts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_accounts
    ADD CONSTRAINT business_accounts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.directory_listings(id) ON DELETE CASCADE;


--
-- Name: business_accounts business_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_accounts
    ADD CONSTRAINT business_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: business_claims business_claims_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_claims
    ADD CONSTRAINT business_claims_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.directory_listings(id) ON DELETE CASCADE;


--
-- Name: business_claims business_claims_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_claims
    ADD CONSTRAINT business_claims_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: click_monthly_archives click_monthly_archives_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.click_monthly_archives
    ADD CONSTRAINT click_monthly_archives_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.directory_listings(id) ON DELETE SET NULL;


--
-- Name: coupons coupons_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;


--
-- Name: coupons coupons_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- Name: directory_listing_admin_notes directory_listing_admin_notes_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_listing_admin_notes
    ADD CONSTRAINT directory_listing_admin_notes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.directory_listings(id) ON DELETE CASCADE;


--
-- Name: directory_listing_admin_notes directory_listing_admin_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_listing_admin_notes
    ADD CONSTRAINT directory_listing_admin_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: discovery_conversations discovery_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_conversations
    ADD CONSTRAINT discovery_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.discovery_leads(id) ON DELETE SET NULL;


--
-- Name: discovery_leads discovery_leads_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_leads
    ADD CONSTRAINT discovery_leads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.discovery_conversations(id) ON DELETE SET NULL;


--
-- Name: hamper_coupons hamper_coupons_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hamper_coupons
    ADD CONSTRAINT hamper_coupons_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.hamper_applications(id) ON DELETE CASCADE;


--
-- Name: hamper_coupons hamper_coupons_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hamper_coupons
    ADD CONSTRAINT hamper_coupons_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.hamper_offers(id) ON DELETE RESTRICT;


--
-- Name: presentation_tokens presentation_tokens_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentation_tokens
    ADD CONSTRAINT presentation_tokens_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: presentation_tokens presentation_tokens_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentation_tokens
    ADD CONSTRAINT presentation_tokens_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- Name: redemptions redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: redemptions redemptions_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;


--
-- Name: redemptions redemptions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- Name: search_sponsor_orders search_sponsor_orders_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_sponsor_orders
    ADD CONSTRAINT search_sponsor_orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.directory_listings(id) ON DELETE SET NULL;


--
-- Name: search_sponsor_orders search_sponsor_orders_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_sponsor_orders
    ADD CONSTRAINT search_sponsor_orders_sponsor_id_fkey FOREIGN KEY (sponsor_id) REFERENCES public.search_sponsors(id) ON DELETE SET NULL;


--
-- Name: search_sponsors search_sponsors_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_sponsors
    ADD CONSTRAINT search_sponsors_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.directory_listings(id) ON DELETE SET NULL;


--
-- Name: search_sponsors search_sponsors_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_sponsors
    ADD CONSTRAINT search_sponsors_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.search_sponsor_orders(id) ON DELETE SET NULL;


--
-- Name: sponsor_impressions sponsor_impressions_sponsor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsor_impressions
    ADD CONSTRAINT sponsor_impressions_sponsor_id_fkey FOREIGN KEY (sponsor_id) REFERENCES public.search_sponsors(id) ON DELETE CASCADE;


--
-- Name: spotlight_schedule spotlight_schedule_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlight_schedule
    ADD CONSTRAINT spotlight_schedule_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.vendor_events(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vendor_event_admin_notes vendor_event_admin_notes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_event_admin_notes
    ADD CONSTRAINT vendor_event_admin_notes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.vendor_events(id) ON DELETE CASCADE;


--
-- Name: vendor_event_admin_notes vendor_event_admin_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_event_admin_notes
    ADD CONSTRAINT vendor_event_admin_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vendor_events vendor_events_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_events
    ADD CONSTRAINT vendor_events_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vendor_profiles vendor_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_profiles
    ADD CONSTRAINT vendor_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vendor_scrape_sources vendor_scrape_sources_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_scrape_sources
    ADD CONSTRAINT vendor_scrape_sources_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: wallets wallets_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: vendor_scrape_sources Admin write vendor_scrape_sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin write vendor_scrape_sources" ON public.vendor_scrape_sources TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: newsletter_settings Admins and staff can manage newsletter settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and staff can manage newsletter settings" ON public.newsletter_settings USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: scraped_url_blacklist Admins and staff can manage url blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and staff can manage url blacklist" ON public.scraped_url_blacklist USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: newsletter_subscribers Admins and staff can view subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and staff can view subscribers" ON public.newsletter_subscribers FOR SELECT USING ((public.is_admin() OR public.is_staff()));


--
-- Name: newsletter_subscribers Admins can add subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can add subscribers" ON public.newsletter_subscribers FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: claims Admins can delete claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete claims" ON public.claims FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: partners Admins can delete partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete partners" ON public.partners FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: user_profiles Admins can delete profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete profiles" ON public.user_profiles FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: newsletter_subscribers Admins can delete subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete subscribers" ON public.newsletter_subscribers FOR DELETE USING (public.is_admin());


--
-- Name: partners Admins can insert partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert partners" ON public.partners FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: user_profiles Admins can insert profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert profiles" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: user_profiles Admins can update profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update profiles" ON public.user_profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: vendor_scrape_sources Admins can update scrape URLs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update scrape URLs" ON public.vendor_scrape_sources FOR UPDATE USING (public.is_admin());


--
-- Name: newsletter_subscribers Admins can update subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update subscribers" ON public.newsletter_subscribers FOR UPDATE USING (public.is_admin());


--
-- Name: newsletter_editions Admins can upsert latest newsletter editions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can upsert latest newsletter editions" ON public.newsletter_editions USING (public.is_admin());


--
-- Name: business_claims Admins only can manage business claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins only can manage business claims" ON public.business_claims TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: directory_listing_admin_notes Admins only can manage directory admin notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins only can manage directory admin notes" ON public.directory_listing_admin_notes TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: vendor_event_admin_notes Admins only can manage event admin notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins only can manage event admin notes" ON public.vendor_event_admin_notes TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: activity_logs Admins or author can delete activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins or author can delete activity logs" ON public.activity_logs FOR DELETE TO authenticated USING ((public.is_admin() OR (user_id = auth.uid())));


--
-- Name: activity_logs Admins or author can update activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins or author can update activity logs" ON public.activity_logs FOR UPDATE TO authenticated USING ((public.is_admin() OR (user_id = auth.uid())));


--
-- Name: vendor_events Admins or owner can delete event; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins or owner can delete event" ON public.vendor_events FOR DELETE USING ((public.is_admin() OR (auth.uid() = vendor_id)));


--
-- Name: vendor_scrape_sources Admins or owner can delete scrape URLs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins or owner can delete scrape URLs" ON public.vendor_scrape_sources FOR DELETE USING ((public.is_admin() OR (auth.uid() = vendor_id)));


--
-- Name: vendor_events Authenticated vendors can submit events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated vendors can submit events" ON public.vendor_events FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND ((status = 'pending_verification'::text) OR ((status = 'pending'::text) AND (submitter_email IS NOT NULL) AND (lower(submitter_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))) OR public.is_admin() OR public.is_staff())));


--
-- Name: vendor_scrape_sources Authenticated vendors can submit scrape URLs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated vendors can submit scrape URLs" ON public.vendor_scrape_sources FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND ((status = 'pending'::text) OR public.is_admin())));


--
-- Name: claims Only staff can view claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only staff can view claims" ON public.claims FOR SELECT TO authenticated USING (public.is_staff());


--
-- Name: scraped_url_blacklist Public and pipeline can read url blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public and pipeline can read url blacklist" ON public.scraped_url_blacklist FOR SELECT USING (true);


--
-- Name: link_clicks Public can log link clicks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can log link clicks" ON public.link_clicks FOR INSERT WITH CHECK (((item_kind IS NULL) AND (item_id IS NULL)));


--
-- Name: newsletter_editions Public can read latest newsletter editions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read latest newsletter editions" ON public.newsletter_editions FOR SELECT USING (true);


--
-- Name: newsletter_settings Public can read public newsletter settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read public newsletter settings" ON public.newsletter_settings FOR SELECT USING ((setting_key !~~ 'crawl_audit_%'::text));


--
-- Name: press_articles Public can read published press articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read published press articles" ON public.press_articles FOR SELECT TO authenticated, anon USING ((status = 'published'::text));


--
-- Name: vendor_events Public can submit pending community listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can submit pending community listings" ON public.vendor_events FOR INSERT WITH CHECK ((status = 'pending_verification'::text));


--
-- Name: newsletter_subscribers Public can subscribe to newsletter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can subscribe to newsletter" ON public.newsletter_subscribers FOR INSERT WITH CHECK ((status = 'pending'::text));


--
-- Name: partners Public can view approved partners or staff can view all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view approved partners or staff can view all" ON public.partners FOR SELECT USING (((status = ANY (ARRAY['Approved'::text, 'is_example'::text])) OR public.is_staff()));


--
-- Name: newsletter_archive Public can view newsletter archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view newsletter archive" ON public.newsletter_archive FOR SELECT USING (true);


--
-- Name: press_articles Public can view published press articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view published press articles" ON public.press_articles FOR SELECT USING ((status = 'published'::text));


--
-- Name: directory_listings Public read approved directory listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read approved directory listings" ON public.directory_listings FOR SELECT USING ((status = 'approved'::text));


--
-- Name: vendor_events Read approved events or own events or staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read approved events or own events or staff" ON public.vendor_events FOR SELECT USING (((status = 'approved'::text) OR (auth.uid() = vendor_id) OR ((submitter_email IS NOT NULL) AND (lower(submitter_email) = lower((auth.jwt() ->> 'email'::text)))) OR public.is_admin() OR public.is_staff()));


--
-- Name: vendor_scrape_sources Read approved scrape URLs or own or staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read approved scrape URLs or own or staff" ON public.vendor_scrape_sources FOR SELECT USING (((status = 'approved'::text) OR (auth.uid() = vendor_id) OR public.is_admin() OR public.is_staff()));


--
-- Name: activity_logs Staff can insert activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff());


--
-- Name: claims Staff can insert claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert claims" ON public.claims FOR INSERT TO authenticated WITH CHECK (public.is_staff());


--
-- Name: vendor_events Staff can insert events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can insert events" ON public.vendor_events FOR INSERT WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: coupons Staff can manage coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage coupons" ON public.coupons USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: directory_listings Staff can manage directory listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage directory listings" ON public.directory_listings USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: newsletter_archive Staff can manage newsletter archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage newsletter archive" ON public.newsletter_archive USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: presentation_tokens Staff can manage presentation tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage presentation tokens" ON public.presentation_tokens USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: press_articles Staff can manage press articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage press articles" ON public.press_articles USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: redemptions Staff can manage redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage redemptions" ON public.redemptions USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: wallets Staff can manage wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage wallets" ON public.wallets USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: link_clicks Staff can read click analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read click analytics" ON public.link_clicks FOR SELECT USING ((public.is_admin() OR public.is_staff()));


--
-- Name: newsletter_settings Staff can read crawl audit settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read crawl audit settings" ON public.newsletter_settings FOR SELECT USING (((setting_key ~~ 'crawl_audit_%'::text) AND (public.is_admin() OR public.is_staff())));


--
-- Name: claims Staff can update claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update claims" ON public.claims FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: vendor_events Staff can update events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update events" ON public.vendor_events FOR UPDATE USING ((public.is_admin() OR public.is_staff())) WITH CHECK ((public.is_admin() OR public.is_staff()));


--
-- Name: partners Staff can update partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update partners" ON public.partners FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: activity_logs Staff can view activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_staff());


--
-- Name: user_profiles Staff can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view all profiles" ON public.user_profiles FOR SELECT TO authenticated USING ((public.is_staff() OR (auth.uid() = id)));


--
-- Name: vendor_profiles Users can insert own vendor profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own vendor profile" ON public.vendor_profiles FOR INSERT WITH CHECK (((auth.uid() = id) OR public.is_admin()));


--
-- Name: vendor_profiles Users can update own vendor profile or admins update all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own vendor profile or admins update all" ON public.vendor_profiles FOR UPDATE USING (((auth.uid() = id) OR public.is_admin()));


--
-- Name: vendor_profiles Users can view own vendor profile or admins view all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own vendor profile or admins view all" ON public.vendor_profiles FOR SELECT USING (((auth.uid() = id) OR public.is_admin() OR public.is_staff()));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_orders ad_orders_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ad_orders_admin_all ON public.ad_orders TO authenticated USING (public.wg_is_trusted_caller()) WITH CHECK (public.wg_is_trusted_caller());


--
-- Name: business_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: business_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

--
-- Name: click_monthly_archives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.click_monthly_archives ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: directory_listing_admin_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directory_listing_admin_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: directory_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directory_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discovery_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_conversations discovery_conversations_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discovery_conversations_admin_all ON public.discovery_conversations TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: discovery_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discovery_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_leads discovery_leads_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discovery_leads_admin_all ON public.discovery_leads TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: discovery_metrics_daily discovery_metrics_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discovery_metrics_admin_read ON public.discovery_metrics_daily FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: discovery_metrics_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discovery_metrics_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discovery_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: editorial_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.editorial_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: editorial_corrections editorial_corrections_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY editorial_corrections_public_read ON public.editorial_corrections FOR SELECT TO authenticated, anon USING (((status = 'active'::text) OR public.wg_is_trusted_caller()));


--
-- Name: editorial_corrections editorial_corrections_staff_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY editorial_corrections_staff_write ON public.editorial_corrections TO authenticated USING (public.wg_is_trusted_caller()) WITH CHECK (public.wg_is_trusted_caller());


--
-- Name: email_rate_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_rate_log ENABLE ROW LEVEL SECURITY;

--
-- Name: facebook_post_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facebook_post_log ENABLE ROW LEVEL SECURITY;

--
-- Name: facebook_post_log facebook_post_log_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY facebook_post_log_admin_read ON public.facebook_post_log FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: hamper_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hamper_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: hamper_coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hamper_coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: hamper_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hamper_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: home_gallery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.home_gallery ENABLE ROW LEVEL SECURITY;

--
-- Name: home_gallery home_gallery_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY home_gallery_admin_delete ON public.home_gallery FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: home_gallery home_gallery_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY home_gallery_admin_insert ON public.home_gallery FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: home_gallery home_gallery_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY home_gallery_admin_update ON public.home_gallery FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: home_gallery home_gallery_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY home_gallery_public_read ON public.home_gallery FOR SELECT TO authenticated, anon USING ((active AND ((starts_at IS NULL) OR (now() >= starts_at)) AND ((ends_at IS NULL) OR (now() < ends_at))));


--
-- Name: home_gallery home_gallery_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY home_gallery_staff_read ON public.home_gallery FOR SELECT TO authenticated USING (public.wg_is_trusted_caller());


--
-- Name: link_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_ad_placements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_ad_placements ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_ad_placements newsletter_ad_placements_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newsletter_ad_placements_admin_write ON public.newsletter_ad_placements TO authenticated USING (public.wg_is_trusted_caller()) WITH CHECK (public.wg_is_trusted_caller());


--
-- Name: newsletter_ad_placements newsletter_ad_placements_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY newsletter_ad_placements_select ON public.newsletter_ad_placements FOR SELECT TO authenticated, anon USING (((active = true) OR public.wg_is_trusted_caller()));


--
-- Name: newsletter_archive; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_archive ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_editions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_editions ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletter_subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

--
-- Name: partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

--
-- Name: presentation_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.presentation_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: press_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.press_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: press_articles press_articles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_articles_admin_all ON public.press_articles TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: scraped_url_blacklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scraped_url_blacklist ENABLE ROW LEVEL SECURITY;

--
-- Name: search_sponsor_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_sponsor_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: search_sponsor_orders search_sponsor_orders_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_sponsor_orders_admin_update ON public.search_sponsor_orders FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: search_sponsor_orders search_sponsor_orders_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_sponsor_orders_staff_read ON public.search_sponsor_orders FOR SELECT TO authenticated USING (public.wg_is_trusted_caller());


--
-- Name: search_sponsors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_sponsors ENABLE ROW LEVEL SECURITY;

--
-- Name: search_sponsors search_sponsors_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_sponsors_admin_delete ON public.search_sponsors FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: search_sponsors search_sponsors_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_sponsors_admin_insert ON public.search_sponsors FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: search_sponsors search_sponsors_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_sponsors_admin_update ON public.search_sponsors FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: search_sponsors search_sponsors_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY search_sponsors_staff_read ON public.search_sponsors FOR SELECT TO authenticated USING (public.wg_is_trusted_caller());


--
-- Name: sponsor_impressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sponsor_impressions ENABLE ROW LEVEL SECURITY;

--
-- Name: spotlight_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spotlight_schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: spotlight_schedule spotlight_schedule_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spotlight_schedule_admin_delete ON public.spotlight_schedule FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: spotlight_schedule spotlight_schedule_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spotlight_schedule_admin_insert ON public.spotlight_schedule FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: spotlight_schedule spotlight_schedule_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spotlight_schedule_admin_update ON public.spotlight_schedule FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: spotlight_schedule spotlight_schedule_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spotlight_schedule_staff_read ON public.spotlight_schedule FOR SELECT TO authenticated USING (public.wg_is_trusted_caller());


--
-- Name: stripe_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: vendor_event_admin_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendor_event_admin_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: vendor_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendor_events ENABLE ROW LEVEL SECURITY;

--
-- Name: vendor_events_backup_20261115; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendor_events_backup_20261115 ENABLE ROW LEVEL SECURITY;

--
-- Name: vendor_events_deleted_20261115; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendor_events_deleted_20261115 ENABLE ROW LEVEL SECURITY;

--
-- Name: vendor_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: vendor_scrape_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendor_scrape_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

--
-- Name: wg_unsubscribe_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wg_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


