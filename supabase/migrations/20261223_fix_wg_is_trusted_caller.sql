-- Fix wg_is_trusted_caller() so service_role / sb_secret_ calls from GitHub Actions
-- (e.g. save_newsletter_setting, save_newsletter_edition) are recognized reliably.
-- Safe to re-run.

create or replace function public.wg_is_trusted_caller()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select current_user = 'service_role'
        or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        or coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') = 'service_role'
        or public.is_admin()
        or public.is_staff();
$$;
