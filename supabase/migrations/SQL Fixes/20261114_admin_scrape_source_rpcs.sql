-- ============================================================================
-- 20261114_admin_scrape_source_rpcs.sql
-- Crawler tab (staff/admin-approvals.html?view=crawlers): Edit, Delete,
-- Approve and Reject.
--
-- Why: those buttons wrote straight to the vendor_scrape_sources table. Row
-- rules (RLS) on that table decide silently: when a rule does not allow the
-- change, the database changes 0 rows and reports NO error, so the page said
-- "updated" / "deleted" but nothing happened. The delete rule in schema.sql
-- only allows admins (not staff) at all.
--
-- Fix: two staff-only functions, built like admin_set_event_status /
-- admin_delete_event (SECURITY DEFINER + wg_is_trusted_caller()). The page
-- calls these first and shows a clear message if the change was refused.
--
-- Safe to run more than once. Changes no data and no existing rules.
-- Needs public.wg_is_trusted_caller() from 20261112_lock_down_functions_and_policies.sql.
-- ============================================================================
begin;

-- Update one crawler entry. Only the listed columns can be changed; any key
-- not present in updates_input keeps its current value.
create or replace function public.admin_update_scrape_source(id_input uuid, updates_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    changed integer;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    update public.vendor_scrape_sources
    set
        business_name    = case when updates_input ? 'business_name'    then updates_input->>'business_name'    else business_name end,
        submitter_email  = case when updates_input ? 'submitter_email'  then updates_input->>'submitter_email'  else submitter_email end,
        scrape_url       = case when updates_input ? 'scrape_url'       then updates_input->>'scrape_url'       else scrape_url end,
        default_location = case when updates_input ? 'default_location' then updates_input->>'default_location' else default_location end,
        notes            = case when updates_input ? 'notes'            then updates_input->>'notes'            else notes end,
        status           = case when updates_input ? 'status'           then updates_input->>'status'           else status end
    where id = id_input;

    get diagnostics changed = row_count;
    return jsonb_build_object('success', changed > 0, 'rows', changed);
end;
$function$;

-- Permanently delete one crawler entry.
create or replace function public.admin_delete_scrape_source(id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
    changed integer;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    delete from public.vendor_scrape_sources
    where id = id_input;

    get diagnostics changed = row_count;
    return jsonb_build_object('success', changed > 0, 'rows', changed);
end;
$function$;

revoke execute on function public.admin_update_scrape_source(uuid, jsonb) from public, anon;
revoke execute on function public.admin_delete_scrape_source(uuid) from public, anon;
grant execute on function public.admin_update_scrape_source(uuid, jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_scrape_source(uuid) to authenticated, service_role;

commit;

-- Ask the API to pick up the new functions right away.
notify pgrst, 'reload schema';
