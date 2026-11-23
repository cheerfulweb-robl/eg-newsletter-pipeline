-- Read-only: confirms the 2026-11-15 security files were applied. Run in the SQL editor;
-- every row should say true. Changes nothing.
select 'verify-token guard trigger (20261124)' as check, exists (
    select 1 from pg_trigger where tgname = 'wg_vendor_events_guard_insert') as ok
union all
select 'newsletter insert must be pending (20261124)', exists (
    select 1 from pg_policies where tablename = 'newsletter_subscribers'
      and policyname = 'Public can subscribe to newsletter' and with_check like '%pending%')
union all
select 'image_url https check (20261124)', exists (
    select 1 from pg_constraint where conname = 'vendor_events_image_url_check')
union all
select 'public cannot read submitter_email (20261125)',
    not has_column_privilege('anon', 'public.vendor_events', 'submitter_email', 'SELECT')
union all
select 'public can still read listing titles (20261125)',
    has_column_privilege('anon', 'public.vendor_events', 'title', 'SELECT')
union all
select 'viewer read-only trigger on vendor_events (20261126)', exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'wg_block_viewer_writes' and c.relname = 'vendor_events')
union all
select 'every SECURITY DEFINER function has a search_path (20261127)', not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'))
union all
select 'email rate log table (20261128)', to_regclass('public.email_rate_log') is not null;

-- Who has which role (expect 1 admin, 2 viewers):
-- select role, active, count(*) from public.user_profiles group by 1, 2;

-- Added with 20261201_pen_test_fixes.sql (every row should say true):
select 'signed-in users cannot read submitter_email (20261201)' as check,
    not has_column_privilege('authenticated', 'public.vendor_events', 'submitter_email', 'SELECT') as ok
union all
select 'signed-in users can still read listing titles (20261201)',
    has_column_privilege('authenticated', 'public.vendor_events', 'title', 'SELECT')
union all
select 'newsletter token guard trigger (20261201)', exists (
    select 1 from pg_trigger where tgname = 'wg_newsletter_guard_insert')
union all
select 'owners cannot update listings directly (20261201)', not exists (
    select 1 from pg_policies where tablename = 'vendor_events' and policyname = 'Submitters or admins can update pending event')
union all
select 'staff update rule present (20261201)', exists (
    select 1 from pg_policies where tablename = 'vendor_events' and policyname = 'Staff can update events')
union all
select 'email rate function is server-only (20261201)',
    to_regprocedure('public.wg_email_rate_allow(text, text, int, int)') is not null
    and not has_function_privilege('anon', 'public.wg_email_rate_allow(text, text, int, int)', 'EXECUTE')
union all
select 'backup tables locked (20261201)', not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'vendor_events\_%' escape '\' and c.relkind = 'r' and not c.relrowsecurity);

-- Subscriber management (20261201 section 8): both should say true
select 'admins can add subscribers' as check, exists (select 1 from pg_policies where tablename = 'newsletter_subscribers' and policyname = 'Admins can add subscribers') as ok
union all
select 'admins can delete subscribers', exists (select 1 from pg_policies where tablename = 'newsletter_subscribers' and policyname = 'Admins can delete subscribers');
