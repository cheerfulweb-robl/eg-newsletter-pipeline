import unittest
from datetime import date
from unittest import mock

from src import supabase_client
from src.compiler import parse_event_date


def _resp(status, rows):
    r = mock.Mock(status_code=status, text="")
    r.json.return_value = rows
    return r


class YearlessDateTests(unittest.TestCase):
    def test_january_read_in_december_is_next_year(self):
        self.assertEqual(parse_event_date("Jan 9", date(2026, 12, 17)), date(2027, 1, 9))

    def test_recent_past_date_keeps_this_year(self):
        self.assertEqual(parse_event_date("Nov 1", date(2026, 11, 17)), date(2026, 11, 1))

    def test_written_year_is_kept(self):
        self.assertEqual(parse_event_date("Jan 9, 2026", date(2026, 12, 17)), date(2026, 1, 9))


class SubscriberFetchTests(unittest.TestCase):
    cfg = {"url": "https://sb", "headers": {}}

    def test_failure_raises_instead_of_sending_to_partial_list(self):
        with mock.patch.object(supabase_client, "_get_supabase_config", return_value=self.cfg), \
             mock.patch.object(supabase_client.requests, "get", return_value=_resp(500, [])):
            with self.assertRaises(RuntimeError):
                supabase_client.fetch_active_subscribers("thursday")

    def test_pages_past_1000_rows(self):
        page1 = [{"email": f"p{i}@x.ca", "unsubscribe_token": "t"} for i in range(1000)]
        page2 = [{"email": "last@x.ca", "unsubscribe_token": "t"}]
        with mock.patch.object(supabase_client, "_get_supabase_config", return_value=self.cfg), \
             mock.patch.object(supabase_client.requests, "get", side_effect=[_resp(206, page1), _resp(200, page2)]) as get:
            subs = supabase_client.fetch_active_subscribers("monday")
        self.assertEqual(len(subs), 1001)
        self.assertEqual(get.call_args_list[1].kwargs["headers"]["Range"], "1000-1999")
        self.assertEqual(get.call_args.kwargs["params"]["wants_monday"], "eq.true")
        self.assertEqual(get.call_args.kwargs["params"]["status"], "eq.active")


class SendOnceTests(unittest.TestCase):
    def _run(self, already_sent, delivered=(3, 3)):
        import os, sys, tempfile
        import main
        out = os.path.join(tempfile.mkdtemp(), "p.html")
        argv = ["main.py", "--skip-crawl", "--edition", "thursday", "--output", out]
        with (
            mock.patch.object(sys, "argv", argv),
            mock.patch.dict(os.environ, {"DRY_RUN": "", "TEST_ONLY": ""}),
            mock.patch.object(main, "fetch_edition_listings", return_value=[]),
            mock.patch.object(main, "build_edition_html", return_value=("<html></html>", 2)),
            mock.patch.object(main, "save_latest_edition"),
            mock.patch.object(main, "edition_already_sent", return_value=already_sent),
            mock.patch.object(main, "mark_edition_sent") as mark,
            mock.patch.object(main, "send_admin_alert") as alert,
            mock.patch.object(main, "dispatch_email", return_value=delivered) as send,
        ):
            try:
                main.main()
                code = 0
            except SystemExit as e:
                code = e.code
        return send, mark, alert, code

    def test_already_sent_edition_is_not_sent_again(self):
        send, mark, alert, code = self._run(already_sent=True)
        send.assert_not_called()
        self.assertEqual(code, 0)

    def test_new_edition_is_sent_and_marked(self):
        send, mark, alert, code = self._run(already_sent=False)
        send.assert_called_once()
        mark.assert_called_once()
        alert.assert_not_called()

    def test_partial_failure_alerts_admin_and_fails_the_run(self):
        send, mark, alert, code = self._run(already_sent=False, delivered=(2, 3))
        alert.assert_called_once()
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
