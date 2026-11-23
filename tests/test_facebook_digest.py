import unittest
from urllib.parse import unquote_plus
from src.compiler import build_newsletter_facebook_digest, _build_tracked_url, to_facebook_bold

class TestFacebookDigest(unittest.TestCase):
    def test_to_facebook_bold(self):
        sample = "Tribute to Ed Sheeran 2026!"
        bolded = to_facebook_bold(sample)
        self.assertIn("𝗧𝗿𝗶𝗯𝘂𝘁𝗲", bolded)
        self.assertIn("𝟮𝟬𝟮𝟲", bolded)

    def test_build_facebook_digest_emojis_and_content(self):
        sample_articles = [
            {
                "title": "ClearWater Artisan Stand",
                "source": "ClearWater Farm",
                "date": "Saturday 10:00 AM",
                "location": "Willow Beach",
                "category": "private_business_events",
                "summary": "Local organic honey, vegetables, and artisan crafts.",
                "link": "https://clearwaterfarm.ca/events",
            },
            {
                "title": "Storytime Adventures",
                "source": "East Gwillimbury Public Library",
                "date": "Wednesdays 10:30 AM",
                "location": "Keswick Branch",
                "category": "library_events",
                "summary": "Toddler songs and picture books.",
                "link": "https://georginapubliclibrary.ca/storytime",
            },
            {
                "title": "Town Skate Night",
                "source": "Town of East Gwillimbury",
                "date": "Sundays 1:00 PM",
                "location": "Ice Palace",
                "category": "upcoming_events",
                "summary": "Family leisure skate.",
                "link": "https://georgina.ca/skating",
            }
        ]

        digest = build_newsletter_facebook_digest(sample_articles, edition="reader")

        # 1. Verify Facebook Header & Intro
        self.assertIn("WELCOME GEORGINA • COMMUNITY DIGEST", digest)
        self.assertIn("Here is everything happening across East Gwillimbury this week!", digest)

        # 2. Verify Emoji Section Headers
        self.assertIn("🛍️ 🏪 1. SMALL VENDORS, LOCAL VENUES & PRIVATE BUSINESS EVENTS", digest)
        self.assertIn("📚 📖 2. GEORGINA PUBLIC LIBRARY • UPCOMING PROGRAMS & WORKSHOPS", digest)
        self.assertIn("🏛️ 🎈 3. TOWN OF GEORGINA • UPCOMING COMMUNITY EVENTS", digest)

        # 3. Verify Item Cards & Unicode Bold Titles
        bold_title = to_facebook_bold("ClearWater Artisan Stand")
        self.assertIn(f"📌 {bold_title}", digest)
        self.assertIn("📅 When: Saturday 10:00 AM", digest)
        self.assertIn("📍 Where: Willow Beach", digest)
        self.assertIn("📝 Local organic honey, vegetables, and artisan crafts.", digest)
        self.assertIn("🔗 Details & Tickets:", digest)

        # 4. Verify Explicit Skipped Lines (\r\n\r\n) between card fields so Facebook composer doesn't collapse lines
        self.assertIn(f"📌 {bold_title}\r\n\r\n📅 When: Saturday 10:00 AM", digest)
        self.assertIn("📅 When: Saturday 10:00 AM\r\n\r\n📍 Where: Willow Beach", digest)
        self.assertIn("📍 Where: Willow Beach\r\n\r\n🏷️ Source: ClearWater Farm", digest)

        # 5. Verify Facebook Tracking Links & No Box Divider Lines
        decoded = unquote_plus(digest)
        self.assertIn("utm_source=facebook", decoded)
        self.assertIn("ref=facebook", digest)
        self.assertIn("go.html", digest)
        # Ensure no box-drawing horizontal lines or underscores that cause distortion
        self.assertNotIn("────", digest)
        self.assertNotIn("━━━━", digest)

    def test_blacklist_title_keyword_suppression(self):
        from src.supabase_client import is_url_blacklisted
        rules = [
            {"target_url": "https://suttonlegion.org/events/", "title_keyword": "Clubroom Open", "match_type": "exact_url"},
            {"target_url": "https://suttonlegion.org/events/", "title_keyword": "Progressive Euchre", "match_type": "exact_url"},
        ]
        self.assertTrue(is_url_blacklisted("https://suttonlegion.org/events/", rules, title="Clubroom Open"))
        self.assertTrue(is_url_blacklisted("https://suttonlegion.org/events/", rules, title="Progressive Euchre (Tuesdays)"))
        self.assertFalse(is_url_blacklisted("https://suttonlegion.org/events/", rules, title="Remembrance Day Parade & Ceremony"))

    def test_local_news_excluded_from_facebook_digest(self):
        sample_articles = [
            {
                "title": "Town Upgrades Waterfront Trails",
                "source": "Town of East Gwillimbury",
                "date": "Nov 04, 2026",
                "location": "Willow Beach",
                "category": "local_news",
                "summary": "Official newsroom media release on park trail expansions.",
                "link": "https://georgina.ca/news/trails",
            },
            {
                "title": "Artisans Market in Keswick",
                "source": "Keswick Market",
                "date": "Saturday 10:00 AM",
                "location": "Keswick",
                "category": "private_business_events",
                "summary": "Local crafts and food.",
                "link": "https://keswickmarket.ca",
            }
        ]
        digest = build_newsletter_facebook_digest(sample_articles, edition="reader")
        # Local news MUST NOT appear in the Facebook digest
        self.assertNotIn("Town Upgrades Waterfront Trails", digest)
        self.assertNotIn("Official newsroom media release", digest)
        # Other community events MUST appear
        bold_market = to_facebook_bold("Artisans Market in Keswick")
        self.assertIn(bold_market, digest)

    def test_tracked_url_facebook_platform(self):
        url = _build_tracked_url(
            raw_url="https://example.com/tickets",
            title="Concert Tickets",
            source="Stephen Leacock Theatre",
            category="theatre_events",
            issue_iso="2026-11-05",
            platform="facebook"
        )
        decoded = unquote_plus(url)
        self.assertIn("utm_source=facebook", decoded)
        self.assertIn("ref=facebook", url)
        self.assertIn("Stephen Leacock Theatre [Facebook]", decoded)

if __name__ == '__main__':
    unittest.main()
