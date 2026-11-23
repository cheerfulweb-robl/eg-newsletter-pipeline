-- ============================================================================
-- 20261121_harden_security_definer_and_auth_role.sql
-- 1. Replace deprecated auth.role() in public.wg_is_trusted_caller() with
--    current_setting('request.jwt.claim.role', true).
-- 2. Pin search_path = public, pg_temp on all SECURITY DEFINER functions that
--    previously omitted it, preventing search-path shadowing.
-- Safe to re-run (uses to_regprocedure checks).
-- ============================================================================
begin;

create or replace function public.wg_is_trusted_caller()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        or public.is_admin()
        or public.is_staff();
$$;

do $$
declare
    fn_sig text;
    fn_sigs text[] := array[
        'public.increment_listing_impression(text, uuid)',
        'public.get_all_scrapes_admin()',
        'public.get_all_subscribers_admin()',
        'public.get_all_vendor_events_admin()',
        'public.get_admin_pipeline_metrics()',
        'public.admin_set_event_status(uuid, text, text)',
        'public.admin_delete_event(uuid)',
        'public.save_newsletter_edition(text, text, text)',
        'public.save_newsletter_setting(text, jsonb)',
        'public.get_my_scrapes(text)',
        'public.get_my_submissions(text)',
        'public.update_my_submission(uuid, text, jsonb)',
        'public.delete_my_submission(uuid, text)',
        'public.update_my_scrape(uuid, text, jsonb)',
        'public.delete_my_scrape(uuid, text)'
    ];
begin
    foreach fn_sig in array fn_sigs loop
        if to_regprocedure(fn_sig) is not null then
            execute format('alter function %s set search_path = public, pg_temp', fn_sig);
        end if;
    end loop;
end;
$$;

commit;
