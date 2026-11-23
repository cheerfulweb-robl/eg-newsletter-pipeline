-- 20261228_ad_orders_subscription_tracking.sql
-- Adds stripe_subscription_id to ad_orders, home_gallery, and newsletter_ad_placements
-- so recurring ad renewals (invoice.paid) and client cancellations (customer.subscription.deleted)
-- automatically extend or deactivate Photo Gallery and Newsletter Sponsored ads.
-- Safe to re-run.

begin;

alter table public.ad_orders
  add column if not exists stripe_subscription_id text;

alter table public.home_gallery
  add column if not exists stripe_subscription_id text;

alter table public.newsletter_ad_placements
  add column if not exists stripe_subscription_id text;

create index if not exists idx_ad_orders_sub_id on public.ad_orders (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists idx_home_gallery_sub_id on public.home_gallery (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists idx_newsletter_ads_sub_id on public.newsletter_ad_placements (stripe_subscription_id) where stripe_subscription_id is not null;

commit;
