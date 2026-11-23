"""
Twice-weekly Welcome East Gwillimbury newsletter editions (rules set by the owner on 2026-11-16):

- Monday edition   = listings happening Monday to Friday of that week.
- Thursday edition = listings happening this coming weekend and the next weekend
                     (Friday, Saturday and Sunday of both weekends).
- Items are grouped by day of the week. A multi-day listing appears under every day it
  runs inside the edition's window. Listings that run the whole window and longer
  (an ongoing sale or a standing dining special) are shown once, in an
  "All week" / "All weekend" group at the top, instead of being repeated every day.
- Each item carries a coloured category label.
- Category order inside a day: Community Events, Local Dining, Local Sales, then the rest.
- News is never in a newsletter: it is published on the website only, with a
  "Local News" link at the bottom of each edition.

The data is the approved listings in Supabase `vendor_events` (submissions, imports and
the crawler all end up there), using the structured date columns written by the
submission form: event_start_date, expires_after, date_type and recurrence_rule.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
import html
import json
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from src.compiler import (
    DEFAULT_MAIN_SITE_URL,
    _build_tracked_url,
    _get_portal_base_url,
    _render_corrections_banner,
    _safe_text,
    parse_event_date,
)
from src.deduplication import is_fuzzy_duplicate

EDITIONS = ("monday", "thursday")

# Categories that never go in a newsletter (website only).
NEWS_CATEGORIES = {"news", "municipal_news", "local_news", "past_events", "article", "press"}

SALE_CATEGORIES = {"special_sale", "retail_sale", "sale", "sales", "local_sales", "sales_deal"}

# (group key, label, colours). Order = order inside each day.
CATEGORY_GROUPS: List[Tuple[str, str, Dict[str, str]]] = [
    ("community", "Community Events", {"bg": "#d1fae5", "text": "#065f46", "bar": "#059669"}),
    ("dining", "Local Dining", {"bg": "#ffedd5", "text": "#9a3412", "bar": "#ea580c"}),
    ("sales", "Local Sales", {"bg": "#fef3c7", "text": "#92400e", "bar": "#d97706"}),
    ("library", "East Gwillimbury Public Library", {"bg": "#e0f2fe", "text": "#0369a1", "bar": "#0284c7"}),
    ("theatre", "Concerts & Shows", {"bg": "#f3e8ff", "text": "#6b21a8", "bar": "#9333ea"}),
    ("town", "Town of East Gwillimbury", {"bg": "#e0e7ff", "text": "#3730a3", "bar": "#4338ca"}),
    ("chamber", "Chamber of Commerce", {"bg": "#fef9c3", "text": "#854d0e", "bar": "#ca8a04"}),
    ("business", "Local Business Events", {"bg": "#fce7f3", "text": "#9d174d", "bar": "#db2777"}),
    ("regional", "Eventbrite & Meetup", {"bg": "#f1f5f9", "text": "#334155", "bar": "#64748b"}),
]
GROUP_ORDER = {key: i for i, (key, _, _) in enumerate(CATEGORY_GROUPS)}
GROUP_INFO = {key: (label, colours) for key, label, colours in CATEGORY_GROUPS}

CATEGORY_TO_GROUP = {
    "community_events": "community",
    "community": "community",
    "family": "community",
    "fundraisers": "community",
    "markets": "community",
    "sports": "community",
    "arts": "community",
    "live_music": "community",
    "concerts_shows": "theatre",
    "workshops": "community",
    "dining": "dining",
    "library_events": "library",
    "theatre_events": "theatre",
    "upcoming_events": "town",
    "chamber_events": "chamber",
    "private_business_events": "business",
    "business_event": "business",
    "eventbrite_meetup": "regional",
}

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# --------------------------------------------------------------------------- dates

def edition_window(edition: str, today: Optional[date] = None) -> List[date]:
    """The days an edition covers.

    monday:   Monday to Friday of the current week (built on a weekend, the coming week).
    thursday: this coming weekend and next weekend (Friday, Saturday and Sunday of both).
    """
    today = today or datetime.now().date()
    wd = today.weekday()  # Monday = 0
    if edition == "monday":
        start = today - timedelta(days=wd) if wd <= 4 else today + timedelta(days=7 - wd)
        return [start + timedelta(days=i) for i in range(5)]
    if edition == "thursday":
        if wd <= 4:
            start = today + timedelta(days=4 - wd)
        else:
            start = today - timedelta(days=wd - 4)
        return [start + timedelta(days=i) for i in (0, 1, 2, 7, 8, 9)]
    raise ValueError(f"Unknown edition: {edition}")


def _iso(value: Any) -> Optional[date]:
    s = str(value or "").strip()[:10]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _weekday_numbers(rule: str) -> List[int]:
    found = []
    low = (rule or "").lower()
    for i, name in enumerate(WEEKDAYS):
        if re.search(rf"\b{name.lower()}s?\b|\b{name[:3].lower()}\b", low):
            found.append(i)
    if re.search(r"\b(daily|every day|everyday|7 days)\b", low):
        found = list(range(7))
    if re.search(r"\bweekdays?\b|mon(day)?\s*(-|to)\s*fri(day)?", low):
        found = sorted(set(found) | {0, 1, 2, 3, 4})
    if re.search(r"\bweekends?\b", low):
        found = sorted(set(found) | {5, 6})
    return found


DAY_KEYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
LONG_SPAN_DAYS = 14  # a plain date range longer than this is treated as "open until", not "every day"


def _weekdays_from_rule(rule: str) -> Optional[List[int]]:
    """Weekdays from a recurrence rule: "Monday, Friday" text, or the weekly-hours JSON
    {"Mon": {"enabled": true, ...}, ...}. None when the rule says nothing about weekdays."""
    rule = (rule or "").strip()
    if not rule:
        return None
    if rule.startswith("{"):
        try:
            obj = json.loads(rule)
            days = [DAY_KEYS[k[:3].lower()] for k, v in obj.items()
                    if k[:3].lower() in DAY_KEYS and (not isinstance(v, dict) or v.get("enabled", True))]
            return sorted(set(days)) or None
        except (ValueError, TypeError, AttributeError):
            return None
    if rule.startswith("["):
        return None
    return _weekday_numbers(rule) or None


def _weekdays_from_text(text: str) -> Optional[List[int]]:
    """"Every Tuesday", "Every Wednesday & Thursday", "Saturday nights", "Fish Friday" ..."""
    low = (text or "").lower()
    if re.search(r"\b(every|each|on)\s+(mon|tue|wed|thu|fri|sat|sun)", low) or re.search(r"\b(mon|tues|wednes|thurs|fri|satur|sun)days\b", low):
        return _weekday_numbers(low) or None
    return None


_ORDINAL_MAP = {"1st": 1, "first": 1, "1": 1, "2nd": 2, "second": 2, "2": 2, "3rd": 3, "third": 3, "3": 3, "4th": 4, "fourth": 4, "4": 4, "last": -1}
_WD_FULL_MAP = {
    "mon": 0, "monday": 0, "mondays": 0,
    "tue": 1, "tues": 1, "tuesday": 1, "tuesdays": 1,
    "wed": 2, "wednesday": 2, "wednesdays": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3, "thursdays": 3,
    "fri": 4, "friday": 4, "fridays": 4,
    "sat": 5, "saturday": 5, "saturdays": 5,
    "sun": 6, "sunday": 6, "sundays": 6,
}


def _monthly_nth_rule(text: str) -> Optional[Tuple[int, int]]:
    """Parse '3rd Thursday of every month' or 'Last Friday of the month' -> (nth, python_weekday)."""
    low = (text or "").strip().lower()
    if not low:
        return None
    m = re.search(
        r"\b(1st|2nd|3rd|4th|first|second|third|fourth|last)\s+"
        r"(mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)"
        r"\s+(?:of\s+(?:every|each|the)\s+month|monthly)\b",
        low,
    ) or re.match(r"^monthly:(1|2|3|4|last):(mon|tue|wed|thu|fri|sat|sun)$", low)
    if not m:
        return None
    nth = _ORDINAL_MAP.get(m.group(1))
    wd = _WD_FULL_MAP.get(m.group(2))
    if nth is None or wd is None:
        return None
    return (nth, wd)


def _matches_monthly_nth(d: date, rule: Tuple[int, int]) -> bool:
    nth, wd = rule
    if d.weekday() != wd:
        return False
    if nth == -1:
        return (d + timedelta(days=7)).month != d.month
    return ((d.day - 1) // 7) + 1 == nth


def occurrence_days(row: Dict[str, Any], window: List[date]) -> Tuple[List[date], bool]:
    """Days inside `window` on which this listing happens, and whether it is "ongoing"
    (an open-ended dining special or sale that runs the whole window: shown once).

    Long plain date ranges are often placeholders from the crawler (e.g. "until Dec 30"),
    so for those the date line or a weekday in the title decides; a long-running event
    with no usable date is left out rather than listed every day."""
    start = _iso(row.get("event_start_date"))
    end = _iso(row.get("expires_after"))
    date_type = (row.get("date_type") or "").strip()
    rule = row.get("recurrence_rule") or ""
    label = row.get("event_date_label") or ""
    title = row.get("title") or ""
    group = category_group(row)
    first, last = window[0], window[-1]
    window_set = set(window)

    # Several specific dates
    if date_type == "multiple" and rule.strip().startswith("["):
        try:
            rows = json.loads(rule)
            dates = {_iso(r.get("date")) for r in rows if isinstance(r, dict)}
            return sorted(d for d in dates if d and d in window_set), False
        except (ValueError, TypeError):
            pass

    # Monthly nth-weekday rule (e.g. "3rd Thursday of every month") — checked BEFORE weekly rule
    monthly = _monthly_nth_rule(rule) or _monthly_nth_rule(label) or _monthly_nth_rule(row.get("summary") or "")
    if monthly:
        run_start = start or first
        run_end = end
        if (run_end and run_end < first) or run_start > last:
            return [], False
        days = [d for d in window if _matches_monthly_nth(d, monthly)
                and (run_end is None or d <= run_end)
                and (date_type == "recurring" or d >= run_start)]
        return days, False

    weekdays = _weekdays_from_rule(rule) or _weekdays_from_text(label) or _weekdays_from_text(title)

    if start is None and end is None and not weekdays:
        guess = parse_event_date(label, first) or parse_event_date(title, first)
        if guess is None:
            return [], False
        start = end = guess

    run_start = start or first
    run_end = end or (None if weekdays else run_start)
    if (run_end and run_end < first) or run_start > last:
        return [], False

    if weekdays:
        days = [d for d in window if d.weekday() in weekdays
                and (run_end is None or d <= run_end)
                and (date_type == "recurring" or d >= run_start)]
        return days, False

    span = (run_end - run_start).days + 1
    if span > LONG_SPAN_DAYS:
        guess = parse_event_date(label, first)
        if guess and run_start <= guess <= run_end:
            return ([guess] if guess in window_set else []), False
        if group in ("dining", "sales"):
            days = [d for d in window if run_start <= d <= run_end]
            return days, len(days) == len(window)
        return [], False

    return [d for d in window if run_start <= d <= run_end], False


# --------------------------------------------------------------------------- items

def category_group(row: Dict[str, Any]) -> Optional[str]:
    cat = (row.get("category") or "").strip().lower()
    if cat in NEWS_CATEGORIES:
        return None
    if cat in SALE_CATEGORIES or re.match(r"^\s*\[sale\]", row.get("title") or "", re.I):
        return "sales"
    return CATEGORY_TO_GROUP.get(cat, "community")


def listing_path(row: Dict[str, Any], group: str) -> str:
    kind = "dining" if group == "dining" else "sales" if group == "sales" else "events"
    return f"{DEFAULT_MAIN_SITE_URL}/{kind}/{row.get('slug') or row.get('id')}"


def _clean_title(title: str) -> str:
    return re.sub(r"^(\s*\[[^\]]*\]\s*)+", "", " ".join((title or "").split())).strip()


def build_edition_days(rows: Iterable[Dict[str, Any]], window: List[date]) -> Tuple[List[Dict[str, Any]], Dict[date, List[Dict[str, Any]]]]:
    """Splits listings into (ongoing items, {day: items}). News and undated items are left out."""
    ongoing: List[Dict[str, Any]] = []
    by_day: Dict[date, List[Dict[str, Any]]] = {d: [] for d in window}
    seen_ids = set()
    kept_for_dedup: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict) or (row.get("status") or "approved") != "approved":
            continue
        rid = row.get("id")
        if rid in seen_ids:
            continue
        seen_ids.add(rid)
        group = category_group(row)
        title = _clean_title(row.get("title") or "")
        if group is None or not title:
            continue
        days, is_ongoing = occurrence_days(row, window)
        if not days:
            continue
        date_label = (row.get("event_date_label") or row.get("event_start_date") or "").strip()
        day_set = set(days)
        same_day_kept = [k for k in kept_for_dedup if k["_days"] & day_set]
        is_dup, _, _ = is_fuzzy_duplicate(title, date_label, same_day_kept, threshold=85.0)
        if is_dup:
            continue
        kept_for_dedup.append({
            "title": title,
            "event_date_label": date_label,
            "date": date_label,
            "_days": day_set,
        })
        item = dict(row, _group=group, _title=title)
        if is_ongoing:
            ongoing.append(item)
        else:
            for d in days:
                by_day[d].append(item)

    def _key(it: Dict[str, Any]):
        return (GROUP_ORDER.get(it["_group"], 99), it["_title"].lower())

    ongoing.sort(key=_key)
    for d in by_day:
        by_day[d].sort(key=_key)
    return ongoing, by_day


# --------------------------------------------------------------------------- HTML

def _render_card(item: Dict[str, Any], issue_iso: str) -> str:
    group = item["_group"]
    label, colours = GROUP_INFO.get(group, ("Community Events", GROUP_INFO["community"][1]))
    link = html.escape(_build_tracked_url(
        raw_url=listing_path(item, group),
        title=item["_title"],
        source=item.get("business_name") or "Welcome East Gwillimbury",
        category=item.get("category") or group,
        issue_iso=issue_iso,
    ), quote=True)
    biz = (item.get("business_name") or "").strip()
    when = (item.get("event_date_label") or "").strip()
    where = (item.get("location") or "").strip()
    price = (item.get("price_text") or "").strip()
    summary = " ".join((item.get("summary") or "").split())
    if len(summary) > 260:
        summary = summary[:257].rsplit(" ", 1)[0] + "…"
    meta = " &bull; ".join(_safe_text(x) for x in (biz if biz.lower() != item["_title"].lower() else "", when, where) if x)
    price_html = (f'<p style="margin:0 0 8px 0; color:{colours["text"]}; font-size:14px; font-weight:800;">{_safe_text(price)}</p>'
                  if price else "")
    return f"""
        <div style="margin-bottom: 14px; padding: 16px 18px; background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid {colours['bar']}; border-radius: 12px;">
            <span style="display: inline-block; background-color: {colours['bg']}; color: {colours['text']}; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">{_safe_text(label)}</span>
            <h3 style="margin: 8px 0 6px 0; font-size: 17px; line-height: 1.35; font-weight: 800;">
                <a href="{link}" target="_blank" rel="noopener noreferrer" style="color: #0f172a; text-decoration: none;">{_safe_text(item['_title'])}</a>
            </h3>
            {f'<p style="margin: 0 0 8px 0; color: #475569; font-size: 13px; font-weight: 600;">{meta}</p>' if meta else ''}
            {price_html}
            {f'<p style="margin: 0 0 10px 0; color: #334155; font-size: 14px; line-height: 1.55;">{_safe_text(summary)}</p>' if summary else ''}
            <a href="{link}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #00008b; color: #ffffff; font-size: 12px; font-weight: 800; padding: 7px 16px; border-radius: 9999px; text-decoration: none;">Details →</a>
        </div>"""


def _render_sponsored_ad_card(ad: Dict[str, Any], issue_iso: str) -> str:
    raw_dest = (ad.get("target_url") or DEFAULT_MAIN_SITE_URL).strip()
    if raw_dest.startswith("/"):
        raw_dest = f"{DEFAULT_MAIN_SITE_URL}{raw_dest}"
    link = html.escape(_build_tracked_url(
        raw_url=raw_dest,
        title=ad.get("headline") or ad.get("sponsor_name") or "Sponsored",
        source=ad.get("sponsor_name") or "Sponsored",
        category="newsletter_ad",
        issue_iso=issue_iso,
    ), quote=True)
    headline = _safe_text(ad.get("headline") or "Sponsored Feature")
    sponsor = _safe_text(ad.get("sponsor_name") or "")
    body_text = _safe_text(ad.get("body_text") or "")
    cta = _safe_text(ad.get("cta_label") or "Learn More →")
    img_url = (ad.get("image_url") or "").strip()
    img_html = (
        f'<div style="margin: 0 0 10px 0;"><a href="{link}" target="_blank" rel="noopener noreferrer">'
        f'<img src="{_safe_text(img_url)}" alt="{headline}" style="max-width: 100%; height: auto; border-radius: 8px; display: block;"></a></div>'
        if img_url else ""
    )
    return f"""
        <div style="border: 2px solid #f59e0b; border-left: 6px solid #d97706; background-color: #fffbeb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px;">
            <div style="margin: 0 0 6px 0;">
                <span style="display: inline-block; background-color: #fef3c7; color: #92400e; border: 1px solid #f59e0b; font-size: 11px; font-weight: 900; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.06em;">Sponsored</span>
                {f'<span style="font-size: 12px; font-weight: 700; color: #78350f; margin-left: 8px;">{sponsor}</span>' if sponsor else ''}
            </div>
            {img_html}
            <h3 style="margin: 0 0 6px 0; font-size: 17px; line-height: 1.3; font-weight: 900; color: #1e293b;">
                <a href="{link}" target="_blank" rel="noopener noreferrer" style="color: #00008b; text-decoration: none;">{headline}</a>
            </h3>
            {f'<p style="margin: 0 0 10px 0; color: #334155; font-size: 14px; line-height: 1.55;">{body_text}</p>' if body_text else ''}
            <a href="{link}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #d97706; color: #ffffff; font-size: 12px; font-weight: 800; padding: 7px 16px; border-radius: 9999px; text-decoration: none;">{cta}</a>
        </div>"""


def _day_heading(text: str, sub: str = "") -> str:
    return f"""
        <h2 style="margin: 28px 0 14px 0; padding: 10px 16px; background-color: #00008b; border-radius: 8px; font-size: 15px; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 900;">
            {_safe_text(text)}{f' <span style="color:#bfdbfe; font-weight:700; text-transform:none; letter-spacing:0;">&nbsp;{_safe_text(sub)}</span>' if sub else ''}
        </h2>"""


def edition_subject(edition: str, window: List[date]) -> str:
    first = f"{window[0]:%b} {window[0].day}"
    last = f"{window[-1]:%b} {window[-1].day}" if window[-1].month != window[0].month else str(window[-1].day)
    if edition == "monday":
        return f"Welcome East Gwillimbury • This Week in East Gwillimbury ({first}–{last})"
    return f"Welcome East Gwillimbury • This Weekend & Next Weekend in East Gwillimbury ({first}–{last})"


def build_edition_html(
    edition: str,
    rows: Iterable[Dict[str, Any]],
    today: Optional[date] = None,
    ads: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[str, int]:
    """Returns (html, number of listings shown)."""
    today = today or datetime.now().date()
    window = edition_window(edition, today)
    ongoing, by_day = build_edition_days(rows, window)
    issue_iso = today.isoformat()
    main_site = DEFAULT_MAIN_SITE_URL
    portal_base = _get_portal_base_url()

    sorted_ads = sorted(
        [a for a in (ads or []) if a and a.get("active", True) is not False],
        key=lambda a: (int(a.get("insert_after_index") or 0), str(a.get("sub_order") or "a").lower()),
    )
    ads_by_pos: Dict[int, List[Dict[str, Any]]] = {}
    for ad in sorted_ads:
        pos = max(0, int(ad.get("insert_after_index") or 0))
        ads_by_pos.setdefault(pos, []).append(ad)
    used_positions = set()

    def _emit_ads_at(pos: int) -> None:
        if pos in ads_by_pos and pos not in used_positions:
            used_positions.add(pos)
            for ad in ads_by_pos[pos]:
                blocks.append(_render_sponsored_ad_card(ad, issue_iso))

    is_monday = edition == "monday"
    span_text = (
        f"{WEEKDAYS[window[0].weekday()]} to {WEEKDAYS[window[-1].weekday()]}"
        if is_monday
        else "This coming weekend & next weekend (Friday to Sunday)"
    )
    kicker = "This Week in East Gwillimbury" if is_monday else "This Weekend & Next Weekend in East Gwillimbury"
    date_range = (
        f"{window[0]:%B} {window[0].day} to {window[-1]:%B} {window[-1].day}, {window[-1].year}"
        if is_monday
        else f"{window[0]:%B} {window[0].day}–{window[2].day} & {window[3]:%B} {window[3].day}–{window[5].day}, {window[-1].year}"
    )

    blocks: List[str] = []
    _emit_ads_at(0)
    listing_counter = 0

    if ongoing:
        blocks.append(_day_heading("All week" if is_monday else "Both weekends", span_text))
        for it in ongoing:
            blocks.append(_render_card(it, issue_iso))
            listing_counter += 1
            _emit_ads_at(listing_counter)
    shown_ids = {it.get("id") for it in ongoing}
    next_weekend_start = window[3] if (not is_monday and len(window) > 3) else None
    for d in window:
        items = by_day[d]
        if not items:
            continue
        weekend_tag = ""
        if next_weekend_start is not None:
            weekend_tag = "Next Weekend • " if d >= next_weekend_start else "This Weekend • "
        blocks.append(_day_heading(f"{weekend_tag}{WEEKDAYS[d.weekday()]}", f"{d:%B} {d.day}"))
        for it in items:
            blocks.append(_render_card(it, issue_iso))
            listing_counter += 1
            _emit_ads_at(listing_counter)
        shown_ids.update(it.get("id") for it in items)

    # Append any ads whose configured position exceeds the total listings in this edition
    for pos in sorted(ads_by_pos.keys()):
        if pos not in used_positions:
            _emit_ads_at(pos)

    if not shown_ids:
        blocks.append(f"""
            <p style="margin: 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
                No listings have been published for {span_text.lower()} yet. See what is on at
                <a href="{main_site}/events" style="color:#00008b; font-weight:800;">welcomeeg.ca/events</a>.
            </p>""")

    listing_count = len(shown_ids)
    intro_banner = (
        f'<div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; '
        f'padding: 12px 16px; margin: 12px 0 4px 0; font-size: 14px; line-height: 1.5; color: #1e293b;">'
        f'<strong style="color: #00008b;">{listing_count} things to do in this edition.</strong> '
        f'In a hurry? <a href="{main_site}/" style="color: #00008b; font-weight: 800; text-decoration: underline;">Click here to search instead</a>.'
        f'</div>'
    )

    corrections = _render_corrections_banner(edition="reader")
    body = intro_banner + "\n" + (corrections + "\n" if corrections else "") + "\n".join(blocks)

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base target="_blank">
    <title>Welcome East Gwillimbury - {_safe_text(kicker)}</title>
    <style>
        * {{ box-sizing: border-box; }}
        table {{ border-collapse: collapse; }}
        img {{ max-width: 100% !important; height: auto !important; }}
        @media only screen and (max-width: 640px) {{
            .inner-card {{ width: 100% !important; max-width: 100% !important; border-radius: 6px !important; }}
            .pad {{ padding-left: 14px !important; padding-right: 14px !important; }}
        }}
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 8px;">
        <tr><td align="center">
            <table role="presentation" width="100%" class="inner-card" style="max-width: 640px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; text-align: left;">
                <tr>
                    <td class="pad" style="background-color: #00008b; padding: 26px 24px;">
                        <a href="{main_site}/" style="text-decoration: none; display: block; width: 100%; margin-bottom: 12px;">
                            <img src="https://welcomeeg.ca/welcome-eg-logo.png" alt="Welcome East Gwillimbury" width="592" style="width: 100%; max-width: 100%; height: auto; border: 0; display: block; filter: brightness(0) invert(1);">
                        </a>
                        <h1 style="margin: 0 0 6px 0; font-size: 24px; color: #ffffff; font-weight: 900; line-height: 1.25;">{_safe_text(kicker)}</h1>
                        <p style="margin: 0 0 12px 0; color: #bfdbfe; font-size: 14px; font-weight: 700;">{_safe_text(date_range)}</p>
                        <p style="margin: 0; color: #ffffff; font-size: 13px; line-height: 1.6;">
                            Website: <a href="{main_site}" style="color: #ffffff; font-weight: 700; text-decoration: underline;">https://welcomeeg.ca</a><br>
                            Email: <a href="mailto:contact@welcomeeg.ca" style="color: #ffffff; font-weight: 700; text-decoration: underline;">contact@welcomeeg.ca</a>
                        </p>
                        <p style="margin: 10px 0 0 0; color: #bfdbfe; font-size: 12px; font-style: italic;">Not responsible for errors or omissions, visit website for details.</p>
                    </td>
                </tr>
                <tr><td class="pad" style="padding: 8px 24px 12px 24px;">{body}</td></tr>
                <tr>
                    <td class="pad" style="padding: 8px 24px 24px 24px;">
                        <div style="background-color: #eef2ff; border: 2px solid #c7d2fe; border-radius: 12px; padding: 18px 20px;">
                            <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #3730a3; font-weight: 900;">Local News</h3>
                            <p style="margin: 0 0 12px 0; font-size: 14px; color: #334155; line-height: 1.55;">Town notices, council updates and local stories are on the website.</p>
                            <a href="{main_site}/newsroom" style="display: inline-block; background-color: #4338ca; color: #ffffff; font-size: 13px; font-weight: 800; padding: 9px 18px; border-radius: 9999px; text-decoration: none;">Read Local News →</a>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td class="pad" style="padding: 0 24px 24px 24px;">
                        <div style="background-color: #eff6ff; border: 2px solid #bfdbfe; border-radius: 12px; padding: 18px 20px;">
                            <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #00008b; font-weight: 900;">Hosting an event, a sale or a dining special?</h3>
                            <p style="margin: 0 0 12px 0; font-size: 14px; color: #334155; line-height: 1.55;">Post it free on Welcome East Gwillimbury and it can appear in the next edition.</p>
                            <a href="{main_site}/submission" style="display: inline-block; background-color: #00008b; color: #ffffff; font-size: 13px; font-weight: 800; padding: 9px 18px; border-radius: 9999px; text-decoration: none;">Submit a Listing →</a>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td style="background-color: #00008b; padding: 22px; text-align: center; color: #bfdbfe; font-size: 12px; line-height: 1.6;">
                        <strong style="color: #ffffff; font-size: 13px;">Welcome East Gwillimbury</strong><br>
                        Monday edition: Monday to Friday &bull; Thursday edition: This coming weekend &amp; next weekend (Friday to Sunday)<br>
                        Not responsible for errors or omissions, visit website for details.<br><br>
                        <a href="{main_site}/" style="color: #ffffff; text-decoration: underline; font-weight: 700;">WelcomeEG.ca</a>
                        &nbsp;|&nbsp;
                        <a href="{main_site}/newsletter" style="color: #ffffff; text-decoration: underline; font-weight: 700;">Past editions</a>
                        &nbsp;|&nbsp;
                        <a href="{portal_base}/unsubscribe.html?token={{{{UNSUBSCRIBE_TOKEN}}}}" style="color: #93c5fd; text-decoration: underline;">Unsubscribe</a>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
"""
    return page, len(shown_ids)
