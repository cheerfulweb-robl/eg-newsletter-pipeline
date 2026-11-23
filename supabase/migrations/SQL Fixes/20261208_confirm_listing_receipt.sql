-- 2026-11-17: Fix for 20261207. confirm_my_submissions(ids) set verified_at, and the send-email
-- step that follows (submission_notify) refuses listings that already have verified_at, so the
-- submitter's receipt was never sent. verified_at is set by that email step, as before.
-- Run in the Supabase SQL editor (after 20261207).
create or replace function public.confirm_my_submissions(ids_input uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    me text := lower(coalesce(auth.jwt() ->> 'email', ''));
    ids uuid[];
begin
    if me = '' then
        raise exception 'Not signed in' using errcode = '42501';
    end if;
    with done as (
        update public.vendor_events
        set status = 'pending', verify_token = null, verify_token_expires_at = null
        where status = 'pending_verification' and lower(submitter_email) = me
          and id = any(coalesce(ids_input, '{}'::uuid[]))
        returning id
    )
    select coalesce(array_agg(id), '{}') into ids from done;
    return ids;
end;
$$;
revoke all on function public.confirm_my_submissions(uuid[]) from public, anon;
grant execute on function public.confirm_my_submissions(uuid[]) to authenticated;
