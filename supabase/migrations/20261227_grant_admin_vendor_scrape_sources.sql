-- 20261227_grant_admin_vendor_scrape_sources.sql
-- Grants table permissions and admin RLS policies on public.vendor_scrape_sources
-- so /staff/sources.html and /staff/admin-approvals.html can read/insert/update/delete
-- scheduled scrape sources as an authenticated admin.
-- Safe to re-run.

begin;

grant select, insert, update, delete on table public.vendor_scrape_sources to authenticated;

alter table public.vendor_scrape_sources enable row level security;

drop policy if exists "Admins can manage vendor_scrape_sources" on public.vendor_scrape_sources;
create policy "Admins can manage vendor_scrape_sources"
  on public.vendor_scrape_sources
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'staff')
    )
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cheerfulweb@gmail.com'
  )
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'staff')
    )
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cheerfulweb@gmail.com'
  );

commit;
