import unittest
from unittest import mock

from src import supabase_client


class FillUnsubscribeTokensTests(unittest.TestCase):
    def test_only_missing_tokens_are_requested_and_filled(self):
        recipients = {
            "a@x.ca": {"email": "A@x.ca", "unsubscribe_token": ""},
            "b@x.ca": {"email": "b@x.ca", "unsubscribe_token": "existing"},
        }
        resp = mock.Mock(status_code=200, text="")
        resp.json.return_value = {"a@x.ca": "new-token"}
        with mock.patch.object(supabase_client.requests, "post", return_value=resp) as post:
            supabase_client._fill_unsubscribe_tokens({"url": "https://sb", "headers": {}}, recipients)
        self.assertEqual(post.call_args.kwargs["json"], {"emails_input": ["a@x.ca"]})
        self.assertEqual(recipients["a@x.ca"]["unsubscribe_token"], "new-token")
        self.assertEqual(recipients["b@x.ca"]["unsubscribe_token"], "existing")

    def test_failure_leaves_tokens_empty(self):
        recipients = {"a@x.ca": {"email": "a@x.ca", "unsubscribe_token": ""}}
        with mock.patch.object(supabase_client.requests, "post", side_effect=OSError("down")):
            supabase_client._fill_unsubscribe_tokens({"url": "https://sb", "headers": {}}, recipients)
        self.assertEqual(recipients["a@x.ca"]["unsubscribe_token"], "")


if __name__ == "__main__":
    unittest.main()
