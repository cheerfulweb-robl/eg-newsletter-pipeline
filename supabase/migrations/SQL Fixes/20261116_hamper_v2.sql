-- ============================================================================
-- Welcome Hamper v2 (site v58.9), 2026-11-14
--
-- 1. Verification choice: upload a document OR ask for a phone call.
--    proof_type gains 'phone_call'; proof_path may be empty for phone calls.
-- 2. Staff can delete an uploaded proof file and keep the application
--    (proof_path cleared, proof_deleted_at stamped). The file itself is removed
--    from storage by hamper/admin.html before this function is called.
-- 3. Phone numbers are stored as (905) 999-9999 when they have 10 digits.
-- 4. Redeem: reports an error if the coupon row was not actually changed.
--
-- Run in the Supabase SQL Editor AFTER 20261115_welcome_hamper.sql. Safe to re-run.
-- ============================================================================

-- 1. Columns and the proof-type rule ---------------------------------------------
alter table public.hamper_applications alter column proof_path drop not null;
alter table public.hamper_applications add column if not exists proof_deleted_at timestamptz;

alter table public.hamper_applications drop constraint if exists hamper_applications_proof_type_check;
alter table public.hamper_applications add constraint hamper_applications_proof_type_check
    check (proof_type in ('utility_bill', 'lease', 'other', 'phone_call'));

-- 2. Phone format helper -----------------------------------------------------------
create or replace function public.hamper_format_phone(p text)
returns text language sql immutable as $$
    select case
        when length(d) = 10 then '(' || substr(d, 1, 3) || ') ' || substr(d, 4, 3) || '-' || substr(d, 7, 4)
        when length(d) = 11 and left(d, 1) = '1' then '(' || substr(d, 2, 3) || ') ' || substr(d, 5, 3) || '-' || substr(d, 8, 4)
        else btrim(coalesce(p, ''))
    end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

-- 3. Apply (same rules as before, plus the phone-call choice) -------------------------
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
    if length(regexp_replace(v_phone, '\D', '', 'g')) not between 10 and 15 then
        raise exception 'Please enter a valid phone number.' using errcode = '22023';
    end if;
    v_phone := public.hamper_format_phone(v_phone);
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
$$;

-- 4. Staff: forget a proof file after it was removed from storage ----------------------
create or replace function public.hamper_admin_clear_proof(id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- 5. Redeem: fail loudly if nothing changed -------------------------------------------
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
    v_rows int;
    v_at timestamptz;
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
     where id = r.id and status = 'available'
    returning redeemed_at into v_at;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
        raise exception 'This coupon was already redeemed.' using errcode = '22023';
    end if;
    return jsonb_build_object('success', true, 'redeemed_at', v_at);
end;
$$;

-- 6. Who may call what ------------------------------------------------------------------
revoke all on function public.hamper_format_phone(text) from public, anon, authenticated;
revoke all on function public.hamper_admin_clear_proof(uuid) from public, anon;
grant execute on function public.hamper_admin_clear_proof(uuid) to authenticated, service_role;
-- hamper_apply and hamper_merchant_redeem keep the grants from 20261115.

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Checks (read-only):
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'hamper_applications_proof_type_check';
-- select public.hamper_format_phone('905 999 9999');   -- (905) 999-9999
-- ----------------------------------------------------------------------------
