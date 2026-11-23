import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class TestAskWgGuardrails(unittest.TestCase):
    def test_migration_defines_required_objects_and_rls(self):
        sql = (ROOT / "supabase" / "migrations" / "20270105_ask_wg_discovery.sql").read_text(encoding="utf-8")
        self.assertIn("create or replace view public.discovery_search_view", sql)
        self.assertIn("revoke all on public.discovery_search_view from anon, authenticated;", sql)
        self.assertIn("create table if not exists public.discovery_leads", sql)
        self.assertIn("trg_discovery_leads_block_viewer", sql)
        self.assertIn("create table if not exists public.discovery_metrics_daily", sql)
        self.assertIn("wg_discovery_rate_allow", sql)

    def test_edge_functions_enforce_cors_grounding_and_consent(self):
        chat = (ROOT / "supabase" / "functions" / "discovery-chat" / "index.ts").read_text(encoding="utf-8")
        lead = (ROOT / "supabase" / "functions" / "discovery-lead" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("ALLOWED_ORIGINS", chat)
        self.assertIn("untrusted data", chat)
        self.assertIn("wg_discovery_rate_allow", chat)
        self.assertIn("isDiningRecord", chat)
        self.assertIn("score < 20", chat)
        self.assertIn("consentToContact", lead)
        self.assertIn("website_trap", lead)
        self.assertIn("escapeHtml", lead)

    def test_widget_is_mounted_in_app(self):
        app_jsx = (ROOT / "site-src" / "src" / "App.jsx").read_text(encoding="utf-8")
        widget = (ROOT / "site-src" / "src" / "components" / "AskWgWidget.jsx").read_text(encoding="utf-8")
        self.assertIn("AskWgWidget", app_jsx)
        self.assertIn("<AskWgWidget />", app_jsx)
        self.assertIn("Ask WG", widget)
        self.assertNotIn("dangerouslySetInnerHTML", widget)


if __name__ == "__main__":
    unittest.main()
