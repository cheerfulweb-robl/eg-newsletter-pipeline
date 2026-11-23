-- ============================================================================
-- 2026-11-15: Welcome Hamper (digital coupons for new residents)
--
-- Program rules (from Robert, 2026-11-13):
--   * New residents of any Georgina community only.
--   * Moved in within the last 3 months; proof (utility bill or lease) is
--     uploaded with the application and checked by staff.
--   * Waitlist: approved applicants get their coupons when the program opens
--     (Spring 2027). Staff issue the coupons from /hamper/admin.html.
--   * No physical hamper. Each coupon has its own code (WG + 6 characters,
--     e.g. WG7K3M9Q) and a QR code, and can be redeemed once.
--   * Merchants redeem at /hamper/redeem.html after signing in with the email
--     staff saved on their offer.
--   * Events, dining and sales submission forms get a "Contact me about the
--     Welcome Hamper program" checkbox (vendor_events.hamper_contact).
--
-- New tables are prefixed hamper_ and are separate from the retired
-- claims / wallets / coupons / partners tables, which are left untouched.
-- The public and signed-in visitors have NO direct table access: everything
-- goes through the functions below, which check who is calling.
--
-- Run in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. Tables -------------------------------------------------------------------
create table if not exists public.hamper_applications (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    first_name text not null,
    last_name text not null,
    email text not null,
    phone text not null,
    street_address text not null,
    unit text,
    community text not null,
    postal_code text not null,
    move_in_date date not null,
    household_size int check (household_size between 1 and 15),
    interests text,
    newsletter_opt_in boolean not null default false,
    proof_type text not null check (proof_type in ('utility_bill', 'lease', 'other')),
    proof_path text not null,
    status text not null default 'unverified'
        check (status in ('unverified', 'review', 'approved', 'declined')),
    staff_note text,
    decline_reason text,
    reviewed_by uuid,
    reviewed_at timestamptz,
    coupons_issued_at timestamptz,
    verify_token text,
    verify_token_expires_at timestamptz,
    verify_sent_at timestamptz,
    verify_send_count int not null default 0,
    verified_at timestamptz,
    address_key text generated always as (
        lower(regexp_replace(street_address || '|' || coalesce(unit, '') || '|' || postal_code, '\s', '', 'g'))
    ) stored
);

alter table public.hamper_applications add column if not exists verify_send_count int not null default 0;

-- One live application per email and per household address (declined ones don't count).
create unique index if not exists hamper_applications_email_live
    on public.hamper_applications (lower(email)) where status <> 'declined';
create unique index if not exists hamper_applications_address_live
    on public.hamper_applications (address_key) where status <> 'declined';
create index if not exists hamper_applications_verify_token
    on public.hamper_applications (verify_token) where verify_token is not null;

create table if not exists public.hamper_offers (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    merchant_name text not null,
    merchant_email text not null,
    offer_title text not null,
    offer_details text,
    terms text,
    community text,
    active boolean not null default true,
    valid_until date
);

create table if not exists public.hamper_coupons (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null references public.hamper_applications(id) on delete cascade,
    offer_id uuid not null references public.hamper_offers(id) on delete restrict,
    code text not null unique check (code ~ '^WG[A-HJ-NP-Z2-9]{6}$'),
    status text not null default 'available' check (status in ('available', 'redeemed', 'void')),
    issued_at timestamptz not null default now(),
    expires_at timestamptz,
    redeemed_at timestamptz,
    redeemed_by text,
    unique (application_id, offer_id)
);

alter table public.hamper_applications enable row level security;
alter table public.hamper_offers enable row level security;
alter table public.hamper_coupons enable row level security;
revoke all on public.hamper_applications, public.hamper_offers, public.hamper_coupons from anon, authenticated;

-- 2. "Contact me about the Welcome Hamper program" on submissions ------------
alter table public.vendor_events add column if not exists hamper_contact boolean not null default false;

-- 3. Proof-of-residence uploads (private bucket) ------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hamper-proofs', 'hamper-proofs', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may add a file under apply/ (needed before the application exists).
-- Nobody but staff can read, and only admins can delete. No updates/overwrites.
drop policy if exists "hamper proofs: public upload" on storage.objects;
create policy "hamper proofs: public upload" on storage.objects
    for insert to anon, authenticated
    with check (bucket_id = 'hamper-proofs' and (storage.foldername(name))[1] = 'apply');

drop policy if exists "hamper proofs: staff read" on storage.objects;
create policy "hamper proofs: staff read" on storage.objects
    for select to authenticated
    using (bucket_id = 'hamper-proofs' and public.is_staff());

drop policy if exists "hamper proofs: admin delete" on storage.objects;
create policy "hamper proofs: admin delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'hamper-proofs' and public.is_admin());

-- 4. Helpers -------------------------------------------------------------------
create or replace function public.hamper_today()
returns date language sql stable as $$
    select (now() at time zone 'America/Toronto')::date;
$$;

-- WG + 6 characters from a 32-letter alphabet without 0/O/1/I (about 1 billion codes).
create or replace function public.hamper_new_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
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

create or replace function public.hamper_caller_email()
returns text language sql stable as $$
    select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- 5. Public: apply --------------------------------------------------------------
create or replace function public.hamper_apply(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    v_ppath text := btrim(coalesce(p ->> 'proof_path', ''));
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
    if length(regexp_replace(v_phone, '\D', '', 'g')) not between 10 and 15 then
        raise exception 'Please enter a valid phone number.' using errcode = '22023';
    end if;
    if length(v_street) not between 3 and 160 or length(coalesce(v_unit, '')) > 40 then
        raise exception 'Please enter your street address.' using errcode = '22023';
    end if;
    if v_comm not in ('Keswick', 'Sutton', 'Jackson''s Point', 'Pefferlaw', 'Udora', 'Baldwin',
                      'Willow Beach', 'Belhaven', 'Port Bolster', 'Virginia', 'Other (Georgina)') then
        raise exception 'Please choose your Georgina community.' using errcode = '22023';
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
        raise exception 'The Welcome Hamper is for residents who moved to Georgina in the last 3 months.' using errcode = '22023';
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
    if v_ptype not in ('utility_bill', 'lease', 'other') then
        raise exception 'Please choose the type of proof you are uploading.' using errcode = '22023';
    end if;

    -- The proof file must be a fresh upload under apply/ that no other application uses.
    if v_ppath !~ '^apply/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
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
               proof_type = v_ptype, proof_path = v_ppath, updated_at = now()
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
$$;

-- 6. Signed-in resident: my application and coupons ----------------------------
create or replace function public.hamper_my_wallet()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
                       'terms', o.terms, 'community', o.community)
                   order by o.merchant_name)
              from public.hamper_coupons c join public.hamper_offers o on o.id = c.offer_id
             where c.application_id = v_app.id and c.status <> 'void'), '[]'::jsonb));
end;
$$;

-- 7. Signed-in merchant: check and redeem ---------------------------------------
create or replace function public.hamper_merchant_check(code_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_email text := public.hamper_caller_email();
    v_code text := upper(regexp_replace(coalesce(code_input, ''), '[\s-]', '', 'g'));
    r record;
begin
    if v_email = '' then
        raise exception 'Please sign in first.' using errcode = '42501';
    end if;
    select c.code, c.status, c.expires_at, c.redeemed_at, o.merchant_name, o.merchant_email,
           o.offer_title, o.offer_details, o.terms, a.first_name, left(a.last_name, 1) as last_initial
      into r
      from public.hamper_coupons c
      join public.hamper_offers o on o.id = c.offer_id
      join public.hamper_applications a on a.id = c.application_id
     where c.code = v_code;
    if not found or (lower(r.merchant_email) <> v_email and not public.wg_is_trusted_caller()) then
        return jsonb_build_object('found', false);
    end if;
    return jsonb_build_object(
        'found', true, 'code', r.code, 'status', r.status,
        'expired', (r.expires_at is not null and r.expires_at < now()),
        'expires_at', r.expires_at, 'redeemed_at', r.redeemed_at,
        'merchant_name', r.merchant_name, 'offer_title', r.offer_title,
        'offer_details', r.offer_details, 'terms', r.terms,
        'holder', r.first_name || ' ' || r.last_initial || '.');
end;
$$;

create or replace function public.hamper_merchant_redeem(code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := public.hamper_caller_email();
    v_code text := upper(regexp_replace(coalesce(code_input, ''), '[\s-]', '', 'g'));
    r record;
begin
    if v_email = '' then
        raise exception 'Please sign in first.' using errcode = '42501';
    end if;
    select c.id, c.status, c.expires_at, c.redeemed_at, o.merchant_email, o.valid_until
      into r
      from public.hamper_coupons c join public.hamper_offers o on o.id = c.offer_id
     where c.code = v_code
     for update of c;
    if not found or (lower(r.merchant_email) <> v_email and not public.wg_is_trusted_caller()) then
        raise exception 'This code is not valid for your business.' using errcode = '22023';
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
       set status = 'redeemed', redeemed_at = now(), redeemed_by = v_email
     where id = r.id and status = 'available';
    return jsonb_build_object('success', true, 'redeemed_at', now());
end;
$$;

-- 8. Staff (hamper/admin.html) ---------------------------------------------------
create or replace function public.hamper_admin_list_applications()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

create or replace function public.hamper_admin_set_status(id_input uuid, status_input text, note_input text default null, reason_input text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.hamper_admin_save_note(id_input uuid, note_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.hamper_admin_delete_application(id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- Issue one coupon per active offer to an approved applicant (skips offers already issued).
create or replace function public.hamper_admin_issue_coupons(id_input uuid, expires_input date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.hamper_admin_list_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

create or replace function public.hamper_admin_save_offer(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid := nullif(p ->> 'id', '')::uuid;
    v_name text := btrim(coalesce(p ->> 'merchant_name', ''));
    v_email text := lower(btrim(coalesce(p ->> 'merchant_email', '')));
    v_title text := btrim(coalesce(p ->> 'offer_title', ''));
    v_until date := nullif(p ->> 'valid_until', '')::date;
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
    if v_id is null then
        insert into public.hamper_offers (merchant_name, merchant_email, offer_title, offer_details, terms, community, active, valid_until)
        values (v_name, v_email, v_title, left(p ->> 'offer_details', 1000), left(p ->> 'terms', 1000),
                nullif(btrim(coalesce(p ->> 'community', '')), ''), coalesce((p ->> 'active')::boolean, true), v_until)
        returning id into v_id;
        v_rows := 1;
    else
        update public.hamper_offers
           set merchant_name = v_name, merchant_email = v_email, offer_title = v_title,
               offer_details = left(p ->> 'offer_details', 1000), terms = left(p ->> 'terms', 1000),
               community = nullif(btrim(coalesce(p ->> 'community', '')), ''),
               active = coalesce((p ->> 'active')::boolean, active), valid_until = v_until
         where id = v_id;
        get diagnostics v_rows = row_count;
    end if;
    return jsonb_build_object('success', v_rows = 1, 'id', v_id);
end;
$$;

create or replace function public.hamper_admin_list_coupons(application_input uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

create or replace function public.hamper_admin_void_coupon(id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- 9. Who may call what -------------------------------------------------------------
revoke all on function public.hamper_new_code() from public, anon, authenticated;
revoke all on function public.hamper_apply(jsonb) from public;
revoke all on function public.hamper_my_wallet() from public, anon;
revoke all on function public.hamper_merchant_check(text) from public, anon;
revoke all on function public.hamper_merchant_redeem(text) from public, anon;
revoke all on function public.hamper_admin_list_applications() from public, anon;
revoke all on function public.hamper_admin_set_status(uuid, text, text, text) from public, anon;
revoke all on function public.hamper_admin_save_note(uuid, text) from public, anon;
revoke all on function public.hamper_admin_delete_application(uuid) from public, anon;
revoke all on function public.hamper_admin_issue_coupons(uuid, date) from public, anon;
revoke all on function public.hamper_admin_list_offers() from public, anon;
revoke all on function public.hamper_admin_save_offer(jsonb) from public, anon;
revoke all on function public.hamper_admin_list_coupons(uuid) from public, anon;
revoke all on function public.hamper_admin_void_coupon(uuid) from public, anon;

grant execute on function public.hamper_apply(jsonb) to anon, authenticated, service_role;
grant execute on function public.hamper_my_wallet() to authenticated;
grant execute on function public.hamper_merchant_check(text) to authenticated;
grant execute on function public.hamper_merchant_redeem(text) to authenticated;
grant execute on function public.hamper_admin_list_applications() to authenticated, service_role;
grant execute on function public.hamper_admin_set_status(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.hamper_admin_save_note(uuid, text) to authenticated, service_role;
grant execute on function public.hamper_admin_delete_application(uuid) to authenticated, service_role;
grant execute on function public.hamper_admin_issue_coupons(uuid, date) to authenticated, service_role;
grant execute on function public.hamper_admin_list_offers() to authenticated, service_role;
grant execute on function public.hamper_admin_save_offer(jsonb) to authenticated, service_role;
grant execute on function public.hamper_admin_list_coupons(uuid) to authenticated, service_role;
grant execute on function public.hamper_admin_void_coupon(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Checks (read-only):
-- select count(*) from public.hamper_applications;          -- 0 on first run
-- select id, public from storage.buckets where id = 'hamper-proofs';   -- public = false
-- select column_name from information_schema.columns
--  where table_name = 'vendor_events' and column_name = 'hamper_contact';
-- ----------------------------------------------------------------------------
