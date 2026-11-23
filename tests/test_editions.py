import json
import unittest
from datetime import date

from src.editions import build_edition_days, build_edition_html, edition_subject, edition_window, occurrence_days

MON = date(2026, 11, 16)  # a Monday
THU = date(2026, 11, 19)


def row(**kw):
    base = {"id": kw.pop("id", "x"), "status": "approved", "title": "Item", "category": "community_events", "slug": "item"}
    base.update(kw)
    return base


class EditionWindowTests(unittest.TestCase):
    def test_monday_is_monday_to_friday(self):
        w = edition_window("monday", MON)
        self.assertEqual((w[0], w[-1]), (date(2026, 11, 16), date(2026, 11, 20)))

    def test_monday_built_on_sunday_is_next_week(self):
        w = edition_window("monday", date(2026, 11, 15))
        self.assertEqual(w[0], date(2026, 11, 16))

    def test_thursday_is_this_and_next_weekend_fri_to_sun(self):
        w = edition_window("thursday", THU)
        self.assertEqual(w, [
            date(2026, 11, 20), date(2026, 11, 21), date(2026, 11, 22),
            date(2026, 11, 27), date(2026, 11, 28), date(2026, 11, 29),
        ])

    def test_subject(self):
        self.assertIn("This Weekend", edition_subject("thursday", edition_window("thursday", THU)))
        self.assertIn("Nov 16–20", edition_subject("monday", edition_window("monday", MON)))


class OccurrenceTests(unittest.TestCase):
    def setUp(self):
        self.mon = edition_window("monday", MON)
        self.thu = edition_window("thursday", THU)

    def test_one_day_event(self):
        days, ongoing = occurrence_days(row(event_start_date="2026-11-18", expires_after="2026-11-18"), self.mon)
        self.assertEqual(days, [date(2026, 11, 18)])
        self.assertFalse(ongoing)

    def test_saturday_event_not_in_monday_edition(self):
        days, _ = occurrence_days(row(event_start_date="2026-11-21", expires_after="2026-11-21"), self.mon)
        self.assertEqual(days, [])

    def test_friday_in_both_editions(self):
        r = row(event_start_date="2026-11-20", expires_after="2026-11-20")
        self.assertEqual(occurrence_days(r, self.mon)[0], [date(2026, 11, 20)])
        self.assertEqual(occurrence_days(r, self.thu)[0], [date(2026, 11, 20)])

    def test_multi_day_listed_each_day(self):
        days, ongoing = occurrence_days(row(event_start_date="2026-11-20", expires_after="2026-11-21"), self.thu)
        self.assertEqual(days, [date(2026, 11, 20), date(2026, 11, 21)])
        self.assertFalse(ongoing)

    def test_long_running_sale_is_ongoing(self):
        days, ongoing = occurrence_days(row(category="special_sale", event_start_date="2026-11-01", expires_after="2026-12-31"), self.thu)
        self.assertEqual(len(days), 6)
        self.assertTrue(ongoing)

    def test_thursday_includes_next_weekend_but_excludes_midweek_between(self):
        midweek = row(event_start_date="2026-11-24", expires_after="2026-11-24")
        next_sat = row(event_start_date="2026-11-28", expires_after="2026-11-28")
        self.assertEqual(occurrence_days(midweek, self.thu)[0], [])
        self.assertEqual(occurrence_days(next_sat, self.thu)[0], [date(2026, 11, 28)])

    def test_recurring_weekday(self):
        r = row(date_type="recurring", recurrence_rule="Friday", event_start_date="2026-11-10", expires_after=None)
        self.assertEqual(occurrence_days(r, self.mon)[0], [date(2026, 11, 20)])
        self.assertEqual(occurrence_days(r, self.thu)[0], [date(2026, 11, 20), date(2026, 11, 27)])

    def test_recurring_ended(self):
        r = row(date_type="recurring", recurrence_rule="Saturday", expires_after="2026-11-14")
        self.assertEqual(occurrence_days(r, self.thu)[0], [])

    def test_monthly_nth_weekday_only_matches_that_day(self):
        # Nov 19, 2026 is the 3rd Thursday of Nov; in MON window (Nov 16-20) it matches Nov 19 only
        r = row(date_type="recurring", recurrence_rule="3rd Thursday of every month", event_start_date="2026-11-01", expires_after="2027-03-31")
        self.assertEqual(occurrence_days(r, self.mon)[0], [date(2026, 11, 19)])
        self.assertEqual(occurrence_days(r, self.thu)[0], [])

    def test_multiple_dates(self):
        rule = json.dumps([{"date": "2026-11-17"}, {"date": "2026-11-22"}])
        r = row(date_type="multiple", recurrence_rule=rule, event_start_date="2026-11-17", expires_after="2026-11-22")
        self.assertEqual(occurrence_days(r, self.mon)[0], [date(2026, 11, 17)])
        self.assertEqual(occurrence_days(r, self.thu)[0], [date(2026, 11, 22)])

    def test_undated_label_parsed(self):
        r = row(event_date_label="Saturday, November 21, 2026")
        self.assertEqual(occurrence_days(r, self.thu)[0], [date(2026, 11, 21)])

    def test_every_tuesday_label_on_long_range(self):
        r = row(category="dining", event_start_date="2026-11-17", expires_after="2027-11-28", event_date_label="Every Tuesday")
        self.assertEqual(occurrence_days(r, self.mon)[0], [date(2026, 11, 17)])

    def test_weekly_hours_json_rule(self):
        rule = json.dumps({"Mon": {"enabled": False}, "Sun": {"enabled": True}})
        r = row(category="dining", date_type="recurring", recurrence_rule=rule, event_start_date="2026-11-15", expires_after="2027-03-28")
        self.assertEqual(occurrence_days(r, self.mon)[0], [])
        self.assertEqual(occurrence_days(r, self.thu)[0], [date(2026, 11, 22), date(2026, 11, 29)])

    def test_placeholder_range_uses_date_line(self):
        r = row(category="Community", event_start_date="2026-11-17", expires_after="2026-12-30", event_date_label="Tue, Nov 17, 2026 7:00 PM")
        self.assertEqual(occurrence_days(r, self.mon)[0], [date(2026, 11, 17)])
        self.assertEqual(occurrence_days(r, self.thu)[0], [])

    def test_placeholder_range_without_date_left_out(self):
        r = row(category="Community", event_start_date="2026-11-15", expires_after="2026-12-30", event_date_label="Upcoming Resort Event")
        self.assertEqual(occurrence_days(r, self.thu)[0], [])

    def test_undated_without_date_skipped(self):
        self.assertEqual(occurrence_days(row(event_date_label="Ongoing"), self.thu)[0], [])


class BuildTests(unittest.TestCase):
    def test_news_left_out_and_category_order(self):
        rows = [
            row(id="1", title="Council notice", category="municipal_news", event_start_date="2026-11-21", expires_after="2026-11-21"),
            row(id="2", title="Zed sale", category="special_sale", event_start_date="2026-11-21", expires_after="2026-11-21"),
            row(id="3", title="Fish Fry", category="dining", event_start_date="2026-11-21", expires_after="2026-11-21"),
            row(id="4", title="Craft Fair", category="community_events", event_start_date="2026-11-21", expires_after="2026-11-21"),
            row(id="5", title="Pending one", status="pending", event_start_date="2026-11-21", expires_after="2026-11-21"),
        ]
        window = edition_window("thursday", THU)
        ongoing, by_day = build_edition_days(rows, window)
        titles = [it["_title"] for it in by_day[date(2026, 11, 21)]]
        self.assertEqual(titles, ["Craft Fair", "Fish Fry", "Zed sale"])
        self.assertEqual(ongoing, [])

    def test_html_has_days_labels_and_news_link(self):
        rows = [row(id="4", title="Craft Fair", event_start_date="2026-11-21", expires_after="2026-11-21")]
        page, shown = build_edition_html("thursday", rows, THU)
        self.assertEqual(shown, 1)
        self.assertIn("1 things to do in this edition.", page)
        self.assertIn("Click here to search instead", page)
        self.assertIn("Saturday", page)
        self.assertIn("Community Events", page)
        self.assertIn("Read Local News", page)
        self.assertIn("UNSUBSCRIBE_TOKEN", page)
        self.assertNotIn("Council", page)

    def test_title_is_escaped(self):
        rows = [row(id="9", title="<script>x</script>", event_start_date="2026-11-21", expires_after="2026-11-21")]
        page, _ = build_edition_html("thursday", rows, THU)
        self.assertNotIn("<script>x", page)

    def test_positional_and_consecutive_newsletter_ads_and_append_at_end(self):
        rows = [
            row(id="1", title="First Event", event_start_date="2026-11-21", expires_after="2026-11-21"),
            row(id="2", title="Second Event", event_start_date="2026-11-21", expires_after="2026-11-21"),
        ]
        ads = [
            {"id": "ad2b", "sponsor_name": "Sponsor 2B", "headline": "Ad 2B", "target_url": "/businesses/b", "insert_after_index": 2, "sub_order": "b", "active": True},
            {"id": "ad2a", "sponsor_name": "Sponsor 2A", "headline": "Ad 2A", "target_url": "/events/a", "insert_after_index": 2, "sub_order": "a", "active": True},
            {"id": "ad99", "sponsor_name": "Sponsor End", "headline": "Ad End", "target_url": "https://example.com", "insert_after_index": 99, "sub_order": "a", "active": True},
        ]
        page, shown = build_edition_html("thursday", rows, THU, ads=ads)
        self.assertEqual(shown, 2)
        self.assertIn("Sponsored", page)
        pos_first = page.index("First Event")
        pos_second = page.index("Second Event")
        pos_2a = page.index("Ad 2A")
        pos_2b = page.index("Ad 2B")
        pos_end = page.index("Ad End")
        self.assertLess(pos_first, pos_second)
        self.assertLess(pos_second, pos_2a)
        self.assertLess(pos_2a, pos_2b)
        self.assertLess(pos_2b, pos_end)


if __name__ == "__main__":
    unittest.main()
