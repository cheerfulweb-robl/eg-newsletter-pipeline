"""Tests that undated local_news stories lock to the date they are synced, while undated events are skipped."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from src.supabase_client import sync_scraped_items_to_vendor_events


class TestNewsDateFallback(unittest.TestCase):
    @patch("src.supabase_client._get_all_rows", return_value=[])
    @patch("src.supabase_client._get_supabase_config", return_value={"url": "https://example.supabase.co", "headers": {"apikey": "test-key"}})
    @patch("src.supabase_client.requests.post")
    def test_undated_local_news_locks_to_today_and_undated_event_is_skipped(self, mock_post, _mock_cfg, _mock_existing):
        resp = MagicMock()
        resp.status_code = 201
        mock_post.return_value = resp

        items = [
            {
                "title": "Explore East Gwillimbury Fall Trails Guide",
                "source": "Explore East Gwillimbury",
                "date": "",
                "category": "local_news",
                "link": "https://www.exploregeorgina.ca/blog/fall-trails",
                "summary": "Explore local trails.",
            },
            {
                "title": "Undated Mystery Event",
                "source": "Local Vendor",
                "date": "",
                "category": "private_business_events",
                "link": "https://example.ca/event",
                "summary": "No date.",
            },
        ]

        inserted = sync_scraped_items_to_vendor_events(items)
        self.assertEqual(inserted, 1)
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["category"], "local_news")
        today = datetime.now().date()
        self.assertEqual(payload[0]["event_start_date"], today.strftime("%Y-%m-%d"))
        self.assertEqual(payload[0]["expires_after"], (today + timedelta(days=366)).strftime("%Y-%m-%d"))


if __name__ == "__main__":
    unittest.main()
