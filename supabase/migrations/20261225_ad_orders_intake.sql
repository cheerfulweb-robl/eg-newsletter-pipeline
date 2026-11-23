-- 20261225_ad_orders_intake.sql
-- Pre-checkout intake table & RPC for self-serve Photo Gallery Ads and Newsletter Sponsored Ads on /advertise.
-- Safe to re-run.

begin;

create table if not exists public.ad_orders (
  id uuid primary key default gen_random_uuid(),
  ad_type text not null check (ad_type in ('gallery', 'newsletter')),
  plan text not null check (plan in ('gallery_weekly', 'gallery_monthly', 'newsletter_single', 'newsletter_four_pack')),
  sponsor_name text not null,
  contact_email text not null,
  headline text,
  body_text text,
  image_data_url text,
  target_type text not null default 'external' check (target_type in ('external', 'listing', 'business_page')),
  target_url text not null,
  edition text default 'both' check (edition in ('monday', 'thursday', 'both')),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'active', 'cancelled')),
  stripe_session_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ad_orders enable row level security;

drop policy if exists "ad_orders_admin_all" on public.ad_orders;
create policy "ad_orders_admin_all"
  on public.ad_orders
  for all
  to authenticated
  using (public.wg_is_trusted_caller())
  with check (public.wg_is_trusted_caller());

create or replace function public.wg_create_ad_order(
  ad_type_input text,
  plan_input text,
  sponsor_name_input text,
  contact_email_input text,
  target_type_input text,
  target_url_input text,
  headline_input text default null,
  body_text_input text default null,
  image_data_url_input text default null,
  edition_input text default 'both'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.wg_create_ad_order(text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.wg_create_ad_order(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

commit;
