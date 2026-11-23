-- ============================================================================
-- 2026-11-18 (v67.9):
--   1. Public-facing Welcome Hamper code check & redemption at /hamper/redeem.html
--      (no email sign-in gate required for businesses/cashiers checking & redeeming codes)
--   2. Editorial Corrections table (public.editorial_corrections) + RLS policies
--      (fixes "Could not find the table 'public.editorial_corrections' in the schema cache")
--   3. Public Spotlight RPC (public.wg_public_spotlights) returning all current active
--      spotlights and past scheduled spotlights from the last 13 months.
--
-- Safe to re-run in the Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Public Welcome Hamper Code Check & Redemption
-- ----------------------------------------------------------------------------
create or replace function public.hamper_merchant_check(code_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

create or replace function public.hamper_merchant_redeem(code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.hamper_merchant_check(text) to anon, authenticated, service_role;
grant execute on function public.hamper_merchant_redeem(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Editorial Corrections Table (public.editorial_corrections)
-- ----------------------------------------------------------------------------
create table if not exists public.editorial_corrections (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    issue_date date not null default ((now() at time zone 'America/Toronto')::date),
    edition_target text not null default 'both'
        check (edition_target in ('both', 'monday', 'thursday', 'reader', 'vendor')),
    status text not null default 'active'
        check (status in ('active', 'draft', 'archived')),
    original_claim text,
    correction_text text not null,
    action_taken text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.editorial_corrections enable row level security;

drop policy if exists "editorial_corrections_public_read" on public.editorial_corrections;
create policy "editorial_corrections_public_read" on public.editorial_corrections
    for select to anon, authenticated
    using (status = 'active' or public.wg_is_trusted_caller());

drop policy if exists "editorial_corrections_staff_write" on public.editorial_corrections;
create policy "editorial_corrections_staff_write" on public.editorial_corrections
    for all to authenticated
    using (public.wg_is_trusted_caller())
    with check (public.wg_is_trusted_caller());

grant select on public.editorial_corrections to anon, authenticated, service_role;
grant insert, update, delete on public.editorial_corrections to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Public Spotlights RPC (Current Spotlight Business(es) + Past 13 Months)
-- ----------------------------------------------------------------------------
alter table public.vendor_events add column if not exists is_spotlight boolean not null default false;

create or replace function public.wg_public_spotlights()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.wg_public_spotlights() from public;
grant execute on function public.wg_public_spotlights() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
