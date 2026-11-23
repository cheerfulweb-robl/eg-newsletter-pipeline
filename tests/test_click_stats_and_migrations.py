"""Checks for click stats management, admin exclusion, monthly archives,
unified business/admin stats portal, and newsletter merge SQL migrations."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIG = ROOT / "supabase" / "migrations"


class TestClickStatsAndMigrations(unittest.TestCase):
    def test_migrations_exist_and_define_required_objects(self):
        m15 = (MIG / "20261215_sponsor_business_page.sql").read_text(encoding="utf-8")
        self.assertIn("'business'", m15)
        self.assertIn("business_slug", m15)

        m16 = (MIG / "20261216_merge_newsletter_editions.sql").read_text(encoding="utf-8")
        self.assertIn("wants_monday = true", m16)
        self.assertIn("wants_thursday = true", m16)
        self.assertIn("register_newsletter_subscriber", m16)

        m17 = (MIG / "20261217_click_stats_archives_and_search_category.sql").read_text(encoding="utf-8")
        for token in [
            "wg_is_admin_page",
            "wg_record_search_click",
            "click_monthly_archives",
            "wg_archive_month_clicks",
            "wg_ensure_monthly_archives",
            "wg_list_click_archives",
            "wg_get_click_archive",
            "wg_click_report",
            "wg_my_business_report",
            "search_items",
            "monthly",
        ]:
            self.assertIn(token, m17)

    def test_staff_clicks_has_search_sort_archives_print_and_search_category(self):
        html = (ROOT / "website" / "staff" / "clicks.html").read_text(encoding="utf-8")
        for token in [
            'id="global-search"',
            'class="sort-th"',
            'id="f-archive"',
            'id="btn-print"',
            'id="search-tbody"',
            'Searches &amp; Search Results',
            'wg_ensure_monthly_archives',
            '<footer class="site-footer">',
        ]:
            self.assertIn(token, html)

    def test_business_stats_portal_has_exclusive_numbers_chart_toggle_and_footer(self):
        html = (ROOT / "website" / "business" / "index.html").read_text(encoding="utf-8")
        for token in [
            'id="mode-numbers"',
            'id="mode-chart"',
            'id="panel-numbers"',
            'id="panel-chart"',
            'id="cadence-day"',
            'id="cadence-month"',
            'id="admin-biz-select"',
            'id="r-archive"',
            'id="search-body"',
            'Searches &amp; Search Results',
            'setViewMode("numbers")',
            '<footer class="site-footer">',
        ]:
            self.assertIn(token, html)


if __name__ == "__main__":
    unittest.main()
