-- ============================================================================
-- Quick Search Sponsored: Self-serve Gateway Orders + Stripe Webhook support
-- Migration: 20261221_search_sponsor_orders_and_stripe.sql
--
-- Creates:
--   1. public.search_sponsor_orders   (stores pending & paid gateway orders)
--   2. public.search_sponsors         (adds stripe_subscription_id & order_id)
--   3. public.wg_create_sponsor_order (anon-callable RPC to create pending order
--                                      before redirecting to Stripe Payment Link)
-- ============================================================================

create table if not exists public.search_sponsor_orders (
    id uuid primary key default gen_random_uuid(),
    plan text not null check (plan in ('weekly', 'monthly')),
    keyword text not null check (char_length(btrim(keyword)) between 2 and 22),
    sponsor_name text not null check (char_length(btrim(sponsor_name)) between 1 and 120),
    contact_email text not null check (char_length(btrim(contact_email)) between 3 and 254),
    target_kind text not null check (target_kind in ('search', 'website', 'business')),
    website_url text,
    business_id uuid references public.directory_listings(id) on delete set null,
    search_query text,
    status text not null default 'pending_payment'
        check (status in ('pending_payment', 'active', 'cancelled', 'failed')),
    stripe_session_id text,
    stripe_customer_id text,
    stripe_subscription_id text,
    sponsor_id uuid references public.search_sponsors(id) on delete set null,
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint search_sponsor_orders_website_chk check (
        target_kind <> 'website' or (website_url is not null and website_url ~* '^https?://')
    ),
    constraint search_sponsor_orders_business_chk check (
        target_kind <> 'business' or business_id is not null
    )
);

create index if not exists search_sponsor_orders_status_idx
    on public.search_sponsor_orders (status, created_at desc);

create index if not exists search_sponsor_orders_sub_idx
    on public.search_sponsor_orders (stripe_subscription_id);

alter table public.search_sponsors
    add column if not exists stripe_subscription_id text;

alter table public.search_sponsors
    add column if not exists order_id uuid references public.search_sponsor_orders(id) on delete set null;

create index if not exists search_sponsors_stripe_sub_idx
    on public.search_sponsors (stripe_subscription_id);

-- RLS: keep customer emails & Stripe IDs private from anon/public; staff can view
alter table public.search_sponsor_orders enable row level security;
revoke all on public.search_sponsor_orders from anon;
grant select, insert, update on public.search_sponsor_orders to authenticated;

drop policy if exists search_sponsor_orders_staff_read on public.search_sponsor_orders;
create policy search_sponsor_orders_staff_read on public.search_sponsor_orders
    for select to authenticated
    using (public.wg_is_trusted_caller());

drop policy if exists search_sponsor_orders_admin_update on public.search_sponsor_orders;
create policy search_sponsor_orders_admin_update on public.search_sponsor_orders
    for update to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- Public RPC: creates a pending_payment order and returns its UUID for Stripe client_reference_id
create or replace function public.wg_create_sponsor_order(
    plan_input text,
    keyword_input text,
    sponsor_name_input text,
    contact_email_input text,
    target_kind_input text,
    website_url_input text default null,
    business_id_input uuid default null,
    search_query_input text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
        raise exception 'Please select your Welcome Georgina business listing.';
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
$$;

revoke all on function public.wg_create_sponsor_order(text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.wg_create_sponsor_order(text, text, text, text, text, text, uuid, text) to anon, authenticated, service_role;
