-- 003_grant_service_role_autopost.sql
-- Grants service_role read/write access needed by the GitHub Actions
-- Facebook autoposter (and newsletter pipeline) on Welcome EG tables.
-- Safe to re-run.
begin;

grant select, insert, update, delete on public.facebook_post_log to service_role;
grant select on public.vendor_events to service_role;
grant select on public.partners to service_role;
grant select on public.directory_listings to service_role;
grant select on public.press_articles to service_role;

commit;
