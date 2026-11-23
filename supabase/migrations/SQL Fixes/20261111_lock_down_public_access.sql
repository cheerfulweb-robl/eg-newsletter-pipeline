-- ============================================================================
-- Security hardening: limit public access to the database
--
-- 1. Raw click logs (visitor hashes, user agents) readable by staff/admins only.
-- 2. Click summary view respects the caller's permissions (security_invoker),
--    so anonymous visitors can no longer read click totals through it.
-- 3. Crawler audit reports in newsletter_settings readable by staff/admins only.
-- 4. Vendor-submitted event links must be http(s) URLs.
--
-- Review before running. Run in the Supabase SQL editor, or with `supabase db push`.
-- The Python pipeline and the admin/audit pages need the service key or a
-- signed-in staff/admin session to read the restricted data.
-- ============================================================================

-- 1. Raw click analytics: staff and admins only
drop policy if exists "Public and authenticated users can read click analytics" on public.link_clicks;
drop policy if exists "Staff can read click analytics" on public.link_clicks;
create policy "Staff can read click analytics"
    on public.link_clicks for select
    using (public.is_admin() or public.is_staff());

-- 2. Summary view runs with the caller's rights, so link_clicks policies apply
alter view public.advertiser_click_summary set (security_invoker = true);
revoke select on public.advertiser_click_summary from anon;

-- 3. Newsletter settings: public can read normal settings, but not crawler audit logs
drop policy if exists "Public can read newsletter settings" on public.newsletter_settings;
drop policy if exists "Public can read public newsletter settings" on public.newsletter_settings;
create policy "Public can read public newsletter settings"
    on public.newsletter_settings for select
    using (setting_key not like 'crawl_audit_%');

drop policy if exists "Staff can read crawl audit settings" on public.newsletter_settings;
create policy "Staff can read crawl audit settings"
    on public.newsletter_settings for select
    using (
        setting_key like 'crawl_audit_%'
        and (public.is_admin() or public.is_staff())
    );

-- 4. Vendor event links must be http(s). NOT VALID checks new and updated rows
--    without failing on existing data; run the VALIDATE line once old rows are fixed.
alter table public.vendor_events
    drop constraint if exists vendor_events_link_http_check;
alter table public.vendor_events
    add constraint vendor_events_link_http_check
    check (link ~* '^https?://') not valid;
-- alter table public.vendor_events validate constraint vendor_events_link_http_check;
