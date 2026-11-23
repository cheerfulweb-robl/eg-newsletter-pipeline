"""Staff account menu: no duplicate destinations, static and React menus agree,
old sidebar / pill bars are gone, and every staff page has a footer."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "website"
CONFIG = (WEB / "shared" / "config.js").read_text(encoding="utf-8")
SPA = (ROOT / "site-src" / "src" / "utils" / "staffMenu.js").read_text(encoding="utf-8")

# Pages that are redirects / non-UI shells and have no visible layout.
NO_FOOTER_REQUIRED = {"index.html", "login.html", "admin-dining.html", "admin-events.html", "admin-sales.html"}


def static_items():
    block = CONFIG[CONFIG.index("const WG_STAFF_MENU"):CONFIG.index("function buildStaffMenuHtml")]
    return re.findall(r'\["([^"]+)", "([^"]+)", "[^"]*", "(editorial|admin)"\]', block)


def spa_items():
    return [(h, l.replace("&amp;", "&"), t) for h, l, t in
            re.findall(r"href: '([^']+)', label: '([^']+)', tier: '(editorial|admin)'", SPA)]


class TestStaffMenu(unittest.TestCase):
    def test_no_duplicate_destinations_or_names(self):
        for items in (static_items(), spa_items()):
            self.assertGreater(len(items), 10)
            hrefs = [i[0] for i in items]
            labels = [i[1] for i in items]
            self.assertEqual(len(hrefs), len(set(hrefs)), "duplicate destination in menu")
            self.assertEqual(len(labels), len(set(labels)), "duplicate label in menu")

    def test_static_and_react_menus_match(self):
        self.assertEqual(static_items(), spa_items())

    def test_sidebar_and_pill_bar_removed(self):
        pages = list((WEB / "staff").glob("*.html")) + [WEB / "hamper" / "admin.html"]
        for p in pages:
            html = re.sub(r"<style.*?</style>", "", p.read_text(encoding="utf-8"), flags=re.S)
            self.assertNotIn('<aside class="admin-sidebar"', html, p.name)
            self.assertNotIn('class="admin-nav-bar"', html, p.name)

    def test_staff_pages_have_footer(self):
        for p in (WEB / "staff").glob("*.html"):
            if p.name in NO_FOOTER_REQUIRED:
                continue
            html = p.read_text(encoding="utf-8")
            self.assertIn('<header class="site-header', html, f"{p.name} has no site-header")
            self.assertIn('class="site-header-nav"', html, f"{p.name} has no site-header-nav")
            self.assertIn('id="user-badge"', html, f"{p.name} has no user-badge")
            self.assertIn('<footer class="site-footer">', html, f"{p.name} has no footer")
        for extra in [
            WEB / "hamper" / "admin.html",
            WEB / "hamper" / "index.html",
            WEB / "hamper" / "redeem.html",
            WEB / "hamper" / "wallet.html",
            WEB / "hamper" / "confirmed.html",
            WEB / "business" / "index.html",
            WEB / "news" / "newsroom.html",
        ]:
            html = extra.read_text(encoding="utf-8")
            self.assertIn('<header class="site-header', html, f"{extra.relative_to(WEB)} has no site-header")
            self.assertIn('class="site-header-nav"', html, f"{extra.relative_to(WEB)} has no site-header-nav")
            self.assertIn('<footer class="site-footer">', html, f"{extra.relative_to(WEB)} has no footer")


if __name__ == "__main__":
    unittest.main()
