-- Business Claim & Verification workflow for /directory and /businesses/<slug>.
-- Claims always start as 'pending_verification', require 1-time email confirmation
-- to become 'pending', and require admin approval before linking business_accounts.

create table if not exists public.business_claims (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.directory_listings(id) on delete cascade,
    business_name text not null,
    claimant_name text not null,
    claimant_role text not null default 'Owner',
    claimant_email text not null,
    claimant_phone text,
    verification_method text not null default 'phone_call',
    domain_matched boolean not null default false,
    already_claimed boolean not null default false,
    proof_path text,
    notes text,
    verify_token text not null,
    verified_at timestamptz,
    status text not null default 'pending_verification',
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_business_claims_status on public.business_claims (status, created_at desc);
create index if not exists idx_business_claims_business on public.business_claims (business_id);

alter table public.business_claims enable row level security;
revoke all on public.business_claims from anon, public;
grant select, update, delete on public.business_claims to authenticated;

drop policy if exists "Admins only can manage business claims" on public.business_claims;
create policy "Admins only can manage business claims"
    on public.business_claims
    for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- Private storage bucket for business claim verification documents
insert into storage.buckets (id, name, public)
values ('claim-proofs', 'claim-proofs', false)
on conflict (id) do nothing;

drop policy if exists "Public can upload claim proofs" on storage.objects;
create policy "Public can upload claim proofs"
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'claim-proofs' and name like 'claims/%');

drop policy if exists "Admins can read claim proofs" on storage.objects;
create policy "Admins can read claim proofs"
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'claim-proofs' and public.is_admin());

-- Public helper: returns only business_ids that already have an owner in business_accounts
create or replace function public.wg_claimed_business_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(array_agg(distinct business_id), '{}'::uuid[])
    from public.business_accounts;
$$;
revoke all on function public.wg_claimed_business_ids() from public;
grant execute on function public.wg_claimed_business_ids() to anon, authenticated;

-- Public RPC: submit a business claim (starts as pending_verification until email link clicked)
create or replace function public.wg_submit_business_claim(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_biz_id uuid := nullif(trim(coalesce(p->>'business_id', '')), '')::uuid;
    v_name text := trim(coalesce(p->>'claimant_name', ''));
    v_role text := coalesce(nullif(trim(coalesce(p->>'claimant_role', '')), ''), 'Owner');
    v_email text := lower(trim(coalesce(p->>'claimant_email', '')));
    v_phone text := nullif(trim(coalesce(p->>'claimant_phone', '')), '');
    v_method text := coalesce(nullif(trim(coalesce(p->>'verification_method', '')), ''), 'phone_call');
    v_proof text := nullif(trim(coalesce(p->>'proof_path', '')), '');
    v_notes text := nullif(trim(coalesce(p->>'notes', '')), '');
    v_biz record;
    v_email_domain text;
    v_site_host text;
    v_domain_match boolean := false;
    v_already_claimed boolean := false;
    v_token text;
    v_claim_id uuid;
begin
    if v_biz_id is null or length(v_name) < 2 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'error', 'Please enter your name and a valid email address.');
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
        v_site_host := lower(regexp_replace(regexp_replace(v_biz.link, '^https?://(www\.)?', '', 'i'), '/.*$', ''));
        if v_site_host <> '' and v_site_host not like '%welcomegeorgina.ca%' and (v_email_domain = v_site_host or v_email_domain like '%.' || v_site_host) then
            v_domain_match := true;
        end if;
    end if;

    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    insert into public.business_claims (
        business_id, business_name, claimant_name, claimant_role, claimant_email,
        claimant_phone, verification_method, domain_matched, already_claimed,
        proof_path, notes, verify_token, status
    ) values (
        v_biz.id, v_biz.name, v_name, v_role, v_email,
        v_phone, v_method, v_domain_match, v_already_claimed,
        v_proof, v_notes, v_token, 'pending_verification'
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

-- Public RPC: confirm email ownership for a claim
create or replace function public.wg_confirm_business_claim(token_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row public.business_claims%rowtype;
begin
    if coalesce(trim(token_input), '') = '' then
        return jsonb_build_object('success', false, 'error', 'Missing confirmation token.');
    end if;

    select * into v_row
    from public.business_claims
    where verify_token = trim(token_input)
    limit 1;

    if v_row.id is null then
        return jsonb_build_object('success', false, 'error', 'This confirmation link is invalid or expired.');
    end if;

    if v_row.status = 'pending_verification' then
        update public.business_claims
        set status = 'pending', verified_at = now()
        where id = v_row.id;
    end if;

    return jsonb_build_object(
        'success', true,
        'business_id', v_row.business_id,
        'business_name', v_row.business_name,
        'claimant_email', v_row.claimant_email
    );
end;
$$;
revoke all on function public.wg_confirm_business_claim(text) from public;
grant execute on function public.wg_confirm_business_claim(text) to anon, authenticated;

notify pgrst, 'reload schema';
