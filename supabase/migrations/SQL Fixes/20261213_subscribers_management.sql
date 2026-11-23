-- 20261213_subscribers_management.sql
-- Newsletter subscriber admin management: delete, status updates, CASL unsubscribed_at tracking.

-- 1. Ensure unsubscribed_at column exists on public.newsletter_subscribers
alter table public.newsletter_subscribers
    add column if not exists unsubscribed_at timestamptz;

-- 2. Staff RPC: Delete a subscriber permanently
create or replace function public.wg_admin_delete_subscriber(sub_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    deleted_email text;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    delete from public.newsletter_subscribers
     where id = sub_id
    returning email into deleted_email;

    if deleted_email is null then
        return jsonb_build_object('success', false, 'error', 'Subscriber not found');
    end if;

    return jsonb_build_object('success', true, 'email', deleted_email);
end;
$$;

revoke all on function public.wg_admin_delete_subscriber(uuid) from public, anon;
grant execute on function public.wg_admin_delete_subscriber(uuid) to authenticated, service_role;

-- 3. Staff RPC: Update subscriber status with atomic CASL tracking
create or replace function public.wg_admin_set_subscriber_status(sub_id uuid, status_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    s text := lower(btrim(coalesce(status_input, '')));
    updated_rec record;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    if s not in ('active', 'pending', 'unsubscribed') then
        return jsonb_build_object('success', false, 'error', 'Invalid status. Must be active, pending, or unsubscribed');
    end if;

    update public.newsletter_subscribers
       set status = s,
           unsubscribed_at = case when s = 'unsubscribed' then coalesce(unsubscribed_at, now()) else null end
     where id = sub_id
    returning id, email, status, unsubscribed_at into updated_rec;

    if updated_rec.id is null then
        return jsonb_build_object('success', false, 'error', 'Subscriber not found');
    end if;

    -- If disabled/unsubscribed, also sync CASL flags on claims and partners
    if s = 'unsubscribed' then
        update public.partners set join_newsletter = false where lower(trim(contact_email)) = lower(trim(updated_rec.email));
        update public.claims set join_newsletter = false where lower(trim(email)) = lower(trim(updated_rec.email));
    end if;

    return jsonb_build_object(
        'success', true,
        'id', updated_rec.id,
        'email', updated_rec.email,
        'status', updated_rec.status,
        'unsubscribed_at', updated_rec.unsubscribed_at
    );
end;
$$;

revoke all on function public.wg_admin_set_subscriber_status(uuid, text) from public, anon;
grant execute on function public.wg_admin_set_subscriber_status(uuid, text) to authenticated, service_role;
