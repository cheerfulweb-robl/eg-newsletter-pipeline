-- ============================================================================
-- Scheduled Spotlight for /spotlight (site v63), 2026-11-15
--
-- Admins choose which approved listing (event, sale or dining special, all stored in
-- vendor_events) is the "Current Active Spotlight", and from when until when.
-- When nothing is scheduled the page falls back to a listing flagged featured, then
-- to a random current event (handled in the page, not here).
--
--   spotlight_schedule        table, admins edit / staff read (RLS)
--   wg_active_spotlight()     public: the listing id that is the spotlight right now
--                             (null if none). Only approved listings are returned.
--
-- Run in the Supabase SQL Editor AFTER 20261121. Safe to re-run.
-- ============================================================================

-- 1. Table ---------------------------------------------------------------------------
create table if not exists public.spotlight_schedule (
    id uuid primary key default gen_random_uuid(),
    listing_id uuid not null references public.vendor_events (id) on delete cascade,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    priority int not null default 0,
    active boolean not null default true,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid default auth.uid(),
    constraint spotlight_schedule_window check (ends_at > starts_at),
    constraint spotlight_schedule_priority check (priority between -100 and 100),
    constraint spotlight_schedule_notes_len check (notes is null or char_length(notes) <= 1000)
);

create index if not exists spotlight_schedule_window_idx on public.spotlight_schedule (active, starts_at, ends_at);
create index if not exists spotlight_schedule_listing_idx on public.spotlight_schedule (listing_id);

create or replace function public.wg_spotlight_schedule_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists spotlight_schedule_touch on public.spotlight_schedule;
create trigger spotlight_schedule_touch before update on public.spotlight_schedule
    for each row execute function public.wg_spotlight_schedule_touch();

-- 2. Access: admins edit, staff (incl. viewers) read, the public goes through the function below.
alter table public.spotlight_schedule enable row level security;
revoke all on public.spotlight_schedule from anon;
grant select, insert, update, delete on public.spotlight_schedule to authenticated;

drop policy if exists spotlight_schedule_staff_read on public.spotlight_schedule;
create policy spotlight_schedule_staff_read on public.spotlight_schedule
    for select to authenticated using (public.wg_is_trusted_caller());

drop policy if exists spotlight_schedule_admin_insert on public.spotlight_schedule;
create policy spotlight_schedule_admin_insert on public.spotlight_schedule
    for insert to authenticated with check (public.is_admin());

drop policy if exists spotlight_schedule_admin_update on public.spotlight_schedule;
create policy spotlight_schedule_admin_update on public.spotlight_schedule
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists spotlight_schedule_admin_delete on public.spotlight_schedule;
create policy spotlight_schedule_admin_delete on public.spotlight_schedule
    for delete to authenticated using (public.is_admin());

-- 3. Public: the spotlight right now (highest priority, then the most recently started) --
create or replace function public.wg_active_spotlight()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select s.listing_id
      from public.spotlight_schedule s
      join public.vendor_events v on v.id = s.listing_id and v.status = 'approved'
     where s.active and now() >= s.starts_at and now() < s.ends_at
     order by s.priority desc, s.starts_at desc, s.created_at desc
     limit 1;
$$;

revoke all on function public.wg_active_spotlight() from public;
grant execute on function public.wg_active_spotlight() to anon, authenticated, service_role;
