import unittest
from datetime import date

from src.compiler import sort_items_chronologically


class SortItemsChronologicallyTest(unittest.TestCase):
    def test_edition_day_first_then_upcoming_then_past_then_undated(self):
        thursday = date(2026, 11, 12)
        items = [
            {"title": "Undated A", "date": ""},
            {"title": "Next week", "date": "Nov 19, 2026"},
            {"title": "Last week", "date": "2026-11-05"},
            {"title": "Edition day", "date": "Thu, Nov 12 2026"},
            {"title": "Undated B", "date": "Ongoing"},
            {"title": "Two weeks ago", "date": "October 29, 2026"},
            {"title": "Tomorrow", "date": "2026-11-13"},
        ]
        ordered = [it["title"] for it in sort_items_chronologically(items, thursday)]
        self.assertEqual(
            ordered,
            ["Edition day", "Tomorrow", "Next week", "Last week", "Two weeks ago", "Undated A", "Undated B"],
        )

    def test_does_not_mutate_or_drop_items(self):
        items = [{"title": "x", "date": "", "category": "library_events"}]
        out = sort_items_chronologically(items, date(2026, 11, 12))
        self.assertEqual(out, items)
        self.assertIs(out[0], items[0])


if __name__ == "__main__":
    unittest.main()
