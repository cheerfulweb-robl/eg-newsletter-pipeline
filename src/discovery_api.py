"""
Welcome East Gwillimbury — Resident Discovery & Local Marketplace API Service
Provides server-side pagination, verified community filtering, America/Toronto date ranges,
full-text fuzzy search, and slug retrieval against Supabase vendor_events and partners.
"""

from datetime import datetime, timedelta, timezone
import math
import re
import unicodedata
from typing import Any, Dict, List, Optional
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from dateutil.tz import gettz as ZoneInfo

from src.http_utils import fetch_with_retry
from src.supabase_client import _get_supabase_config


TORONTO_TZ = ZoneInfo("America/Toronto") if ZoneInfo else None


def get_toronto_now() -> datetime:
    """Returns current datetime in America/Toronto timezone."""
    if TORONTO_TZ:
        try:
            return datetime.now(TORONTO_TZ)
        except Exception:
            pass
    # Fallback offset approximation for Eastern Time
    try:
        now_utc = datetime.now(timezone.utc)
        return now_utc.astimezone(TORONTO_TZ) if TORONTO_TZ else now_utc - timedelta(hours=5)
    except Exception:
        return datetime.utcnow() - timedelta(hours=5)


def generate_slug(title: str, location: str = "") -> str:
    """Generate clean, URL-safe slug from title and location."""
    combined = f"{title or 'event'} {location or ''}".strip()
    slug = unicodedata.normalize("NFKD", combined).encode("ascii", "ignore").decode("utf-8")
    slug = slug.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s-]+", "-", slug).strip("-")
    return slug[:80]


def is_today(target_date: Optional[str]) -> bool:
    if not target_date:
        return False
    try:
        t_d = datetime.strptime(target_date[:10], "%Y-%m-%d").date()
        return t_d == get_toronto_now().date()
    except Exception:
        return False


def is_tomorrow(target_date: Optional[str]) -> bool:
    if not target_date:
        return False
    try:
        t_d = datetime.strptime(target_date[:10], "%Y-%m-%d").date()
        return t_d == (get_toronto_now().date() + timedelta(days=1))
    except Exception:
        return False


def is_this_weekend(target_date: Optional[str]) -> bool:
    """Check if date falls on upcoming Friday, Saturday, or Sunday."""
    if not target_date:
        return False
    try:
        t_d = datetime.strptime(target_date[:10], "%Y-%m-%d").date()
        now = get_toronto_now().date()
        now_weekday = now.weekday()  # Mon=0, ..., Fri=4, Sat=5, Sun=6

        days_until_fri = (4 - now_weekday + 7) % 7
        fri = now + timedelta(days=days_until_fri)
        sun = fri + timedelta(days=2)

        if now_weekday == 6:  # Today is Sunday
            return t_d == now
        if now_weekday == 5:  # Today is Saturday
            return t_d in (now, now + timedelta(days=1))

        return fri <= t_d <= sun
    except Exception:
        return False


def query_discovery_events(
    query: str = "",
    community: str = "All",
    category: str = "All",
    date_filter: str = "All",
    page: int = 1,
    page_size: int = 20,
    status: str = "approved",
) -> Dict[str, Any]:
    """
    Query vendor_events with server-side filtering, sorting, and pagination.
    Only approved / published records are returned to residents.
    """
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/vendor_events"
    params = {
        "select": "id,business_name,submitter_email,title,event_date_label,event_start_date,expires_after,location,link,summary,status,created_at",
        "status": f"eq.{status}",
        "order": "event_start_date.asc.nullslast,created_at.desc",
        "limit": str(min(page_size * 5, 200)),  # Pull candidate batch for verified date/text filter
    }

    if community and community not in ("All", "All East Gwillimbury"):
        params["location"] = f"ilike.*{community}*"

    resp = fetch_with_retry(endpoint, headers=cfg["headers"], params=params, timeout=10)
    if resp is not None and resp.status_code == 200:
        try:
            items = resp.json()
            if not isinstance(items, list):
                items = []
        except ValueError:
            items = []
    else:
        items = []

    # Filter out expired events
    now_date = get_toronto_now().date()
    active_items = []
    for it in items:
        # Check expires_after or start date
        exp = it.get("expires_after")
        if exp:
            try:
                if datetime.strptime(exp[:10], "%Y-%m-%d").date() < now_date:
                    continue  # Concluded / expired
            except Exception:
                pass
        
        # Inject slug
        it["slug"] = generate_slug(it.get("title", ""), it.get("location", ""))
        active_items.append(it)

    # In-memory category and date filtering
    filtered = active_items
    if category and category != "All":
        filtered = [
            it for it in filtered
            if category.lower() in (it.get("title", "") + " " + it.get("summary", "")).lower()
        ]

    if date_filter == "today":
        filtered = [it for it in filtered if is_today(it.get("event_start_date"))]
    elif date_filter == "tomorrow":
        filtered = [it for it in filtered if is_tomorrow(it.get("event_start_date"))]
    elif date_filter == "weekend":
        filtered = [it for it in filtered if is_this_weekend(it.get("event_start_date"))]

    # Search keyword filtering
    if query and query.strip():
        q = query.strip().lower()
        filtered = [
            it for it in filtered
            if q in f"{it.get('title','')} {it.get('business_name','')} {it.get('summary','')} {it.get('location','')}".lower()
        ]

    total_records = len(filtered)
    total_pages = max(1, math.ceil(total_records / page_size))
    start_idx = (page - 1) * page_size
    paged_items = filtered[start_idx : start_idx + page_size]

    return {
        "success": True,
        "page": page,
        "page_size": page_size,
        "total_records": total_records,
        "total_pages": total_pages,
        "items": paged_items,
    }
