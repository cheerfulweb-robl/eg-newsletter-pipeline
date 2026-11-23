-- Business photo URL + Private admin-only notes for business directory & event listings.
-- Private notes are stored in separate tables from public.directory_listings and public.vendor_events
-- so visitors (anon) and claimed business accounts (authenticated without user_profiles admin role)
-- can never read or query admin notes via REST or client code.

alter table public.directory_listings
    add column if not exists image_url text;

create table if not exists public.directory_listing_admin_notes (
    business_id uuid primary key references public.directory_listings(id) on delete cascade,
    notes text not null default '',
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null
);

alter table public.directory_listing_admin_notes enable row level security;

revoke all on public.directory_listing_admin_notes from anon, public;
grant select, insert, update, delete on public.directory_listing_admin_notes to authenticated;

drop policy if exists "Admins only can manage directory admin notes" on public.directory_listing_admin_notes;
create policy "Admins only can manage directory admin notes"
    on public.directory_listing_admin_notes
    for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create table if not exists public.vendor_event_admin_notes (
    event_id uuid primary key references public.vendor_events(id) on delete cascade,
    notes text not null default '',
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null
);

alter table public.vendor_event_admin_notes enable row level security;

revoke all on public.vendor_event_admin_notes from anon, public;
grant select, insert, update, delete on public.vendor_event_admin_notes to authenticated;

drop policy if exists "Admins only can manage event admin notes" on public.vendor_event_admin_notes;
create policy "Admins only can manage event admin notes"
    on public.vendor_event_admin_notes
    for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

notify pgrst, 'reload schema';
