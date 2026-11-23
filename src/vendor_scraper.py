"""
Small Vendor Discovery & Universal CMS/Schema Event Scraper for East Gwillimbury, ON.

Capabilities:
1. Universal CMS/Schema Scraper (`scrape_vendor_url`):
   Given any small vendor's event page URL (either submitted by a vendor via the
   online Member Portal and approved in Supabase, or listed in `data/vendor_sources.json`),
   automatically detects and extracts upcoming events using 5 strategies:
     - Strategy 1: Schema.org JSON-LD (`application/ld+json` -> `@type: *Event*`)
     - Strategy 2: WordPress "The Events Calendar" REST API (`/wp-json/tribe/events/v1/events`)
     - Strategy 3: Squarespace JSON API (`?format=json` -> `upcoming` / `items`)
     - Strategy 4: iCalendar (`.ics`) VEVENT parser
     - Strategy 5: Structured HTML event cards, Microdata, and date-annotated links
2. East Gwillimbury Directory Crawler (`discover_directory_vendor_events`):
   Crawls Explore East Gwillimbury (`exploregeorgina.ca`) and East Gwillimbury Chamber listings
   to surface hard-to-find local vendor, farm, studio, and market events.
3. Supabase Portal Integration (`get_small_vendor_events`):
   Merges approved manual vendor submissions + approved auto-scrape vendor URLs
   from Supabase with local curated and directory-discovered small vendor events.
"""
from datetime import datetime
import html
import json
from pathlib import Path
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from dateutil import parser as date_parser
import requests

from src.supabase_client import (
    fetch_approved_scrape_sources,
    fetch_approved_vendor_events,
    fetch_url_blacklist,
    is_url_blacklisted,
    mark_source_scraped,
)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
}

DATE_REGEX = re.compile(
    r"\b(?:"
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?(?:,?\s+\d{4})?"
    r"|\d{4}-\d{2}-\d{2}"
    r")\b",
    re.IGNORECASE,
)


def _truncate(text: str, max_chars: int = 230) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) > max_chars:
        return cleaned[:max_chars].rstrip() + "..."
    return cleaned


def _clean_html_text(raw: str) -> str:
    if not raw:
        return ""
    soup = BeautifulSoup(html.unescape(raw), "html.parser")
    return " ".join(soup.get_text(" ", strip=True).split())


def _format_date_label(raw_date: str) -> Optional[str]:
    """Parses an ISO or natural date string; returns None if date is in the past."""
    if not raw_date:
        return None
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        dt = date_parser.parse(raw_date, fuzzy=True).replace(tzinfo=None)
        if dt < today:
            return None
        if dt.hour or dt.minute:
            return dt.strftime("%a, %b %d, %Y • %I:%M %p").replace(" 0", " ")
        return dt.strftime("%a, %b %d, %Y")
    except Exception:
        return None


def _collect_jsonld_events(node: Any, out: List[Dict[str, Any]]) -> None:
    """Recursively extracts Schema.org Event objects from JSON-LD payloads."""
    if isinstance(node, list):
        for item in node:
            _collect_jsonld_events(item, out)
        return
    if not isinstance(node, dict):
        return

    node_type = node.get("@type")
    types = [node_type] if isinstance(node_type, str) else (node_type if isinstance(node_type, list) else [])
    if any(isinstance(t, str) and "event" in t.lower() for t in types):
        out.append(node)

    if "@graph" in node:
        _collect_jsonld_events(node["@graph"], out)
    if "itemListElement" in node:
        _collect_jsonld_events(node["itemListElement"], out)
    if "item" in node and isinstance(node["item"], (dict, list)):
        _collect_jsonld_events(node["item"], out)


def _parse_jsonld_from_soup(
    soup: BeautifulSoup,
    base_url: str,
    business_name: str,
    default_location: str,
) -> List[Dict[str, str]]:
    """Strategy 1: Extracts Schema.org Event objects from application/ld+json."""
    extracted: List[Dict[str, str]] = []
    raw_events: List[Dict[str, Any]] = []

    for script in soup.find_all("script", type="application/ld+json"):
        if not script.string:
            continue
        try:
            payload = json.loads(script.string)
            _collect_jsonld_events(payload, raw_events)
        except Exception:
            continue

    seen = set()
    for ev in raw_events:
        title = _clean_html_text(str(ev.get("name") or ""))
        if not title or title.lower() in seen:
            continue

        start_raw = str(ev.get("startDate") or "").strip()
        end_raw = str(ev.get("endDate") or "").strip()
        date_label = _format_date_label(start_raw) or _format_date_label(end_raw)
        if not date_label:
            continue

        ev_url = urljoin(base_url, str(ev.get("url") or base_url).strip())
        desc = _clean_html_text(str(ev.get("description") or ""))

        loc_str = default_location
        loc_obj = ev.get("location")
        if isinstance(loc_obj, dict):
            v_name = _clean_html_text(str(loc_obj.get("name") or ""))
            addr = loc_obj.get("address")
            city = ""
            if isinstance(addr, dict):
                city = _clean_html_text(str(addr.get("addressLocality") or ""))
            elif isinstance(addr, str):
                city = _clean_html_text(addr)
            parts = [p for p in (v_name, city) if p]
            if parts:
                loc_str = " • ".join(parts)

        seen.add(title.lower())
        extracted.append({
            "title": title,
            "link": ev_url,
            "source": business_name,
            "date": date_label,
            "location": loc_str,
            "category": "private_business_events",
            "summary": _truncate(desc) if desc else f"Upcoming event hosted by {business_name} ({date_label}).",
        })

    return extracted


def _try_wordpress_tribe_api(
    url: str,
    business_name: str,
    default_location: str,
) -> List[Dict[str, str]]:
    """
    Strategy 2: Queries the WordPress 'The Events Calendar' REST API
    (/wp-json/tribe/events/v1/events) if available on the vendor's domain.
    """
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return []

    root = f"{parsed.scheme}://{parsed.netloc}"
    today_iso = datetime.now().strftime("%Y-%m-%d")
    api_url = f"{root}/wp-json/tribe/events/v1/events?per_page=8&start_date={today_iso}"

    extracted: List[Dict[str, str]] = []
    try:
        resp = requests.get(api_url, headers=DEFAULT_HEADERS, timeout=10)
        if resp.status_code != 200 or "json" not in (resp.headers.get("Content-Type") or "").lower():
            return []
        data = resp.json()
        events_list = data.get("events", []) if isinstance(data, dict) else []
        for ev in events_list:
            if not isinstance(ev, dict):
                continue
            title = _clean_html_text(str(ev.get("title") or ""))
            start_raw = str(ev.get("start_date") or "").strip()
            end_raw = str(ev.get("end_date") or "").strip()
            date_label = _format_date_label(start_raw) or _format_date_label(end_raw)
            if not title or not date_label:
                continue

            ev_url = str(ev.get("url") or url).strip()
            desc = _clean_html_text(str(ev.get("excerpt") or ev.get("description") or ""))

            loc_str = default_location
            venue = ev.get("venue")
            if isinstance(venue, dict):
                v_name = _clean_html_text(str(venue.get("venue") or ""))
                v_city = _clean_html_text(str(venue.get("city") or ""))
                parts = [p for p in (v_name, v_city) if p]
                if parts:
                    loc_str = " • ".join(parts)

            extracted.append({
                "title": title,
                "link": ev_url,
                "source": business_name,
                "date": date_label,
                "location": loc_str,
                "category": "private_business_events",
                "summary": _truncate(desc) if desc else f"Upcoming event from {business_name} ({date_label}).",
            })
    except Exception:
        return []

    return extracted


def _try_squarespace_json(
    url: str,
    business_name: str,
    default_location: str,
) -> List[Dict[str, str]]:
    """Strategy 3: Queries Squarespace ?format=json on event collections."""
    sep = "&" if "?" in url else "?"
    json_url = f"{url}{sep}format=json"
    extracted: List[Dict[str, str]] = []
    now_ms = int(datetime.now().timestamp() * 1000)

    try:
        resp = requests.get(json_url, headers=DEFAULT_HEADERS, timeout=10)
        if resp.status_code != 200 or "json" not in (resp.headers.get("Content-Type") or "").lower():
            return []
        data = resp.json()
        if not isinstance(data, dict):
            return []

        items = data.get("upcoming") or data.get("items") or []
        if not isinstance(items, list):
            return []

        for item in items:
            if not isinstance(item, dict):
                continue
            title = _clean_html_text(str(item.get("title") or ""))
            start_ms = item.get("startDate")
            end_ms = item.get("endDate")
            if not title or not isinstance(start_ms, (int, float)):
                continue
            if start_ms < now_ms and (not isinstance(end_ms, (int, float)) or end_ms < now_ms):
                continue

            dt = datetime.fromtimestamp(start_ms / 1000.0)
            date_label = dt.strftime("%a, %b %d, %Y")
            full_url = urljoin(url, str(item.get("fullUrl") or url))
            desc = _clean_html_text(str(item.get("excerpt") or item.get("body") or ""))

            extracted.append({
                "title": title,
                "link": full_url,
                "source": business_name,
                "date": date_label,
                "location": default_location,
                "category": "private_business_events",
                "summary": _truncate(desc) if desc else f"Upcoming event hosted by {business_name} ({date_label}).",
            })
    except Exception:
        return []

    return extracted


def _parse_ics_text(
    ics_text: str,
    fallback_url: str,
    business_name: str,
    default_location: str,
) -> List[Dict[str, str]]:
    """Strategy 4: Parses iCalendar (.ics) VEVENT blocks."""
    extracted: List[Dict[str, str]] = []
    unfolded = re.sub(r"\r?\n[ \t]", "", ics_text)
    blocks = re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", unfolded, flags=re.DOTALL | re.IGNORECASE)

    for block in blocks:
        fields: Dict[str, str] = {}
        for line in block.splitlines():
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            key_base = k.split(";", 1)[0].strip().upper()
            fields[key_base] = v.strip()

        title = _clean_html_text(fields.get("SUMMARY", "").replace("\\,", ",").replace("\\n", " "))
        dt_raw = fields.get("DTSTART", "")
        if not title or not dt_raw:
            continue

        # Parse YYYYMMDD or YYYYMMDDTHHMMSS
        m = re.match(r"^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?", dt_raw)
        if not m:
            continue
        iso_str = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        if m.group(4) and m.group(5):
            iso_str += f" {m.group(4)}:{m.group(5)}"

        date_label = _format_date_label(iso_str)
        if not date_label:
            continue

        ev_url = fields.get("URL", "") or fallback_url
        loc = fields.get("LOCATION", "").replace("\\,", ",").strip() or default_location
        desc = _clean_html_text(fields.get("DESCRIPTION", "").replace("\\n", " ").replace("\\,", ","))

        extracted.append({
            "title": title,
            "link": ev_url,
            "source": business_name,
            "date": date_label,
            "location": loc,
            "category": "private_business_events",
            "summary": _truncate(desc) if desc else f"Upcoming event hosted by {business_name} ({date_label}).",
        })

    return extracted


def _parse_html_event_blocks(
    soup: BeautifulSoup,
    base_url: str,
    business_name: str,
    default_location: str,
) -> List[Dict[str, str]]:
    """
    Strategy 5: Extracts events from common CMS HTML event containers
    (WordPress Tribe Events, Modern Events Calendar, Squarespace EventList,
    generic `.event-card` / `article` blocks, or `/event/` links).
    """
    extracted: List[Dict[str, str]] = []
    seen_titles = set()

    selectors = [
        ".tribe-events-calendar-list__event-row",
        ".type-tribe_events",
        ".eventlist-event",
        ".mec-event-article",
        ".event-card",
        ".event-item",
        ".events-list .event",
        "article[class*='event']",
        "div[class*='event-card']",
        "div[class*='event-item']",
        "li[class*='event']",
    ]

    cards = []
    for sel in selectors:
        found = soup.select(sel)
        if found:
            cards.extend(found)

    for card in cards:
        heading = card.find(["h1", "h2", "h3", "h4", "h5"])
        a_tag = (heading.find("a", href=True) if heading else None) or card.find("a", href=True)
        if not a_tag and not heading:
            continue

        title = _clean_html_text(
            heading.get_text(" ", strip=True) if heading else a_tag.get_text(" ", strip=True)
        )
        if (
            not title
            or len(title) < 4
            or title.lower() in ("read more", "learn more", "view event", "ics", "google calendar", "events")
            or title.lower() in seen_titles
        ):
            continue

        href = urljoin(base_url, a_tag["href"].strip()) if a_tag and a_tag.get("href") else base_url
        if "format=ics" in href.lower():
            continue

        # Extract date from <time> tag or regex match in card text
        date_label = None
        time_el = card.find("time")
        if time_el:
            dt_attr = time_el.get("datetime") or time_el.get_text(" ", strip=True)
            date_label = _format_date_label(dt_attr)

        card_text = " ".join(card.get_text(" ", strip=True).split())
        if not date_label:
            m = DATE_REGEX.search(card_text)
            if m:
                date_label = _format_date_label(m.group(0)) or m.group(0)

        p_tag = card.find("p")
        desc = _clean_html_text(p_tag.get_text(" ", strip=True)) if p_tag else ""
        if not desc:
            desc = f"Upcoming community/vendor event hosted by {business_name}."

        seen_titles.add(title.lower())
        extracted.append({
            "title": title,
            "link": href,
            "source": business_name,
            "date": date_label or "Upcoming Vendor Event",
            "location": default_location,
            "category": "private_business_events",
            "summary": _truncate(desc),
        })

    # Fallback: look for direct links containing `/event/` or `/events/` with a meaningful title
    if not extracted:
        for a_tag in soup.find_all("a", href=True):
            raw_href = a_tag["href"].strip()
            if not re.search(r"/(?:event|events|workshop|market)s?/[a-z0-9_-]{3,}", raw_href, re.I):
                continue
            if "format=ics" in raw_href.lower() or raw_href.rstrip("/") == base_url.rstrip("/"):
                continue

            title = _clean_html_text(a_tag.get_text(" ", strip=True))
            if (
                not title
                or len(title) < 6
                or title.lower() in ("events", "upcoming events", "past events", "read more", "learn more", "view all")
                or title.lower() in seen_titles
            ):
                continue

            parent_text = " ".join(a_tag.parent.get_text(" ", strip=True).split()) if a_tag.parent else ""
            m = DATE_REGEX.search(parent_text)
            date_label = (_format_date_label(m.group(0)) if m else None) or "Upcoming Local Event"

            seen_titles.add(title.lower())
            extracted.append({
                "title": title,
                "link": urljoin(base_url, raw_href),
                "source": business_name,
                "date": date_label,
                "location": default_location,
                "category": "private_business_events",
                "summary": f"Upcoming local vendor event hosted by {business_name} in East Gwillimbury.",
            })
            if len(extracted) >= 4:
                break

    return extracted


def _mark_out_of_area(events: List[Dict[str, Any]], default_location: str) -> None:
    """Sources outside East Gwillimbury have "(Out of Area)" in their default location.
    Keep that marker on every event so the site files them under Out of Area."""
    if "out of area" not in (default_location or "").lower():
        return
    for ev in events:
        loc = (ev.get("location") or default_location).strip()
        if "out of area" not in loc.lower():
            loc = f"{loc} (Out of Area)"
        ev["location"] = loc


def scrape_vendor_url(
    url: str,
    business_name: str,
    default_location: str = "East Gwillimbury, ON",
    max_events: int = 4,
) -> List[Dict[str, str]]:
    """
    Universal CMS/Schema Event Scraper.
    Automatically detects and extracts upcoming events from any small vendor webpage.
    """
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=12)
        resp.raise_for_status()
    except Exception as exc:
        print(f"Warning: Vendor scrape skipped for {business_name} ({url}): {exc}")
        return []

    content_type = (resp.headers.get("Content-Type") or "").lower()
    text = resp.text

    # 1. Direct iCal (.ics) feed
    if url.lower().endswith(".ics") or "text/calendar" in content_type or "BEGIN:VCALENDAR" in text[:400]:
        events = _parse_ics_text(text, url, business_name, default_location)
        if events:
            return events[:max_events]

    soup = BeautifulSoup(text, "html.parser")

    # 2. Schema.org JSON-LD (`application/ld+json`)
    events = _parse_jsonld_from_soup(soup, url, business_name, default_location)
    if events:
        return events[:max_events]

    # 3. WordPress 'The Events Calendar' REST API (`/wp-json/tribe/events/v1/events`)
    if "wp-content" in text or "tribe-events" in text:
        events = _try_wordpress_tribe_api(url, business_name, default_location)
        if events:
            return events[:max_events]

    # 4. Squarespace JSON API (`?format=json`)
    if "squarespace" in text.lower() or soup.select_one(".eventlist-event"):
        events = _try_squarespace_json(url, business_name, default_location)
        if events:
            return events[:max_events]

    # 5. Structured HTML event blocks & date-annotated links
    events = _parse_html_event_blocks(soup, url, business_name, default_location)
    return events[:max_events]


def discover_directory_vendor_events(
    limit: int = 6,
    blacklist: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, str]]:
    """
    Crawls Explore East Gwillimbury's Festivals & Events and Agri-Tourism/Farm pages
    to surface seasonal vendor markets, farm pop-ups, and studio tours.
    """
    active_blacklist = blacklist if blacklist is not None else fetch_url_blacklist()
    directory_urls = [
        ("https://www.exploregeorgina.ca/things-to-do/festivals-and-events", "Explore East Gwillimbury • Local Festival & Market"),
        ("https://www.exploregeorgina.ca/things-to-do/agri-tourism-and-farms", "Explore East Gwillimbury • Local Farm & Vendor"),
    ]
    discovered: List[Dict[str, str]] = []
    seen_titles = set()

    for url, source_label in directory_urls:
        if is_url_blacklisted(url, active_blacklist):
            print(f"Skipping blacklisted directory URL: {url}")
            continue
        try:
            resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=12)
            if resp.status_code != 200:
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
            main = soup.find("main") or soup

            for heading in main.find_all(["h2", "h3", "h4"]):
                title = _clean_html_text(heading.get_text(" ", strip=True))
                if (
                    not title
                    or len(title) < 5
                    or any(
                        skip in title.lower()
                        for skip in (
                            "search",
                            "menu",
                            "footer",
                            "contact",
                            "newsletter",
                            "stay connected",
                            "festivals and events",
                            "agri-tourism",
                            "things to do",
                            "quick links",
                            "explore georgina",
                        )
                    )
                    or title.lower() in seen_titles
                ):
                    continue

                # Find accompanying paragraph either inside parent container or next sibling
                parent = heading.find_parent(["div", "article", "section", "li"]) or heading.parent
                a_tag = heading.find("a", href=True)
                if not a_tag:
                    nxt_a = heading.find_next("a", href=True)
                    if nxt_a:
                        a_tag = nxt_a
                href = urljoin(url, a_tag["href"].strip()) if a_tag else url
                if is_url_blacklisted(href, active_blacklist, source_url=url):
                    continue

                desc = ""
                nxt_p = heading.find_next_sibling("p") or heading.find_next("p")
                if nxt_p:
                    p_txt = _clean_html_text(nxt_p.get_text(" ", strip=True))
                    if p_txt and len(p_txt) > 25 and p_txt != title:
                        desc = p_txt

                if not desc:
                    continue

                seen_titles.add(title.lower())
                discovered.append({
                    "title": title,
                    "link": href,
                    "source": source_label,
                    "source_url": url,
                    "date": "East Gwillimbury Local Vendor / Event",
                    "location": "East Gwillimbury, ON",
                    "category": "private_business_events",
                    "summary": _truncate(desc),
                })
                if len(discovered) >= limit:
                    return discovered
        except Exception as exc:
            print(f"Warning: Explore East Gwillimbury directory crawl skipped for {url}: {exc}")

    return discovered


def get_small_vendor_events(
    limit: int = 16,
    blacklist: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, str]]:
    """
    Aggregates all small vendor events from:
    1. Approved manual vendor event submissions in Supabase (`vendor_events`)
    2. Approved vendor auto-scrape URLs in Supabase (`vendor_scrape_sources`)
    3. Curated East Gwillimbury small vendor URLs in `data/vendor_sources.json`
    4. East Gwillimbury Directory Crawler (`discover_directory_vendor_events`)
    """
    active_blacklist = blacklist if blacklist is not None else fetch_url_blacklist()
    all_vendor_events: List[Dict[str, str]] = []
    seen_titles = set()

    def _add_unique(items: List[Dict[str, str]], parent_url: str = "") -> None:
        for ev in items:
            ev_link = (ev.get("link") or "").strip()
            s_url = (ev.get("source_url") or parent_url or "").strip()
            if is_url_blacklisted(ev_link, active_blacklist, source_url=s_url, title=ev.get("title", "")):
                continue
            norm = ev.get("title", "").strip().lower()
            if not norm or norm in seen_titles:
                continue
            seen_titles.add(norm)
            if s_url and not ev.get("source_url"):
                ev["source_url"] = s_url
            all_vendor_events.append(ev)

    # 1. Admin-approved manual submissions from Supabase
    _add_unique(fetch_approved_vendor_events())

    # 2. Admin-approved vendor auto-scrape URLs from Supabase
    approved_sources = fetch_approved_scrape_sources()
    scraped_urls = set()
    for src in approved_sources:
        s_url = src["scrape_url"]
        if s_url in scraped_urls:
            continue
        scraped_urls.add(s_url)
        src_notes = (src.get("notes") or "").lower()
        if "reddit.com" in urlparse(s_url).netloc.lower() or "newsroom" in src_notes or "local news" in src_notes or s_url.lower().endswith(".rss"):
            # Newsroom / RSS sources are ingested as local_news in scraper.py, never as events.
            continue
        if is_url_blacklisted(s_url, active_blacklist):
            print(f"Skipping blacklisted vendor scrape URL: {s_url}")
            continue
        scraped = scrape_vendor_url(
            url=s_url,
            business_name=f"{src['business_name']} • Local Vendor",
            default_location=src.get("default_location") or "East Gwillimbury, ON",
            max_events=3,
        )
        _mark_out_of_area(scraped, src.get("default_location") or "")
        _add_unique(scraped, parent_url=s_url)
        if src.get("id"):
            mark_source_scraped(src["id"])

    # 3. Curated small vendor sources from data/vendor_sources.json
    sources_path = Path(__file__).resolve().parent.parent / "data" / "vendor_sources.json"
    if sources_path.exists():
        try:
            config = json.loads(sources_path.read_text(encoding="utf-8"))
            for vendor in config.get("vendors", []):
                if not isinstance(vendor, dict) or not vendor.get("enabled", True):
                    continue
                v_url = (vendor.get("scrape_url") or "").strip()
                if not v_url or v_url in scraped_urls:
                    continue
                scraped_urls.add(v_url)
                if is_url_blacklisted(v_url, active_blacklist):
                    print(f"Skipping blacklisted curated vendor URL: {v_url}")
                    continue
                v_name = (vendor.get("business_name") or "East Gwillimbury Vendor").strip()
                v_loc = (vendor.get("default_location") or "East Gwillimbury, ON").strip()
                scraped = scrape_vendor_url(
                    url=v_url,
                    business_name=v_name,
                    default_location=v_loc,
                    max_events=3,
                )
                _mark_out_of_area(scraped, v_loc)
                _add_unique(scraped, parent_url=v_url)
        except Exception as exc:
            print(f"Warning: Failed reading data/vendor_sources.json: {exc}")

    # 4. East Gwillimbury Directory Crawler
    _add_unique(discover_directory_vendor_events(limit=4, blacklist=active_blacklist))

    return all_vendor_events[:limit]
