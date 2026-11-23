-- Allow local businesses to submit a Welcome Hamper offer application
-- Creates an inactive offer row (active = false) for staff review in /hamper/admin.html

CREATE OR REPLACE FUNCTION public.hamper_submit_business_offer(
    merchant_name_input text,
    merchant_email_input text,
    offer_title_input text,
    offer_details_input text DEFAULT '',
    terms_input text DEFAULT '',
    community_input text DEFAULT 'Georgina',
    merchant_website_input text DEFAULT '',
    valid_until_input text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name text := btrim(coalesce(merchant_name_input, ''));
    v_email text := lower(btrim(coalesce(merchant_email_input, '')));
    v_title text := btrim(coalesce(offer_title_input, ''));
    v_details text := btrim(coalesce(offer_details_input, ''));
    v_terms text := btrim(coalesce(terms_input, ''));
    v_comm text := coalesce(nullif(btrim(community_input), ''), 'Georgina');
    v_web text := btrim(coalesce(merchant_website_input, ''));
    v_until date := NULL;
    v_id uuid;
BEGIN
    IF length(v_name) < 2 OR length(v_email) < 5 OR position('@' in v_email) = 0 OR length(v_title) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Business name, valid email, and offer title are required.');
    END IF;

    IF v_until IS NULL AND btrim(coalesce(valid_until_input, '')) ~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_until := valid_until_input::date;
    END IF;

    INSERT INTO public.hamper_offers (
        merchant_name,
        merchant_email,
        offer_title,
        offer_details,
        terms,
        community,
        merchant_website,
        valid_until,
        active
    ) VALUES (
        v_name,
        v_email,
        v_title,
        nullif(v_details, ''),
        nullif(v_terms, ''),
        v_comm,
        nullif(v_web, ''),
        v_until,
        false
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hamper_submit_business_offer(text, text, text, text, text, text, text, text) TO anon, authenticated;
