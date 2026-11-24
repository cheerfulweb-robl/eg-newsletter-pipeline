from datetime import date, datetime, timedelta, timezone

from src.facebook_poster import (
    _recent_post_exists,
    resolve_slot,
    select_afternoon_candidate,
    select_event_candidate,
    select_midday_candidate,
    with_utm,
)


def test_events_must_be_at_least_tomorrow():
    today = date(2026, 11, 23)
    now_utc = datetime(2026, 11, 23, 13, 30, tzinfo=timezone.utc)
    rows = [
        {
            "id": "ev-yesterday",
            "slug": "yesterday-ev",
            "title": "Yesterday Event",
            "status": "approved",
            "category": "community_events",
            "event_start_date": "2026-11-22",
            "expires_after": "2026-11-22",
        },
        {
            "id": "ev-today",
            "slug": "today-ev",
            "title": "Same Day Event",
            "status": "approved",
            "category": "community_events",
            "event_start_date": "2026-11-23",
            "expires_after": "2026-11-23",
        },
        {
            "id": "ev-expired-flag",
            "slug": "expired-flag",
            "title": "Expired Flag Event",
            "status": "approved",
            "category": "community_events",
            "event_start_date": "2026-11-25",
            "expires_after": "2026-11-23",
        },
        {
            "id": "ev-tomorrow",
            "slug": "tomorrow-ev",
            "title": "Tomorrow Community Market",
            "status": "approved",
            "category": "community_events",
            "event_start_date": "2026-11-24",
            "expires_after": "2026-11-24",
            "location": "Keswick, ON",
        },
    ]

    cand = select_event_candidate(rows, {}, today, now_utc)
    assert cand is not None
    assert cand.source_id == "ev-tomorrow"
    assert "https://welcomeeg.ca/events/tomorrow-ev" in cand.target_url
    assert "utm_source=facebook" in cand.target_url


def test_events_skip_already_posted():
    today = date(2026, 11, 23)
    now_utc = datetime(2026, 11, 23, 13, 30, tzinfo=timezone.utc)
    rows = [
        {
            "id": "ev-tomorrow",
            "slug": "tomorrow-ev",
            "title": "Tomorrow Event",
            "status": "approved",
            "category": "community_events",
            "event_start_date": "2026-11-24",
            "expires_after": "2026-11-24",
        }
    ]
    last_map = {("vendor_events", "ev-tomorrow"): now_utc - timedelta(days=2)}
    assert select_event_candidate(rows, last_map, today, now_utc) is None


def test_midday_skips_expired_and_respects_cooldown():
    today = date(2026, 11, 23)
    now_utc = datetime(2026, 11, 23, 17, 30, tzinfo=timezone.utc)
    vendor_rows = [
        {
            "id": "sale-expired",
            "slug": "old-sale",
            "title": "Old Sale",
            "status": "approved",
            "category": "retail_sale",
            "expires_after": "2026-11-22",
        }
    ]
    partner_rows = [
        {
            "id": "p-recent",
            "business_name": "Recent Bakery",
            "offer_details": "10% off",
            "status": "Approved",
        }
    ]
    dir_rows = [
        {
            "id": "d-fresh",
            "slug": "lake-cafe",
            "name": "Lake Cafe",
            "category": "Cafe",
            "status": "approved",
        }
    ]
    last_map = {("partners", "p-recent"): now_utc - timedelta(days=5)}

    cand = select_midday_candidate(vendor_rows, partner_rows, dir_rows, last_map, today, now_utc)
    assert cand is not None
    assert cand.source_table == "directory_listings"
    assert cand.source_id == "d-fresh"
    assert "https://welcomeeg.ca/businesses/lake-cafe" in cand.target_url


def test_afternoon_press_and_site_env_override(monkeypatch):
    monkeypatch.setenv("SITE_NAME", "Welcome EG")
    monkeypatch.setenv("SITE_DOMAIN", "https://welcomeeg.ca")
    today = date(2026, 11, 23)
    now_utc = datetime(2026, 11, 23, 21, 30, tzinfo=timezone.utc)

    press_rows = [
        {
            "id": "art-1",
            "slug": "new-trail-opens",
            "title": "New Trail Opens in East Gwillimbury",
            "summary": "A new multi-use trail is now open.",
            "status": "published",
        }
    ]
    cand = select_afternoon_candidate(press_rows, [], {}, today, now_utc)
    assert cand is not None
    assert cand.target_url.startswith("https://welcomeeg.ca/pressroom/new-trail-opens?")
    assert "Welcome EG" in cand.caption


def test_resolve_slot_and_utm():
    assert resolve_slot("auto", datetime(2026, 11, 23, 8, 30)) == "morning"
    assert resolve_slot("auto", datetime(2026, 11, 23, 11, 0)) == "midday"
    assert resolve_slot("auto", datetime(2026, 11, 23, 13, 30)) == "morning"
    assert resolve_slot("auto", datetime(2026, 11, 23, 16, 0)) == "afternoon"
    assert resolve_slot("auto", datetime(2026, 11, 23, 18, 30)) == "midday"
    assert resolve_slot("auto", datetime(2026, 11, 23, 21, 0)) == "afternoon"
    url = with_utm("https://welcomeeg.ca/offers", "midday")
    assert url == "https://welcomeeg.ca/offers?utm_source=facebook&utm_medium=social&utm_campaign=auto_midday"


def test_recent_post_exists_60m_guard():
    now_utc = datetime(2026, 11, 24, 16, 0, tzinfo=timezone.utc)
    recent_logs = [{"posted_at": (now_utc - timedelta(minutes=30)).isoformat()}]
    older_logs = [{"posted_at": (now_utc - timedelta(minutes=61)).isoformat()}]
    assert _recent_post_exists(recent_logs, now_utc, minutes=60) is True
    assert _recent_post_exists(older_logs, now_utc, minutes=60) is False
    assert _recent_post_exists([], now_utc, minutes=60) is False
