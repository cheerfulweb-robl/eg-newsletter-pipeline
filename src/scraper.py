"""
Scrapes and aggregates local news, municipal releases, library programs,
chamber of commerce events, Eventbrite listings, private venue/business events,
and upcoming community events from East Gwillimbury, ON.
"""
import html
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin
from dateutil import parser as date_parser
import feedparser
import requests
from bs4 import BeautifulSoup

from src.compiler import normalize_destination_url
from src.supabase_client import (
    fetch_approved_partner_deals,
    fetch_url_blacklist,
    is_url_blacklisted,
)
from src.vendor_scraper import get_small_vendor_events

BASE_EG_URL = "https://www.eastgwillimbury.ca"
BASE_EG_CALENDAR_URL = "https://calendar.eastgwillimbury.ca"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
}

BOILERPLATE_PHRASES = (
    "19000 leslie street",
    "adobe acrobat",
    "select the document to view",
    "communications@eastgwillimbury.ca",
    "customerservice@eastgwillimbury.ca",
)

EG_LOCALITIES = {
    "east gwillimbury",
    "holland landing",
    "mount albert",
    "queensville",
    "sharon",
    "river drive park",
    "river drive",
    "holt",
    "franklin",
    "brown hill",
    "ravenshoe",
}

NEARBY_LOCALITIES = {
    "newmarket",
    "aurora",
    "georgina",
    "keswick",
    "sutton",
    "pefferlaw",
    "bradford",
    "bradford west gwillimbury",
    "whitchurch-stouffville",
    "stouffville",
    "uxbridge",
    "richmond hill",
    "king city",
    "innisfil",
}

_ACTIVE_BLACKLIST: List[Dict[str, str]] = []


def _refresh_blacklist() -> List[Dict[str, str]]:
    """Loads the active URL/domain blacklist from Supabase into module cache."""
    global _ACTIVE_BLACKLIST
    try:
        _ACTIVE_BLACKLIST = fetch_url_blacklist()
    except Exception:
        _ACTIVE_BLACKLIST = []
    return _ACTIVE_BLACKLIST


def _is_blocked(url: str, source_url: str = "", title: str = "") -> bool:
    if not _ACTIVE_BLACKLIST:
        return False
    return is_url_blacklisted(url, _ACTIVE_BLACKLIST, source_url=source_url, title=title)


def _truncate(text: str, max_chars: int = 240) -> str:
    clean = " ".join((text or "").split())
    if len(clean) <= max_chars:
        return clean
    return clean[: max_chars - 1].rsplit(" ", 1)[0] + "..."


def _fetch_page_summary(url: str, fallback: str = "") -> str:
    """Fetches a clean meta/lead paragraph summary for an article or event URL."""
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=12)
        if resp.status_code != 200:
            return _truncate(fallback)
        soup = BeautifulSoup(resp.text, "html.parser")
        meta = soup.find("meta", attrs={"name": "description"}) or soup.find(
            "meta", attrs={"property": "og:description"}
        )
        if meta and meta.get("content"):
            desc = " ".join(meta["content"].split())
            if desc and not any(bp in desc.lower() for bp in BOILERPLATE_PHRASES):
                return _truncate(desc)
        for p in soup.select("main p, article p, .content p, p"):
            txt = " ".join(p.get_text(" ", strip=True).split())
            if len(txt) >= 50 and not any(bp in txt.lower() for bp in BOILERPLATE_PHRASES):
                return _truncate(txt)
    except Exception:
        pass
    return _truncate(fallback)


def _detect_eg_community(text: str, default: str = "East Gwillimbury, ON") -> str:
    low = (text or "").lower()
    mapping = [
        ("holland landing", "Holland Landing, ON"),
        ("mount albert", "Mount Albert, ON"),
        ("queensville", "Queensville, ON"),
        ("sharon", "Sharon, ON"),
        ("river drive park", "River Drive Park, ON"),
        ("river drive", "River Drive Park, ON"),
        ("brown hill", "Brown Hill, ON"),
        ("ravenshoe", "Ravenshoe, ON"),
        ("franklin", "Franklin, ON"),
        ("holt", "Holt, ON"),
    ]
    for hint, label in mapping:
        if re.search(rf"\b{re.escape(hint)}\b", low):
            return label
    return default


def get_newmarkettoday_eg_feed(limit: int = 6) -> List[Dict[str, str]]:
    """Fetches NewmarketToday RSS items relevant to East Gwillimbury."""
    feed_url = "https://www.newmarkettoday.ca/rss"
    items: List[Dict[str, str]] = []
    try:
        resp = requests.get(feed_url, headers=DEFAULT_HEADERS, timeout=15)
        if resp.status_code != 200:
            return items
        parsed = feedparser.parse(resp.content)
        for entry in getattr(parsed, "entries", []):
            title = html.unescape((entry.get("title") or "").strip())
            link = (entry.get("link") or "").strip()
            raw_summary = html.unescape(BeautifulSoup(entry.get("summary") or "", "html.parser").get_text(" ", strip=True))
            haystack = f"{title} {raw_summary}".lower()
            if not any(loc in haystack for loc in EG_LOCALITIES):
                continue
            if not title or not link or _is_blocked(link, source_url=feed_url, title=title):
                continue
            pub = (entry.get("published") or entry.get("updated") or "").strip()
            date_str = "Recent"
            if pub:
                try:
                    date_str = date_parser.parse(pub, fuzzy=True).strftime("%b %d, %Y")
                except Exception:
                    date_str = pub[:20]
            items.append({
                "title": title,
                "summary": _truncate(raw_summary or title),
                "date": date_str,
                "location": _detect_eg_community(haystack),
                "link": link,
                "source": "NewmarketToday (East Gwillimbury)",
                "source_url": feed_url,
                "category": "local_news",
            })
            if len(items) >= limit:
                break
    except Exception as exc:
        print(f"Warning: NewmarketToday RSS fetch failed: {exc}")
    return items


def get_municipal_announcements(limit: int = 8) -> List[Dict[str, str]]:
    """Scrapes Town of East Gwillimbury news releases and public notices."""
    news_url = f"{BASE_EG_URL}/modules/news/en"
    items: List[Dict[str, str]] = []
    seen = set()
    try:
        resp = requests.get(news_url, headers=DEFAULT_HEADERS, timeout=15)
        if resp.status_code != 200:
            return items
        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.select("a[href*='/en/news/']"):
            href = (a.get("href") or "").strip()
            title = " ".join(a.get_text(" ", strip=True).split())
            if not href or not title or len(title) < 6:
                continue
            full_url = urljoin(BASE_EG_URL, href)
            if full_url in seen or _is_blocked(full_url, source_url=news_url, title=title):
                continue
            seen.add(full_url)
            summary = _fetch_page_summary(full_url, fallback=title)
            items.append({
                "title": title,
                "summary": summary,
                "date": datetime.now().strftime("%b %d, %Y"),
                "location": _detect_eg_community(f"{title} {summary}"),
                "link": full_url,
                "source": "Town of East Gwillimbury",
                "source_url": news_url,
                "category": "municipal_news",
            })
            if len(items) >= limit:
                break
    except Exception as exc:
        print(f"Warning: Town of EG newsroom fetch failed: {exc}")
    return items


def _fetch_eg_calendar_detail(detail_url: str) -> Dict[str, str]:
    """Fetches an eSolutions /default/Detail/ page to extract location name/room, street address, and summary."""
    out: Dict[str, str] = {"location": "", "summary": ""}
    try:
        resp = requests.get(detail_url, headers=DEFAULT_HEADERS, timeout=10)
        if resp.status_code != 200 or not resp.text:
            return out
        soup = BeautifulSoup(resp.text, "html.parser")

        # 1. Try JSON-LD Event metadata if present
        loc_parts: List[str] = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "{}")
            except Exception:
                continue
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
                if not isinstance(obj, dict) or obj.get("@type") != "Event":
                    continue
                loc_obj = obj.get("location") or {}
                if isinstance(loc_obj, dict):
                    lname = " ".join(str(loc_obj.get("name") or "").split())
                    addr_obj = loc_obj.get("address") or {}
                    if isinstance(addr_obj, dict):
                        street = " ".join(str(addr_obj.get("streetAddress") or "").split())
                        city = " ".join(str(addr_obj.get("addressLocality") or "").split())
                        prov = " ".join(str(addr_obj.get("addressRegion") or "").split())
                        addr_str = ", ".join(p for p in (street, city, prov) if p)
                    else:
                        addr_str = " ".join(str(addr_obj or "").split())
                    if lname:
                        loc_parts.append(lname)
                    if addr_str and addr_str.lower() not in (lname.lower() if lname else ""):
                        loc_parts.append(addr_str)
                desc = html.unescape(BeautifulSoup(str(obj.get("description") or ""), "html.parser").get_text(" ", strip=True))
                if desc and not out["summary"]:
                    out["summary"] = _truncate(desc)

        # 2. Fallback: parse eSolutions Detail labels (Location Name / Location / Room / Address)
        if not loc_parts:
            fields: Dict[str, str] = {}
            for row in soup.select("tr"):
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    k = " ".join(cells[0].get_text(" ", strip=True).split()).rstrip(":").lower()
                    v = " ".join(cells[1].get_text(" ", strip=True).split())
                    if k and v:
                        fields[k] = v
            for dt in soup.select("dt"):
                dd = dt.find_next_sibling("dd")
                if dd:
                    k = " ".join(dt.get_text(" ", strip=True).split()).rstrip(":").lower()
                    v = " ".join(dd.get_text(" ", strip=True).split())
                    if k and v:
                        fields[k] = v
            if not fields:
                text_lines = [" ".join(ln.split()) for ln in soup.get_text("\n").splitlines() if ln.strip()]
                for idx, ln in enumerate(text_lines):
                    m = re.match(r"^(Location Name|Location|Facility|Venue|Room|Address)\s*:\s*(.*)$", ln, re.I)
                    if m:
                        k = m.group(1).lower()
                        v = m.group(2).strip()
                        if not v and idx + 1 < len(text_lines):
                            v = text_lines[idx + 1]
                        if v and k not in fields:
                            fields[k] = v

            loc_name = fields.get("location name") or fields.get("location") or fields.get("facility") or fields.get("venue") or ""
            room = fields.get("room") or ""
            addr = fields.get("address") or ""
            if loc_name and room and room.lower() not in loc_name.lower():
                loc_name = f"{loc_name} ({room})"
            if loc_name:
                loc_parts.append(loc_name)
            if addr and addr.lower() not in loc_name.lower():
                loc_parts.append(addr)

        if loc_parts:
            out["location"] = " • ".join(loc_parts)

        # 3. Extract description paragraph if not found in JSON-LD
        if not out["summary"]:
            for sel in (".calendar-description", ".event-description", ".detail-description", "article p", "main p"):
                el = soup.select_one(sel)
                if el:
                    txt = " ".join(el.get_text(" ", strip=True).split())
                    if len(txt) >= 20 and not any(bp in txt.lower() for bp in BOILERPLATE_PHRASES):
                        out["summary"] = _truncate(txt)
                        break
    except Exception:
        pass
    return out


def get_east_gwillimbury_events(limit: int = 24) -> List[Dict[str, str]]:
    """Scrapes upcoming community & library events from calendar.eastgwillimbury.ca."""
    items: List[Dict[str, str]] = []
    seen = set()
    today_iso = datetime.now().strftime("%Y-%m-%d")
    try:
        resp = requests.get(BASE_EG_CALENDAR_URL + "/", headers=DEFAULT_HEADERS, timeout=15)
        if resp.status_code != 200:
            return items
        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.select("a[href*='/default/Detail/']"):
            href = (a.get("href") or "").strip()
            title = " ".join(a.get_text(" ", strip=True).split())
            if not href or not title or len(title) < 4:
                continue
            # Strip trailing time like " 1:00 pm" if duplicated
            title_clean = re.sub(r"\s+\d{1,2}:\d{2}\s*(?:am|pm)$", "", title, flags=re.I).strip()
            full_url = urljoin(BASE_EG_CALENDAR_URL, href)
            if full_url in seen or _is_blocked(full_url, source_url=BASE_EG_CALENDAR_URL, title=title_clean):
                continue
            m = re.search(r"/Detail/(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?-", href)
            if not m:
                continue
            ev_date = m.group(1)
            if ev_date < today_iso:
                continue
            seen.add(full_url)
            try:
                dt_obj = datetime.strptime(ev_date, "%Y-%m-%d")
                date_label = dt_obj.strftime("%b %d, %Y")
            except Exception:
                date_label = ev_date

            detail = _fetch_eg_calendar_detail(full_url)
            resolved_loc = detail["location"] or _detect_eg_community(title_clean)
            resolved_summary = detail["summary"] or _truncate(f"{title_clean} in East Gwillimbury.")
            is_library = "library" in title_clean.lower() or "storytime" in title_clean.lower() or "egpl" in title_clean.lower()
            items.append({
                "title": title_clean,
                "summary": resolved_summary,
                "date": date_label,
                "event_start_date": ev_date,
                "location": resolved_loc,
                "link": full_url,
                "source": "East Gwillimbury Public Library" if is_library else "Town of East Gwillimbury Calendar",
                "source_url": BASE_EG_CALENDAR_URL + "/",
                "category": "library_events" if is_library else "upcoming_events",
            })
            if len(items) >= limit:
                break
    except Exception as exc:
        print(f"Warning: EG calendar fetch failed: {exc}")
    return items


def get_chamber_of_commerce_events(limit: int = 10) -> List[Dict[str, str]]:
    """Scrapes Central York Chamber of Commerce events (JSON-LD + Tribe list)."""
    url = "https://centralyorkchamber.com/events/"
    items: List[Dict[str, str]] = []
    seen = set()
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=15)
        if resp.status_code != 200:
            return items
        soup = BeautifulSoup(resp.text, "html.parser")
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "{}")
            except Exception:
                continue
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
                if not isinstance(obj, dict) or obj.get("@type") != "Event":
                    continue
                title = html.unescape((obj.get("name") or "").strip())
                link = (obj.get("url") or url).strip()
                if not title or link in seen or _is_blocked(link, source_url=url, title=title):
                    continue
                seen.add(link)
                start_raw = (obj.get("startDate") or "").strip()
                ev_date = start_raw[:10] if re.match(r"\d{4}-\d{2}-\d{2}", start_raw) else ""
                date_label = start_raw[:10] or "Upcoming"
                if ev_date:
                    try:
                        date_label = datetime.strptime(ev_date, "%Y-%m-%d").strftime("%b %d, %Y")
                    except Exception:
                        pass
                loc_obj = obj.get("location") or {}
                loc_name = ""
                if isinstance(loc_obj, dict):
                    loc_name = (loc_obj.get("name") or "").strip()
                desc = html.unescape(BeautifulSoup(obj.get("description") or "", "html.parser").get_text(" ", strip=True))
                items.append({
                    "title": title,
                    "summary": _truncate(desc or title),
                    "date": date_label,
                    "event_start_date": ev_date,
                    "location": _detect_eg_community(f"{loc_name} {desc}", default=loc_name or "East Gwillimbury / Newmarket, ON"),
                    "link": link,
                    "source": "Central York Chamber of Commerce",
                    "source_url": url,
                    "category": "chamber_events",
                })
                if len(items) >= limit:
                    return items
    except Exception as exc:
        print(f"Warning: Central York Chamber fetch failed: {exc}")
    return items


def get_eventbrite_events(limit: int = 8) -> List[Dict[str, str]]:
    """Scrapes Eventbrite JSON-LD events for East Gwillimbury and Sharon."""
    urls = [
        "https://www.eventbrite.ca/d/canada--east-gwillimbury/events/",
        "https://www.eventbrite.ca/d/canada--sharon/events/",
    ]
    items: List[Dict[str, str]] = []
    seen = set()
    for eb_url in urls:
        try:
            resp = requests.get(eb_url, headers=DEFAULT_HEADERS, timeout=15)
            if resp.status_code != 200:
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string or "{}")
                except Exception:
                    continue
                entries = []
                if isinstance(data, dict) and isinstance(data.get("itemListElement"), list):
                    entries = [el.get("item") for el in data["itemListElement"] if isinstance(el, dict) and isinstance(el.get("item"), dict)]
                elif isinstance(data, list):
                    entries = [el for el in data if isinstance(el, dict)]
                for ev in entries:
                    title = html.unescape((ev.get("name") or "").strip())
                    link = (ev.get("url") or "").strip()
                    if not title or not link or link in seen or _is_blocked(link, source_url=eb_url, title=title):
                        continue
                    seen.add(link)
                    start_raw = (ev.get("startDate") or "").strip()
                    ev_date = start_raw[:10] if re.match(r"\d{4}-\d{2}-\d{2}", start_raw) else ""
                    date_label = ev_date or "Upcoming"
                    if ev_date:
                        try:
                            date_label = datetime.strptime(ev_date, "%Y-%m-%d").strftime("%b %d, %Y")
                        except Exception:
                            pass
                    loc = ev.get("location") or {}
                    loc_str = loc.get("name", "") if isinstance(loc, dict) else ""
                    items.append({
                        "title": title,
                        "summary": _truncate(ev.get("description") or title),
                        "date": date_label,
                        "event_start_date": ev_date,
                        "location": _detect_eg_community(f"{title} {loc_str}"),
                        "link": link,
                        "source": "Eventbrite East Gwillimbury",
                        "source_url": eb_url,
                        "category": "eventbrite_meetup",
                    })
                    if len(items) >= limit:
                        return items
        except Exception as exc:
            print(f"Warning: Eventbrite fetch failed ({eb_url}): {exc}")
    return items


def get_scheduled_newsroom_rss_sources(limit_per_source: int = 5) -> List[Dict[str, str]]:
    """Reads any RSS/newsroom entries configured in data/vendor_sources.json."""
    items: List[Dict[str, str]] = []
    vs_path = Path(__file__).resolve().parent.parent / "data" / "vendor_sources.json"
    if not vs_path.exists():
        return items
    try:
        cfg = json.loads(vs_path.read_text(encoding="utf-8"))
        for src in cfg.get("rss_sources", []):
            url = (src.get("url") or "").strip()
            name = (src.get("name") or "Local RSS").strip()
            if not url:
                continue
            parsed = feedparser.parse(url)
            for entry in getattr(parsed, "entries", [])[:limit_per_source]:
                title = html.unescape((entry.get("title") or "").strip())
                link = (entry.get("link") or "").strip()
                if not title or not link or _is_blocked(link, source_url=url, title=title):
                    continue
                items.append({
                    "title": title,
                    "summary": _truncate(entry.get("summary") or title),
                    "date": (entry.get("published") or "Recent")[:20],
                    "location": "East Gwillimbury, ON",
                    "link": link,
                    "source": name,
                    "source_url": url,
                    "category": "local_news",
                })
    except Exception:
        pass
    return items


def aggregate_content() -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
    """
    Consolidates all scraped news, events, and partner perks into a single normalized list.
    Also returns a structured `crawl_audit` list detailing the crawl status for every source.
    """
    blacklist = _refresh_blacklist()
    if blacklist:
        print(f"Loaded {len(blacklist)} active URL/domain blacklist rule(s) from Supabase.")

    all_content: List[Dict[str, str]] = []
    crawl_audit: List[Dict[str, Any]] = []

    def _track(name: str, url: str, category: str, fetcher_fn):
        ts = datetime.utcnow().isoformat() + "Z"
        try:
            items = fetcher_fn() or []
            crawl_audit.append({
                "source_name": name,
                "source_url": url,
                "category": category,
                "status": "success" if items else "empty",
                "items_count": len(items),
                "crawled_at": ts,
                "notes": f"Successfully retrieved {len(items)} items" if items else "Source responded but returned 0 items",
            })
            return items
        except Exception as exc:
            crawl_audit.append({
                "source_name": name,
                "source_url": url,
                "category": category,
                "status": "error",
                "items_count": 0,
                "crawled_at": ts,
                "notes": f"Scrape error: {exc}",
            })
            return []

    all_content.extend(_track(
        "NewmarketToday (East Gwillimbury RSS)",
        "https://www.newmarkettoday.ca/rss",
        "local_news",
        lambda: get_newmarkettoday_eg_feed(limit=6),
    ))
    all_content.extend(_track(
        "Town of East Gwillimbury — Newsroom & Public Notices",
        "https://www.eastgwillimbury.ca/modules/news/en",
        "municipal_news",
        lambda: get_municipal_announcements(limit=8),
    ))
    all_content.extend(_track(
        "Town of East Gwillimbury & EGPL — Events Calendar",
        "https://calendar.eastgwillimbury.ca/",
        "upcoming_events",
        lambda: get_east_gwillimbury_events(limit=24),
    ))
    all_content.extend(_track(
        "Central York Chamber of Commerce",
        "https://centralyorkchamber.com/events/",
        "chamber_events",
        lambda: get_chamber_of_commerce_events(limit=10),
    ))
    all_content.extend(_track(
        "Eventbrite (East Gwillimbury & Sharon)",
        "https://www.eventbrite.ca/d/canada--east-gwillimbury/events/",
        "eventbrite_meetup",
        lambda: get_eventbrite_events(limit=8),
    ))
    all_content.extend(_track(
        "Admin-Scheduled RSS Sources",
        "https://welcomeeg.ca/staff/sources.html",
        "local_news",
        lambda: get_scheduled_newsroom_rss_sources(limit_per_source=5),
    ))
    all_content.extend(_track(
        "Small Vendor Portal Submissions & Directory Auto-Scrapes",
        "https://welcomeeg.ca/news/portal.html",
        "private_business_events",
        lambda: get_small_vendor_events(limit=16, blacklist=blacklist),
    ))
    all_content.extend(_track(
        "Welcome East Gwillimbury Partner Deals (Supabase)",
        "https://welcomeeg.ca/partner",
        "partner_deals",
        lambda: fetch_approved_partner_deals(limit=12),
    ))

    filtered_content: List[Dict[str, str]] = []
    blocked_count = 0
    for item in all_content:
        raw_link = item.get("link", "")
        normalized_link = normalize_destination_url(raw_link)
        source_url = item.get("source_url", "")
        if _is_blocked(normalized_link, source_url=source_url, title=item.get("title", "")) or _is_blocked(raw_link, source_url=source_url, title=item.get("title", "")):
            blocked_count += 1
            continue
        item["link"] = normalized_link
        filtered_content.append(item)

    if blocked_count > 0:
        print(f"URL Blacklist Filter: Excluded {blocked_count} article(s)/event(s) based on active blacklist rules.")

    from src.deduplication import deduplicate_events
    deduped_content, dupes_removed = deduplicate_events(filtered_content, threshold=85.0)
    if dupes_removed > 0:
        print(f"RapidFuzz Deduplication: Eliminated {dupes_removed} cross-source duplicate item(s).")

    return deduped_content, crawl_audit
