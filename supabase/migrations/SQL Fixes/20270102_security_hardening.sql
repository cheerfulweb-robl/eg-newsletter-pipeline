-- Security hardening migration (2026-11-21)
-- Run in the Supabase SQL Editor. Idempotent / safe to re-run.

-- 1. Block viewer writes on newer tables + tighten wg_admin_set_business_account
do $$
declare
    t text;
begin
    foreach t in array array['business_accounts', 'business_claims', 'click_monthly_archives']
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

create or replace function public.wg_admin_set_business_account(email_input text, business_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
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
revoke all on function public.wg_admin_set_business_account(text, uuid) from public, anon;
grant execute on function public.wg_admin_set_business_account(text, uuid) to authenticated, service_role;

-- 2. Harden business_claims table, token expiry/cooldown, and claim-proofs storage bucket
alter table public.business_claims
    add column if not exists verify_token_expires_at timestamptz,
    add column if not exists verify_sent_at timestamptz,
    add column if not exists verify_send_count int not null default 0;

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'claim-proofs';

drop policy if exists "Public can upload claim proofs" on storage.objects;
create policy "Public can upload claim proofs"
    on storage.objects
    for insert
    to anon, authenticated
    with check (
        bucket_id = 'claim-proofs'
        and (storage.foldername(name))[1] = 'claims'
        and name ~* '^claims/[0-9a-f-]+/[0-9a-f-]+\.(pdf|jpg|jpeg|png|webp)$'
    );

drop policy if exists "Admins can delete claim proofs" on storage.objects;
create policy "Admins can delete claim proofs"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'claim-proofs' and public.is_admin());

-- 3. Harden wg_submit_business_claim (length caps, proof_path regex, server-side method, TTL, rate limit)
create or replace function public.wg_submit_business_claim(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
        if v_site_host <> '' and v_site_host not like '%welcomegeorgina.ca%' and (v_email_domain = v_site_host or v_email_domain like '%.' || v_site_host) then
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
$$;
revoke all on function public.wg_submit_business_claim(jsonb) from public;
grant execute on function public.wg_submit_business_claim(jsonb) to anon, authenticated;

-- 4. Harden wg_confirm_business_claim (enforce TTL, clear token, reject replay, omit claimant_email)
create or replace function public.wg_confirm_business_claim(token_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
revoke all on function public.wg_confirm_business_claim(text) from public;
grant execute on function public.wg_confirm_business_claim(text) to anon, authenticated;

-- 5. Atomic admin claim decision RPC (links business_accounts + updates business_claims in one transaction)
create or replace function public.wg_admin_decide_claim(claim_id_input uuid, decision_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
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
revoke all on function public.wg_admin_decide_claim(uuid, text) from public, anon;
grant execute on function public.wg_admin_decide_claim(uuid, text) to authenticated;

-- 6. Harden wg_record_search_click (URL scheme validation, server-side source_name lookup, null-IP rate limit)
create or replace function public.wg_record_search_click(
    query_input text,
    title_input text default null,
    business_input text default null,
    item_id_input uuid default null,
    target_url_input text default null,
    page_input text default 'search-results',
    visitor_input text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.wg_record_search_click(text, text, text, uuid, text, text, text) from public;
grant execute on function public.wg_record_search_click(text, text, text, uuid, text, text, text) to anon, authenticated, service_role;

-- 7. Include pg_temp in search_path for remaining SECURITY DEFINER click functions
alter function public.wg_track_click(text, uuid, text, text) set search_path = public, pg_temp;
alter function public.wg_record_sponsor_click(uuid, text, text) set search_path = public, pg_temp;
alter function public.wg_click_report(date, date) set search_path = public, pg_temp;
alter function public.wg_is_viewer() set search_path = public, pg_temp;
alter function public.wg_block_viewer_writes() set search_path = public, pg_temp;

notify pgrst, 'reload schema';
