-- 20270104_security_hardening.sql
-- Security hardening from 2026-11-23 3-agent audit. Safe to re-run.
begin;

-- 1. Stripe webhook idempotency table (prevents duplicate invoice.paid / checkout.session.completed processing)
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
-- No public/authenticated policies: service_role only.

-- 2. Block read-only 'viewer' writes on ad_orders, newsletter_ad_placements, and editorial_corrections
drop trigger if exists trg_ad_orders_block_viewer on public.ad_orders;
create trigger trg_ad_orders_block_viewer
  before insert or update or delete on public.ad_orders
  for each row execute function public.wg_block_viewer_writes();

drop trigger if exists trg_newsletter_ad_placements_block_viewer on public.newsletter_ad_placements;
create trigger trg_newsletter_ad_placements_block_viewer
  before insert or update or delete on public.newsletter_ad_placements
  for each row execute function public.wg_block_viewer_writes();

drop trigger if exists trg_editorial_corrections_block_viewer on public.editorial_corrections;
create trigger trg_editorial_corrections_block_viewer
  before insert or update or delete on public.editorial_corrections
  for each row execute function public.wg_block_viewer_writes();

-- 3. Validate ad_orders target_url scheme & image_data_url size at the DB boundary
create or replace function public.wg_guard_ad_orders_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

drop trigger if exists trg_ad_orders_guard_insert on public.ad_orders;
create trigger trg_ad_orders_guard_insert
  before insert on public.ad_orders
  for each row execute function public.wg_guard_ad_orders_insert();

-- 4. Fix press_articles, vendor_scrape_sources, and press-images storage RLS
--    (replace inline role checks without active=true and hardcoded email with is_admin())
drop policy if exists "press_articles_admin_all" on public.press_articles;
drop policy if exists "Admins can manage all press articles" on public.press_articles;
create policy "press_articles_admin_all"
  on public.press_articles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admin write vendor_scrape_sources" on public.vendor_scrape_sources;
drop policy if exists "Authenticated admin full access vendor_scrape_sources" on public.vendor_scrape_sources;
drop policy if exists "Admins can manage vendor_scrape_sources" on public.vendor_scrape_sources;
create policy "Admin write vendor_scrape_sources"
  on public.vendor_scrape_sources
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "press_images_admin_insert" on storage.objects;
drop policy if exists "Admins upload press-images" on storage.objects;
create policy "press_images_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'press-images' and public.is_admin());

drop policy if exists "press_images_admin_update" on storage.objects;
create policy "press_images_admin_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'press-images' and public.is_admin())
  with check (bucket_id = 'press-images' and public.is_admin());

drop policy if exists "press_images_admin_delete" on storage.objects;
drop policy if exists "Admins delete press-images" on storage.objects;
create policy "press_images_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'press-images' and public.is_admin());

-- 5. Harden storage buckets: press-images size/MIME limits & hamper-proofs filename regex
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'press-images';

drop policy if exists "hamper_proofs_public_insert" on storage.objects;
drop policy if exists "hamper proofs: public upload" on storage.objects;
create policy "hamper_proofs_public_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'hamper-proofs'
    and name ~* '^apply/[0-9a-f-]+/[A-Za-z0-9._-]{1,80}$'
  );

-- 6. Add pg_temp to search_path on remaining SECURITY DEFINER functions
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.proname in (
        'is_admin',
        'hamper_submit_business_offer',
        'hamper_merchant_check',
        'hamper_merchant_redeem',
        'wg_public_spotlights',
        'wg_create_sponsor_order'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.sig);
  end loop;
end $$;

commit;
