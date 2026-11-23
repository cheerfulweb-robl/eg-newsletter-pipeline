import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class TestConfigSync(unittest.TestCase):
    def setUp(self):
        self.master_config = ROOT / "website" / "shared" / "config.js"
        self.news_config = ROOT / "website" / "news" / "assets" / "config.js"
        self.staff_config = ROOT / "website" / "staff" / "assets" / "config.js"
        self.docs_config = ROOT / "docs" / "assets" / "config.js"

    def test_master_config_exists(self):
        self.assertTrue(self.master_config.exists(), "website/shared/config.js must exist")
        content = self.master_config.read_text(encoding="utf-8")
        self.assertIn("SUPABASE_URL", content)
        self.assertIn("SUPABASE_ANON_KEY", content)

    def test_copies_match_master(self):
        master_text = self.master_config.read_text(encoding="utf-8")
        for path in [self.news_config, self.staff_config, self.docs_config]:
            self.assertTrue(path.exists(), f"{path} must exist")
            self.assertEqual(path.read_text(encoding="utf-8"), master_text, f"{path} must match website/shared/config.js")

    def test_all_website_html_use_shared_config(self):
        website = ROOT / "website"
        script_pattern = re.compile(r'<script\s+src=[\"\']([^\"\']*config\.js(?:\?[^\"\']*)?)[\"\']></script>')
        for html_path in website.rglob("*.html"):
            content = html_path.read_text(encoding="utf-8")
            matches = script_pattern.findall(content)
            for m in matches:
                self.assertTrue(
                    m.startswith("/shared/config.js"),
                    f"{html_path.relative_to(ROOT)} loads {m}; must load /shared/config.js"
                )

if __name__ == "__main__":
    unittest.main()
