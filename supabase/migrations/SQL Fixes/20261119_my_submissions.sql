-- ============================================================================
-- My Submissions page (site v60), 2026-11-14
--
-- wg_my_click_counts(): a signed-in submitter sees website-click totals for
-- THEIR OWN listings only (matched on the email they signed in with). Raw click
-- rows stay staff-only.
--
-- Run in the Supabase SQL Editor AFTER 20261118_click_tracking.sql. Safe to re-run.
-- ============================================================================

create or replace function public.wg_my_click_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
    if v_email = '' then
        raise exception 'Please sign in first.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_object_agg(e.id::text, jsonb_build_object(
                   'clicks', coalesce(c.clicks, 0),
                   'unique_visitors', coalesce(c.uniq, 0),
                   'views', coalesce(e.view_count, 0)))
          from public.vendor_events e
          left join (select item_id, count(*) as clicks, count(distinct nullif(visitor_hash, '')) as uniq
                       from public.link_clicks
                      where item_kind = 'listing'
                      group by item_id) c on c.item_id = e.id
         where lower(e.submitter_email) = v_email), '{}'::jsonb);
end;
$$;

revoke all on function public.wg_my_click_counts() from public, anon;
grant execute on function public.wg_my_click_counts() to authenticated, service_role;

notify pgrst, 'reload schema';
