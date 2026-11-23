-- 2026-11-17: Staff (not only admins) can link business accounts, and the send-email function
-- (service key) can too: staff create business logins from Search Sponsors with
-- "Create account & email invite". Same function as 20261209 with the wider check.
-- Run in the Supabase SQL editor (after 20261209).

create or replace function public.wg_admin_set_business_account(email_input text, business_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
    uid uuid;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Only staff can manage business accounts' using errcode = '42501';
    end if;
    select u.id into uid from auth.users u where lower(u.email) = lower(btrim(coalesce(email_input, '')));
    if uid is null then
        return jsonb_build_object('success', false, 'error',
            'No login exists for that email. Create it first in Supabase: Authentication > Add user (with a password, auto-confirm).');
    end if;
    if exists (select 1 from public.user_profiles p where p.id = uid) then
        return jsonb_build_object('success', false, 'error', 'That email is a staff account. Use a separate email for the business.');
    end if;
    if business_id_input is null then
        delete from public.business_accounts where user_id = uid;
        return jsonb_build_object('success', true, 'removed', true);
    end if;
    if not exists (select 1 from public.directory_listings d where d.id = business_id_input) then
        return jsonb_build_object('success', false, 'error', 'That business is not in the directory.');
    end if;
    insert into public.business_accounts (user_id, business_id) values (uid, business_id_input)
    on conflict (user_id) do update set business_id = excluded.business_id;
    return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.wg_admin_set_business_account(text, uuid) from public, anon;
grant execute on function public.wg_admin_set_business_account(text, uuid) to authenticated;
