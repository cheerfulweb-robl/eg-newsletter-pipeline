"""
Automated 3x/day Facebook Page poster for Welcome East Gwillimbury (and clones like Welcome EG).

Rules:
- Events posted in the morning slot must occur at the earliest TOMORROW (America/Toronto).
- Never expired listings are used (`expires_after` is null or >= today, and >= tomorrow for events).
- Tracks every post in Supabase `facebook_post_log` to avoid repeats.
- All branding/domain values come from env vars (`SITE_NAME`, `SITE_DOMAIN`, `FB_PAGE_ID`,
  `FB_PAGE_ACCESS_TOKEN`) so cloned sites need zero code changes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import html as html_lib
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, urlencode, urlparse, urlunparse, parse_qsl
from zoneinfo import ZoneInfo

import requests

from src.editions import (
    NEWS_CATEGORIES,
    _clean_title,
    _iso,
    category_group,
    occurrence_days,
)
from src.sender import send_single_email
from src.supabase_client import _get_supabase_config

TORONTO_TZ = ZoneInfo("America/Toronto")
DEFAULT_SITE_NAME = "Welcome East Gwillimbury"
DEFAULT_SITE_DOMAIN = "https://welcomeeg.ca"
DEFAULT_GRAPH_VERSION = "v22.0"
DEFAULT_EVENT_LOOKAHEAD_DAYS = 14
DEFAULT_EVERGREEN_COOLDOWN_DAYS = 14
DEFAULT_CTA_COOLDOWN_DAYS = 3


@dataclass
class PostCandidate:
    source_table: str
    source_id: str
    slot: str
    caption: str
    target_url: str
    label: str = ""


def _site_name() -> str:
    return (os.environ.get("SITE_NAME") or DEFAULT_SITE_NAME).strip()


def _site_domain() -> str:
    return (os.environ.get("SITE_DOMAIN") or DEFAULT_SITE_DOMAIN).strip().rstrip("/")


def _toronto_now(now: Optional[datetime] = None) -> datetime:
    if now is None:
        return datetime.now(TORONTO_TZ)
    if now.tzinfo is None:
        return now.replace(tzinfo=TORONTO_TZ)
    return now.astimezone(TORONTO_TZ)


def resolve_slot(requested: str = "auto", now: Optional[datetime] = None) -> str:
    slot = (requested or "auto").strip().lower()
    if slot in ("morning", "midday", "afternoon"):
        return slot
    hour = _toronto_now(now).hour
    if hour < 11:
        return "morning"
    if hour < 15:
        return "midday"
    return "afternoon"


def with_utm(url: str, slot: str) -> str:
    """Append Facebook click-through UTM parameters without clobbering existing query params."""
    parsed = urlparse(url)
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    params.update({
        "utm_source": "facebook",
        "utm_medium": "social",
        "utm_campaign": f"auto_{slot}",
    })
    return urlunparse(parsed._replace(query=urlencode(params)))


def is_expired(row: Dict[str, Any], min_date: date) -> bool:
    """True when `expires_after` is present and strictly before `min_date`."""
    exp = _iso(row.get("expires_after"))
    return exp is not None and exp < min_date


def _is_out_of_area(row: Dict[str, Any]) -> bool:
    loc = (row.get("location") or "").lower()
    return "out of area" in loc


def _truncate(text: str, limit: int = 180) -> str:
    clean = " ".join((text or "").split())
    if len(clean) <= limit:
        return clean
    return clean[: limit - 1].rstrip() + "…"


# --------------------------------------------------------------------------- Supabase reads/writes

def _supabase_get(table: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/{table}"
    try:
        resp = requests.get(endpoint, headers=cfg["headers"], params=params, timeout=15)
        if resp.status_code not in (200, 206):
            print(f"Warning: Supabase GET {table} returned HTTP {resp.status_code}: {resp.text[:200]}")
            return []
        data = resp.json()
        return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else []
    except Exception as exc:
        print(f"Warning: Supabase GET {table} failed: {exc}")
        return []


def fetch_recent_post_log(days: int = 60) -> List[Dict[str, Any]]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return _supabase_get(
        "facebook_post_log",
        {
            "select": "source_table,source_id,slot,posted_at",
            "posted_at": f"gte.{cutoff}",
            "order": "posted_at.desc",
            "limit": "500",
        },
    )


def log_posted_item(candidate: PostCandidate, fb_post_id: str) -> bool:
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/facebook_post_log"
    payload = {
        "source_table": candidate.source_table,
        "source_id": str(candidate.source_id),
        "slot": candidate.slot,
        "fb_post_id": fb_post_id,
        "target_url": candidate.target_url,
        "caption": candidate.caption[:1000],
    }
    try:
        resp = requests.post(endpoint, headers=cfg["headers"], json=payload, timeout=12)
        if resp.status_code not in (200, 201, 204):
            print(f"Warning: Could not write facebook_post_log (HTTP {resp.status_code}): {resp.text[:200]}")
            return False
        return True
    except Exception as exc:
        print(f"Warning: Could not write facebook_post_log: {exc}")
        return False


def _last_posted_map(logs: List[Dict[str, Any]]) -> Dict[Tuple[str, str], datetime]:
    latest: Dict[Tuple[str, str], datetime] = {}
    for row in logs:
        key = (str(row.get("source_table") or ""), str(row.get("source_id") or ""))
        raw_ts = str(row.get("posted_at") or "").replace("Z", "+00:00")
        try:
            ts = datetime.fromisoformat(raw_ts)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if key not in latest or ts > latest[key]:
            latest[key] = ts
    return latest


def _in_cooldown(
    last_map: Dict[Tuple[str, str], datetime],
    table: str,
    item_id: Any,
    cooldown_days: Optional[int],
    now_utc: datetime,
) -> bool:
    """cooldown_days=None means never repost."""
    ts = last_map.get((table, str(item_id)))
    if ts is None:
        return False
    if cooldown_days is None:
        return True
    return (now_utc - ts) < timedelta(days=cooldown_days)


# --------------------------------------------------------------------------- candidate selection

def select_event_candidate(
    rows: List[Dict[str, Any]],
    last_map: Dict[Tuple[str, str], datetime],
    today: date,
    now_utc: datetime,
    lookahead_days: int = DEFAULT_EVENT_LOOKAHEAD_DAYS,
) -> Optional[PostCandidate]:
    """Pick the best upcoming approved event occurring at the earliest TOMORROW."""
    tomorrow = today + timedelta(days=1)
    window = [tomorrow + timedelta(days=i) for i in range(lookahead_days)]
    site_name = _site_name()
    domain = _site_domain()

    eligible: List[Tuple[Tuple[int, int, date, str], Dict[str, Any], date]] = []
    for row in rows:
        if (row.get("status") or "").lower() != "approved":
            continue
        if is_expired(row, tomorrow):
            continue
        group = category_group(row)
        if group is None or group in ("dining", "sales"):
            continue
        title = _clean_title(row.get("title") or "")
        if not title:
            continue
        rid = row.get("id")
        if rid is None or _in_cooldown(last_map, "vendor_events", rid, None, now_utc):
            continue

        days, _ = occurrence_days(row, window)
        upcoming_days = [d for d in days if d >= tomorrow]
        if not upcoming_days:
            continue

        first_day = upcoming_days[0]
        # Extra guard: if a non-recurring listing has an explicit start date before tomorrow
        # and doesn't span through tomorrow, skip it.
        start_d = _iso(row.get("event_start_date"))
        if start_d and start_d < tomorrow and first_day < tomorrow:
            continue

        sort_key = (
            1 if _is_out_of_area(row) else 0,
            0 if row.get("is_featured") else 1,
            first_day,
            title.lower(),
        )
        eligible.append((sort_key, row, first_day))

    if not eligible:
        return None

    eligible.sort(key=lambda item: item[0])
    _, chosen, first_day = eligible[0]
    title = _clean_title(chosen.get("title") or "")
    when_label = chosen.get("event_date_label") or first_day.strftime("%a, %b %d")
    location = " ".join((chosen.get("location") or "").split())
    summary = _truncate(chosen.get("summary") or "", 170)

    slug_or_id = quote(str(chosen.get("slug") or chosen.get("id")), safe="")
    url = with_utm(f"{domain}/events/{slug_or_id}", "morning")

    lines = [f"📅 {title}", f"🗓 {when_label}" + (f" • 📍 {location}" if location else "")]
    if summary:
        lines.append("")
        lines.append(summary)
    lines.extend(["", f"👉 Full event details on {site_name}: {url}"])

    return PostCandidate(
        source_table="vendor_events",
        source_id=str(chosen["id"]),
        slot="morning",
        caption="\n".join(lines),
        target_url=url,
        label=title,
    )


def select_midday_candidate(
    vendor_rows: List[Dict[str, Any]],
    partner_rows: List[Dict[str, Any]],
    directory_rows: List[Dict[str, Any]],
    last_map: Dict[Tuple[str, str], datetime],
    today: date,
    now_utc: datetime,
    cooldown_days: int = DEFAULT_EVERGREEN_COOLDOWN_DAYS,
) -> Optional[PostCandidate]:
    """Pick a non-expired dining, sale/deal, partner perk, or directory business spotlight."""
    site_name = _site_name()
    domain = _site_domain()
    pool: List[Tuple[datetime, PostCandidate]] = []
    never_posted = datetime(1970, 1, 1, tzinfo=timezone.utc)

    # 1. Dining & Sales from vendor_events (never expired)
    for row in vendor_rows:
        if (row.get("status") or "").lower() != "approved":
            continue
        if is_expired(row, today):
            continue
        group = category_group(row)
        if group not in ("dining", "sales"):
            continue
        rid = row.get("id")
        title = _clean_title(row.get("title") or "")
        if rid is None or not title:
            continue
        if _in_cooldown(last_map, "vendor_events", rid, cooldown_days, now_utc):
            continue

        kind = "dining" if group == "dining" else "sales"
        emoji = "🍽️" if group == "dining" else "🏷️"
        biz = " ".join((row.get("business_name") or "").split())
        loc = " ".join((row.get("location") or "").split())
        summary = _truncate(row.get("summary") or "", 170)
        url = with_utm(f"{domain}/{kind}/{row.get('slug') or rid}", "midday")

        header = f"{emoji} {title}" + (f" — {biz}" if biz and biz.lower() not in title.lower() else "")
        lines = [header]
        if loc:
            lines.append(f"📍 {loc}")
        if summary:
            lines.extend(["", summary])
        lines.extend(["", f"👉 See details on {site_name}: {url}"])

        last_ts = last_map.get(("vendor_events", str(rid)), never_posted)
        pool.append((last_ts, PostCandidate("vendor_events", str(rid), "midday", "\n".join(lines), url, title)))

    # 2. Partner Perks (status = 'Approved', never expired)
    for row in partner_rows:
        if (row.get("status") or "") != "Approved":
            continue
        if is_expired(row, today):
            continue
        rid = row.get("id")
        biz = " ".join((row.get("business_name") or "").split())
        offer = " ".join((row.get("offer_details") or "").split())
        if rid is None or not biz or not offer:
            continue
        if _in_cooldown(last_map, "partners", rid, cooldown_days, now_utc):
            continue

        loc = " ".join((row.get("location") or "").split())
        url = with_utm(f"{domain}/offers", "midday")
        lines = [f"🎁 Local Perk from {biz}: {offer}"]
        if loc:
            lines.append(f"📍 {loc}")
        lines.extend(["", f"👉 Browse local offers on {site_name}: {url}"])

        last_ts = last_map.get(("partners", str(rid)), never_posted)
        pool.append((last_ts, PostCandidate("partners", str(rid), "midday", "\n".join(lines), url, biz)))

    # 3. Directory Businesses (status = 'approved')
    for row in directory_rows:
        if (row.get("status") or "").lower() != "approved":
            continue
        rid = row.get("id")
        name = " ".join((row.get("name") or "").split())
        if rid is None or not name:
            continue
        if _in_cooldown(last_map, "directory_listings", rid, cooldown_days, now_utc):
            continue

        cat = " ".join((row.get("category") or "Local Business").split())
        loc = " ".join((row.get("community") or row.get("location") or "").split())
        desc = _truncate(row.get("summary") or "", 170)
        url = with_utm(f"{domain}/businesses/{row.get('slug') or rid}", "midday")

        lines = [f"🏪 Local Spotlight: {name} ({cat})"]
        if loc:
            lines.append(f"📍 {loc}")
        if desc:
            lines.extend(["", desc])
        lines.extend(["", f"👉 Support local on {site_name}: {url}"])

        last_ts = last_map.get(("directory_listings", str(rid)), never_posted)
        pool.append((last_ts, PostCandidate("directory_listings", str(rid), "midday", "\n".join(lines), url, name)))

    if not pool:
        return None
    pool.sort(key=lambda item: (item[0], item[1].label.lower()))
    return pool[0][1]


def select_afternoon_candidate(
    press_rows: List[Dict[str, Any]],
    vendor_rows: List[Dict[str, Any]],
    last_map: Dict[Tuple[str, str], datetime],
    today: date,
    now_utc: datetime,
) -> Optional[PostCandidate]:
    """Pick an unposted press article, non-expired local news item, or evergreen site CTA."""
    site_name = _site_name()
    domain = _site_domain()

    # 1. Pressroom articles (published, never posted twice)
    for row in press_rows:
        if (row.get("status") or "").lower() != "published":
            continue
        rid = row.get("id")
        title = " ".join((row.get("title") or "").split())
        if rid is None or not title:
            continue
        if _in_cooldown(last_map, "press_articles", rid, None, now_utc):
            continue

        summary = _truncate(row.get("summary") or row.get("excerpt") or "", 180)
        url = with_utm(f"{domain}/pressroom/{row.get('slug') or rid}", "afternoon")
        lines = [f"📰 {title}"]
        if summary:
            lines.extend(["", summary])
        lines.extend(["", f"👉 Read more on {site_name}: {url}"])
        return PostCandidate("press_articles", str(rid), "afternoon", "\n".join(lines), url, title)

    # 2. Local news in vendor_events (non-expired, excluding past_events, never posted twice)
    for row in vendor_rows:
        if (row.get("status") or "").lower() != "approved":
            continue
        if is_expired(row, today):
            continue
        cat = (row.get("category") or "").strip().lower()
        if cat not in NEWS_CATEGORIES or cat == "past_events":
            continue
        rid = row.get("id")
        title = _clean_title(row.get("title") or "")
        if rid is None or not title:
            continue
        if _in_cooldown(last_map, "vendor_events", rid, None, now_utc):
            continue

        summary = _truncate(row.get("summary") or "", 180)
        url = with_utm(f"{domain}/newsroom", "afternoon")
        lines = [f"📢 Community Update: {title}"]
        if summary:
            lines.extend(["", summary])
        lines.extend(["", f"👉 Read local news on {site_name}: {url}"])
        return PostCandidate("vendor_events", str(rid), "afternoon", "\n".join(lines), url, title)

    # 3. Rotating evergreen site CTAs (3-day cooldown)
    ctas = [
        ("weekend", f"🗓️ Planning ahead? Check out what's happening on {site_name} this week and weekend!", f"{domain}/this-weekend"),
        ("offers", f"🏷️ Looking for local deals and perks? Browse verified offers from local businesses on {site_name}.", f"{domain}/offers"),
        ("dining", f"🍽️ Hungry? Discover local restaurants, cafés, and dining specials on {site_name}.", f"{domain}/dining"),
        ("subscribe", f"📬 Never miss a local event or deal — join the free twice-weekly {site_name} newsletter!", f"{domain}/subscribe"),
        ("directory", f"🏪 Discover and support local businesses in our community directory on {site_name}.", f"{domain}/directory"),
    ]
    for cta_id, text, base_url in ctas:
        if not _in_cooldown(last_map, "evergreen_cta", cta_id, DEFAULT_CTA_COOLDOWN_DAYS, now_utc):
            url = with_utm(base_url, "afternoon")
            return PostCandidate("evergreen_cta", cta_id, "afternoon", f"{text}\n\n👉 {url}", url, cta_id)

    return None


# --------------------------------------------------------------------------- orchestration & Graph API

def pick_candidate(slot: str = "auto", now: Optional[datetime] = None) -> Optional[PostCandidate]:
    now_tor = _toronto_now(now)
    today = now_tor.date()
    now_utc = now_tor.astimezone(timezone.utc)
    resolved_slot = resolve_slot(slot, now_tor)

    logs = fetch_recent_post_log(days=60)
    last_map = _last_posted_map(logs)

    tomorrow_iso = (today + timedelta(days=1)).isoformat()
    today_iso = today.isoformat()

    vendor_rows = _supabase_get(
        "vendor_events",
        {
            "select": "id,slug,title,business_name,category,status,event_date_label,event_start_date,"
                      "expires_after,date_type,recurrence_rule,location,summary,is_featured",
            "status": "eq.approved",
            "or": f"(expires_after.is.null,expires_after.gte.{today_iso})",
            "order": "event_start_date.asc.nullslast,created_at.desc",
            "limit": "300",
        },
    )
    partner_rows = _supabase_get(
        "partners",
        {
            "select": "id,business_name,offer_details,category,location,status",
            "status": "eq.Approved",
            "order": "created_at.desc",
            "limit": "100",
        },
    )
    directory_rows = _supabase_get(
        "directory_listings",
        {
            "select": "id,slug,name,category,community,location,status",
            "status": "eq.approved",
            "order": "created_at.desc",
            "limit": "200",
        },
    )
    press_rows = _supabase_get(
        "press_articles",
        {
            "select": "id,slug,title,summary,status,published_at",
            "status": "eq.published",
            "order": "published_at.desc",
            "limit": "50",
        },
    )

    # Suppress unused variable warning while documenting tomorrow filter intent
    _ = tomorrow_iso

    order_by_slot = {
        "morning": ("morning", "midday", "afternoon"),
        "midday": ("midday", "afternoon", "morning"),
        "afternoon": ("afternoon", "midday", "morning"),
    }

    for target_slot in order_by_slot[resolved_slot]:
        if target_slot == "morning":
            cand = select_event_candidate(vendor_rows, last_map, today, now_utc)
        elif target_slot == "midday":
            cand = select_midday_candidate(vendor_rows, partner_rows, directory_rows, last_map, today, now_utc)
        else:
            cand = select_afternoon_candidate(press_rows, vendor_rows, last_map, today, now_utc)
        if cand is not None:
            cand.slot = resolved_slot
            return cand

    return None


def publish_to_facebook(candidate: PostCandidate, dry_run: bool = False) -> Optional[str]:
    if dry_run:
        print("=== DRY RUN (not posted to Facebook) ===")
        print(f"Slot:   {candidate.slot}")
        print(f"Source: {candidate.source_table}:{candidate.source_id} ({candidate.label})")
        print(f"URL:    {candidate.target_url}")
        print("--- Caption ---")
        print(candidate.caption)
        print("========================================")
        return "dry-run"

    page_id = (os.environ.get("FB_PAGE_ID") or "").strip()
    token = (os.environ.get("FB_PAGE_ACCESS_TOKEN") or "").strip()
    version = (os.environ.get("FB_GRAPH_VERSION") or DEFAULT_GRAPH_VERSION).strip()
    if not page_id or not token:
        raise RuntimeError("FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN must be set to publish to Facebook.")
    if not page_id.isdigit():
        raise ValueError("FB_PAGE_ID must be numeric.")
    if not re.fullmatch(r"v\d+\.\d+", version):
        raise ValueError("FB_GRAPH_VERSION must match v<major>.<minor>.")

    endpoint = f"https://graph.facebook.com/{version}/{page_id}/feed"
    resp = requests.post(
        endpoint,
        data={
            "message": candidate.caption,
            "link": candidate.target_url,
            "access_token": token,
        },
        timeout=20,
    )
    if resp.status_code not in (200, 201):
        safe_err = resp.text[:300].replace(token, "***")
        raise RuntimeError(f"Facebook Graph API error (HTTP {resp.status_code}): {safe_err}")

    post_id = str((resp.json() or {}).get("id") or "")
    print(f"Published Facebook post {post_id} ({candidate.source_table}:{candidate.source_id}) -> {candidate.target_url}")
    log_posted_item(candidate, post_id)
    notify_new_facebook_post(candidate, post_id)
    return post_id


def facebook_post_url(post_id: str, page_id: str = "") -> str:
    pid = (post_id or "").strip()
    if pid:
        return f"https://www.facebook.com/{pid}"
    pg = (page_id or os.environ.get("FB_PAGE_ID") or "").strip()
    return f"https://www.facebook.com/{pg}" if pg else "https://www.facebook.com/"


def notify_new_facebook_post(candidate: PostCandidate, post_id: str) -> bool:
    """Email the direct Facebook post link so it can be shared to selected groups in one click."""
    recipient = (os.environ.get("FB_NOTIFY_EMAIL") or "contact@welcomeeg.ca").strip()
    if not recipient:
        return False

    site_name = _site_name()
    fb_url = facebook_post_url(post_id)
    subject = f"[{site_name}] New Facebook Post ({candidate.slot}) — Share to Groups"

    safe_label = html_lib.escape(candidate.label or candidate.source_id)
    safe_caption = html_lib.escape(candidate.caption).replace("\n", "<br>")
    safe_fb_url = html_lib.escape(fb_url)
    safe_target_url = html_lib.escape(candidate.target_url)

    html_body = f"""<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;padding:20px;color:#1e293b;margin:0;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;text-transform:uppercase;color:#0284c7;">{html_lib.escape(site_name)} • {html_lib.escape(candidate.slot.capitalize())} Post Live</p>
    <h2 style="margin:0 0 12px 0;font-size:20px;color:#0f172a;">{safe_label}</h2>
    <p style="margin:0 0 18px 0;">
      <a href="{safe_fb_url}" style="display:inline-block;background:#1877f2;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;">Open Post on Facebook to Share →</a>
    </p>
    <div style="background:#f1f5f9;border-radius:8px;padding:14px;font-size:14px;line-height:1.5;color:#334155;margin-bottom:14px;">
      {safe_caption}
    </div>
    <p style="margin:0;font-size:12px;color:#64748b;">
      Direct Facebook link: <a href="{safe_fb_url}" style="color:#1877f2;">{safe_fb_url}</a><br>
      Website link: <a href="{safe_target_url}" style="color:#0f172a;">{safe_target_url}</a>
    </p>
  </div>
</body>
</html>"""

    text_body = (
        f"{site_name} ({candidate.slot}) post is live!\n\n"
        f"Open on Facebook to share to groups:\n{fb_url}\n\n"
        f"Caption:\n{candidate.caption}\n"
    )
    ok = send_single_email(recipient, subject, html_body, text_body)
    print(f"Share-link email {'sent' if ok else 'not sent'} to {recipient}.")
    return ok
