'''Guardrail Test: Header Navigation Menu Canonical Order & Immutability.

Enforces that the navigation menu code across ALL surfaces (React Navbar.jsx,
all static HTML pages in website/ and docs/, and website/shared/config.js)
strictly preserves the exact canonical order:

    1. Events       (/events)
    2. Dining       (/dining)
    3. Sales        (/sales)
    4. Businesses   (/directory)
    5. Weather      (/weather)
    6. Hamper       (/hamper/)
    7. News         (/news/newsroom.html)

Per Working Rule 8 in HANDOVER_2026-11-17.md:
THE NAVIGATION MENU CODE IS FROZEN AND MUST NOT BE TOUCHED UNLESS EXPLICITLY
REQUESTED BY ROBERT.
'''

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CANONICAL_ORDER = [
    "/events",
    "/dining",
    "/sales",
    "/directory",
    "/weather",
    "/hamper/",
    "/news/newsroom.html",
]


class TestNavigationCanonicalOrder(unittest.TestCase):
    def test_all_static_html_match_canonical_order(self):
        '''Every static HTML page with site-header-nav must have the exact canonical order.'''
        checked = 0
        for folder in ["website", "docs"]:
            for html_path in (ROOT / folder).rglob("*.html"):
                text = html_path.read_text(encoding="utf-8")
                nav_match = re.search(r'<nav[^>]*site-header-nav[^>]*>([\s\S]*?)</nav>', text)
                if not nav_match:
                    continue

                nav_content = nav_match.group(1)
                links = re.findall(r'<a\s+[^>]*href="([^"]+)"[^>]*>[\s\S]*?</a>', nav_content)
                filtered = [l for l in links if l in CANONICAL_ORDER]

                self.assertEqual(
                    filtered,
                    CANONICAL_ORDER,
                    f"Navigation order violation in {html_path.relative_to(ROOT)}! Expected {CANONICAL_ORDER}, got {filtered}"
                )
                checked += 1

        self.assertGreaterEqual(checked, 20, "Must check at least 20 static HTML pages with site-header-nav")

    def test_react_navbar_matches_canonical_order(self):
        '''Navbar.jsx desktop navigation must list links in canonical order.'''
        navbar_path = ROOT / "site-src" / "src" / "components" / "Navbar.jsx"
        self.assertTrue(navbar_path.exists(), "Navbar.jsx must exist")
        text = navbar_path.read_text(encoding="utf-8")

        start_tag = 'min-[1025px]:flex'
        self.assertIn(start_tag, text, "Desktop navigation block must exist in Navbar.jsx")
        start_idx = text.find(start_tag)
        desktop_nav = text[start_idx:start_idx + 15000]

        # Check positions of the 7 sections
        p_events = desktop_nav.find('to="/events"')
        p_dining = desktop_nav.find('to="/dining"')
        p_sales = desktop_nav.find('to="/sales"')
        p_directory = desktop_nav.find('to="/directory"')
        p_weather = desktop_nav.find('to="/weather"')
        p_hamper = desktop_nav.find('href="/hamper/"')
        p_news = desktop_nav.find('href="/news/newsroom.html"')

        positions = [
            ("events", p_events),
            ("dining", p_dining),
            ("sales", p_sales),
            ("directory", p_directory),
            ("weather", p_weather),
            ("hamper", p_hamper),
            ("news", p_news),
        ]

        for name, pos in positions:
            self.assertNotEqual(pos, -1, f"Link {name} must be present in Navbar.jsx desktop navigation")

        ordered = [name for name, _ in sorted(positions, key=lambda x: x[1])]
        expected = ["events", "dining", "sales", "directory", "weather", "hamper", "news"]
        self.assertEqual(ordered, expected, f"Navbar.jsx desktop link order violation: expected {expected}, got {ordered}")

    def test_config_js_enforces_canonical_order(self):
        '''website/shared/config.js must contain canonical order definitions and runtime DOM sorting.'''
        config_path = ROOT / "website" / "shared" / "config.js"
        self.assertTrue(config_path.exists(), "website/shared/config.js must exist")
        text = config_path.read_text(encoding="utf-8")

        self.assertIn("Canonical header navigation link order", text)
        self.assertIn("getNavItemRank", text)
        self.assertIn("headerNav.insertBefore(el, authContainer)", text)


if __name__ == "__main__":
    unittest.main()
