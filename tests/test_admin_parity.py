import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class TestAdminParityGuardrails(unittest.TestCase):
    def setUp(self):
        self.approvals_html = (ROOT / "website" / "staff" / "admin-approvals.html").read_text(encoding="utf-8")

    def test_facebook_post_uses_monday_thursday_edition_windows(self):
        self.assertIn("getWindowDates(", self.approvals_html)
        self.assertIn("itemMatchesEditionWindow(", self.approvals_html)
        self.assertIn("fb-sched-monday", self.approvals_html)
        self.assertIn("fb-sched-thursday", self.approvals_html)

    def test_internal_submitter_email_uses_crawler_and_skips_approval_email(self):
        self.assertIn("crawler@welcomeeg.ca", self.approvals_html)
        self.assertIn("isInternalSubmitter", self.approvals_html)

    def test_title_scoped_blacklist_requires_title(self):
        from src.supabase_client import is_url_blacklisted

        rules = [
            {
                "target_url": "https://suttonlegion.org/events/",
                "match_type": "exact_url",
                "title_keyword": "Clubroom Open",
            }
        ]
        # Feed URL check without title must not block the whole site
        self.assertFalse(is_url_blacklisted("https://suttonlegion.org/events/", rules))
        # Item check with matching title must block
        self.assertTrue(
            is_url_blacklisted(
                "https://suttonlegion.org/events/",
                rules,
                title="Friday Clubroom Open 4pm",
            )
        )


if __name__ == "__main__":
    unittest.main()
