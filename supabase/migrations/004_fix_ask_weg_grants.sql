-- 004_fix_ask_weg_grants.sql
-- Grants service_role access to Ask WEG discovery view, tables, and RPCs
-- so discovery-chat and discovery-lead Edge Functions never return 503.
-- Note: Make sure 20270105_ask_wg_discovery.sql and 20270106_ask_wg_admin_inbox.sql
-- have been run first. Safe to re-run.
begin;

grant select on public.discovery_search_view to service_role;
grant select on public.hamper_offers to service_role;
grant select, insert, update, delete on public.discovery_leads to service_role;
grant select, insert, update, delete on public.discovery_metrics_daily to service_role;
grant select, insert, update, delete on public.discovery_rate_limits to service_role;
grant select, insert, update, delete on public.discovery_conversations to service_role;

grant execute on function public.wg_discovery_rate_allow(text, int, int) to service_role;
grant execute on function public.wg_discovery_record_metric(text, text, int, boolean, boolean, boolean, numeric) to service_role;

commit;
