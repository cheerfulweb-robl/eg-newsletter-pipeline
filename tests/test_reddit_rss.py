"""Tests for Reddit community RSS ingestion and adult/abusive content filtering."""
import unittest
from unittest.mock import MagicMock, patch

from src.scraper import get_reddit_rss_feed


SAMPLE_REDDIT_ATOM = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>GeorginaOntario</title>
  <entry>
    <id>t3_safe1</id>
    <title>Huge Garage Sale and Live Music Event on Saturday in Keswick</title>
    <link href="https://www.reddit.com/r/GeorginaOntario/comments/safe1/garage_sale/" />
    <published>2026-11-19T12:00:00+00:00</published>
    <author><name>/u/keswick_neighbor</name></author>
    <content type="html">&lt;div&gt;Stop by for local crafts and coffee.&lt;/div&gt; submitted by /u/keswick_neighbor</content>
  </entry>
  <entry>
    <id>t3_nsfw1</id>
    <title>Check out my OnlyFans page</title>
    <link href="https://www.reddit.com/r/GeorginaOntario/comments/nsfw1/onlyfans/" />
    <published>2026-11-19T11:00:00+00:00</published>
    <category term="nsfw" label="NSFW" />
    <author><name>/u/spammer</name></author>
    <content type="html">18+ adult content</content>
  </entry>
  <entry>
    <id>t3_abuse1</id>
    <title>Some asshole at the intersection</title>
    <link href="https://www.reddit.com/r/GeorginaOntario/comments/abuse1/rant/" />
    <published>2026-11-19T10:00:00+00:00</published>
    <author><name>/u/angry_user</name></author>
    <content type="html">Profane abusive rant</content>
  </entry>
  <entry>
    <id>t3_automod</id>
    <title>Weekly AutoModerator thread</title>
    <link href="https://www.reddit.com/r/GeorginaOntario/comments/automod/weekly/" />
    <published>2026-11-19T09:00:00+00:00</published>
    <author><name>/u/AutoModerator</name></author>
    <content type="html">Automated weekly post</content>
  </entry>
</feed>
"""


SAMPLE_GNEWS_RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>r/GeorginaOntario - Reddit</title>
      <link>https://news.google.com/rss/articles/root</link>
      <pubDate>Thu, 23 Dec 2021 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>East Gwillimbury residents raise red flags at council meeting - Reddit</title>
      <link>https://news.google.com/rss/articles/council1</link>
      <pubDate>Fri, 10 Jul 2026 07:00:00 GMT</pubDate>
    </item>
    <item>
      <title>NSFW spam post - Reddit</title>
      <link>https://news.google.com/rss/articles/nsfw1</link>
      <pubDate>Sat, 11 Jul 2026 07:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""


class TestRedditRss(unittest.TestCase):
    @patch("src.scraper._is_blocked", return_value=False)
    @patch("src.scraper.requests.get")
    def test_reddit_rss_returns_only_safe_local_news(self, mock_get, _mock_blocked):
        resp = MagicMock()
        resp.status_code = 200
        resp.content = SAMPLE_REDDIT_ATOM
        resp.raise_for_status.return_value = None
        mock_get.return_value = resp

        items = get_reddit_rss_feed("GeorginaOntario", limit=6)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["category"], "local_news")
        self.assertEqual(items[0]["source"], "Reddit r/GeorginaOntario")
        self.assertIn("Garage Sale", items[0]["title"])
        self.assertNotIn("submitted by", items[0]["summary"].lower())

    @patch("src.scraper._is_blocked", return_value=False)
    @patch("src.scraper.requests.get")
    def test_reddit_rss_falls_back_to_google_news_on_429(self, mock_get, _mock_blocked):
        r429 = MagicMock()
        r429.status_code = 429
        r_gnews = MagicMock()
        r_gnews.status_code = 200
        r_gnews.content = SAMPLE_GNEWS_RSS
        r_gnews.raise_for_status.return_value = None
        mock_get.side_effect = [r429, r_gnews]

        items = get_reddit_rss_feed("GeorginaOntario", limit=6)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["category"], "local_news")
        self.assertEqual(items[0]["title"], "East Gwillimbury residents raise red flags at council meeting")


if __name__ == "__main__":
    unittest.main()
