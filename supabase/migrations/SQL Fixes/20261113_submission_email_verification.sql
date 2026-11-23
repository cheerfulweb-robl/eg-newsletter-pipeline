-- ============================================================================
-- 2026-11-13: Submission email verification
--
-- New flow for public listings (events, dining, sales):
--   1. A submission is saved with status 'pending_verification'.
--   2. The send-email edge function stores a one-time token on the row and
--      emails the submitter a magic link.
--   3. When the link is used, the edge function (service key) sets the row to
--      'pending', records verified_at, and emails the staff alert + receipt.
--
-- Also: register_newsletter_subscriber no longer hands the confirmation token
-- back to the browser (double opt-in could be bypassed with it).
--
-- Run in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================
begin;

-- 1. Columns used by the verification step -----------------------------------
alter table public.vendor_events
    add column if not exists verify_token text,
    add column if not exists verify_token_expires_at timestamptz,
    add column if not exists verify_sent_at timestamptz,
    add column if not exists verified_at timestamptz;

create index if not exists idx_vendor_events_verify_token
    on public.vendor_events (verify_token)
    where verify_token is not null;

-- The original schema limited status to pending/approved/rejected. The site
-- code is the authority on status values, so drop the check if it still exists.
alter table public.vendor_events
    drop constraint if exists vendor_events_status_check;

-- Rows that were already 'pending' before today were accepted without
-- verification; treat them as verified so nothing disappears from the queue.
update public.vendor_events
set verified_at = coalesce(verified_at, created_at)
where status in ('pending', 'approved', 'rejected')
  and verified_at is null;

-- 2. Insert rules: the public can only create unverified rows -----------------
drop policy if exists "Public can submit pending community listings" on public.vendor_events;
create policy "Public can submit pending community listings"
    on public.vendor_events for insert
    with check (status = 'pending_verification');

-- A signed-in visitor whose session email matches the submission may skip the
-- email step (their address is already proven). Staff/admins keep their rights.
drop policy if exists "Authenticated vendors can submit events" on public.vendor_events;
create policy "Authenticated vendors can submit events"
    on public.vendor_events for insert
    with check (
        auth.role() = 'authenticated'
        and (
            status = 'pending_verification'
            or (
                status = 'pending'
                and submitter_email is not null
                and lower(submitter_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            )
            or public.is_admin()
            or public.is_staff()
        )
    );

-- 3. Newsletter sign-up: stop returning the confirmation token ----------------
create or replace function public.register_newsletter_subscriber(
    email_input text,
    first_name_input text default '',
    area_input text default 'All Georgina',
    audience_input text default 'reader'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    clean_email text := lower(trim(email_input));
    sub_record public.newsletter_subscribers%rowtype;
begin
    if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        raise exception 'Invalid email address' using errcode = '22023';
    end if;

    insert into public.newsletter_subscribers (email, first_name, community_area, audience_type, status)
    values (
        clean_email,
        coalesce(trim(first_name_input), ''),
        coalesce(nullif(trim(area_input), ''), 'All Georgina'),
        case when audience_input in ('reader', 'vendor', 'both') then audience_input else 'reader' end,
        'pending'
    )
    on conflict (email) do update
    set first_name = case when excluded.first_name <> '' then excluded.first_name else public.newsletter_subscribers.first_name end,
        community_area = excluded.community_area,
        audience_type = excluded.audience_type,
        status = case when public.newsletter_subscribers.status = 'active' then 'active' else 'pending' end
    returning * into sub_record;

    -- The confirmation token is intentionally NOT returned. The send-email
    -- function looks it up server-side and puts it in the confirmation email.
    return jsonb_build_object(
        'email', sub_record.email,
        'first_name', sub_record.first_name,
        'community_area', sub_record.community_area,
        'audience_type', sub_record.audience_type,
        'status', sub_record.status
    );
end;
$$;

commit;

-- ----------------------------------------------------------------------------
-- Check (read-only): expect 4 new columns and the two insert policies.
-- select column_name from information_schema.columns
--  where table_name = 'vendor_events' and column_name like 'verif%';
-- select policyname, with_check from pg_policies
--  where tablename = 'vendor_events' and cmd = 'INSERT';
-- ----------------------------------------------------------------------------
