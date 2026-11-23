"""
Shared helpers for the newsletter: tracked links, date parsing and ordering, the corrections
banner and the Facebook post copy. The editions themselves are built in src/editions.py.
"""
from datetime import datetime
import html
import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode


DEFAULT_PORTAL_BASE_URL = "https://welcomeeg.ca/news"
DEFAULT_MAIN_SITE_URL = "https://welcomeeg.ca"


def _get_portal_base_url() -> str:
    """
    Returns a guaranteed absolute `https://` base URL for the newsletter portal,
    preventing empty-string environment variables (e.g. unset GitHub Secrets)
    from producing relative `/go.html` or `/portal.html` links.
    """
    raw = (os.environ.get("PUBLIC_PORTAL_URL") or "").strip().rstrip("/")
    if (
        not raw
        or not raw.startswith(("http://", "https://"))
        or "news.welcomeeg.ca" in raw.lower()
    ):
        return DEFAULT_PORTAL_BASE_URL
    return raw


def _get_tracking_base_url() -> str:
    """
    Returns a guaranteed absolute `https://` URL for the clickthrough redirector (`go.html`).
    """
    raw = (os.environ.get("TRACKING_BASE_URL") or "").strip()
    if (
        not raw
        or not raw.startswith(("http://", "https://"))
        or "news.welcomeeg.ca" in raw.lower()
    ):
        return f"{_get_portal_base_url()}/go.html"
    return raw


def normalize_destination_url(raw_url: str) -> str:
    """
    Cleans and normalizes an article/event destination URL so it is always a valid,
    absolute `https://` or `http://` URL before being embedded in the newsletter.
    """
    portal_base = _get_portal_base_url()
    cleaned = html.unescape((raw_url or "").strip())
    if not cleaned:
        return DEFAULT_MAIN_SITE_URL

    # Resolve relative paths cleanly
    if cleaned.startswith("/news/"):
        cleaned = f"{DEFAULT_MAIN_SITE_URL}{cleaned}"
    elif cleaned.startswith(("/claim", "/partner", "/admin")):
        cleaned = f"{DEFAULT_MAIN_SITE_URL}{cleaned}"
    elif cleaned.startswith("/"):
        cleaned = f"{portal_base}{cleaned}"
    elif cleaned.lower().startswith("www."):
        cleaned = f"https://{cleaned}"
    elif not cleaned.lower().startswith(("http://", "https://")):
        cleaned = f"{portal_base}/{cleaned.lstrip('/')}"

    # Fix TixHub box office URLs that end with an empty `&width=` parameter
    if "tixhub.com" in cleaned.lower() and re.search(r"[?&]width=$", cleaned, flags=re.IGNORECASE):
        cleaned = f"{cleaned}1024"

    # Normalize East Gwillimbury Public Library detail route casing
    if "calendar.georginalibrary.ca/default/detail/" in cleaned:
        cleaned = cleaned.replace(
            "calendar.georginalibrary.ca/default/detail/",
            "calendar.georginalibrary.ca/default/Detail/",
        )

    return cleaned


# Ordered placement of newsletter sections:
# 1. Active Featured Local Perks (if present)
# Followed by the 9 community categories in priority sequence:
SECTION_CONFIG = [
    ("partner_deals", "Welcome East Gwillimbury • Featured Local Perks & Partner Deals"),
    ("private_business_events", "Small Vendors, Local Venues & Private Business Events"),
    ("library_events", "East Gwillimbury Public Library • Upcoming Programs & Workshops"),
    ("upcoming_events", "Town of East Gwillimbury • Upcoming Community Events"),
    ("theatre_events", "Stephen Leacock Theatre • Upcoming Shows & Concerts"),
    ("concerts_shows", "Concerts & Shows • Local Live Music & Performances"),
    ("chamber_events", "Central York Chamber of Commerce • Business & Community Events"),
    ("eventbrite_meetup", "Eventbrite & Meetup • Local & Regional Gatherings"),
    ("past_events", "Recent & Past Community Events"),
    ("local_news", "Local News • Town Newsroom, Council & The NewmarketToday"),
]


def _build_tracked_url(
    raw_url: str,
    title: str,
    source: str,
    category: str,
    issue_iso: str,
    platform: str = "newsletter",
) -> str:
    """
    Wraps an outbound link in the Advertiser Clickthrough Tracker (/go.html).
    If platform == 'facebook', attaches social UTMs and tags the source so Facebook clickthroughs
    are logged distinctly to Supabase `link_clicks`.
    """
    tracking_base = _get_tracking_base_url()
    clean_url = normalize_destination_url(raw_url)

    if platform == "facebook":
        sep_utm = "&" if "?" in clean_url else "?"
        clean_url = f"{clean_url}{sep_utm}utm_source=facebook&utm_medium=social&utm_campaign=welcome_georgina"
        source_label = f"{source} [Facebook]"
        query_dict = {
            "u": clean_url,
            "t": title[:140],
            "s": source_label[:80],
            "c": category[:40],
            "d": issue_iso,
            "ref": "facebook",
        }
    else:
        query_dict = {
            "u": clean_url,
            "t": title[:140],
            "s": source[:80],
            "c": category[:40],
            "d": issue_iso,
        }

    params = urlencode(query_dict)
    sep = "&" if "?" in tracking_base else "?"
    return f"{tracking_base}{sep}{params}"


def _safe_text(value) -> str:
    """Plain text made safe for the newsletter HTML: scraped or submitted titles,
    summaries, source names and dates can never inject markup into the email."""
    return html.escape(html.unescape(str(value or "")), quote=False)


MONTH_MAP = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
}


def parse_event_date(date_str: str, today_date=None):
    if not date_str:
        return None
    if today_date is None:
        today_date = datetime.now().date()
    s = str(date_str).lower().strip()

    # If an explicit past year (e.g. 2024, 2025) is anywhere in the string
    m_yr = re.search(r'\b(20\d{2})\b', s)
    if m_yr:
        yr = int(m_yr.group(1))
        if yr < today_date.year:
            return datetime(yr, 1, 1).date()

    # 1. ISO format: YYYY-MM-DD
    m_iso = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', s)
    if m_iso:
        try:
            return datetime(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))).date()
        except ValueError:
            pass

    # 2. Month name + Day + optional Year: e.g. "Thu, Nov 5 2026", "October 29, 2026", "Nov 7"
    m_mdy = re.search(r'\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[,\s]+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?', s)
    if m_mdy:
        m_name = m_mdy.group(1)
        month = MONTH_MAP.get(m_name, 1)
        day = int(m_mdy.group(2))
        year = int(m_mdy.group(3)) if m_mdy.group(3) else today_date.year
        try:
            parsed = datetime(year, month, day).date()
            # No year written: "Jan 9" read in December means next January, not last January.
            if not m_mdy.group(3) and (today_date - parsed).days > 60:
                parsed = parsed.replace(year=year + 1)
            return parsed
        except ValueError:
            pass

    # 3. Month name + Year: e.g. "November 2025"
    m_my = re.search(r'\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[,\s]+(\d{4})', s)
    if m_my:
        m_name = m_my.group(1)
        month = MONTH_MAP.get(m_name, 1)
        year = int(m_my.group(2))
        try:
            return datetime(year, month, 1).date()
        except ValueError:
            pass

    return None


def sort_items_chronologically(items: List[Dict[str, Any]], anchor_date=None) -> List[Dict[str, Any]]:
    """
    Orders edition items by date, starting from the edition date (anchor_date,
    i.e. the Thursday the edition is built):
      1. items dated on/after the anchor, soonest first;
      2. items dated before the anchor, most recent first;
      3. undated items last (in their original order).
    Only the order changes — the items themselves (and their colours) are untouched.
    """
    if anchor_date is None:
        anchor_date = datetime.now().date()

    def _key(indexed):
        idx, item = indexed
        d = parse_event_date(item.get("date") or "", anchor_date) or parse_event_date(item.get("title") or "", anchor_date)
        if d is None:
            return (2, 0, idx)
        if d >= anchor_date:
            return (0, d.toordinal(), idx)
        return (1, -d.toordinal(), idx)

    return [item for _, item in sorted(enumerate(items), key=_key)]


def to_facebook_bold(text: str) -> str:
    """
    Converts alphanumeric ASCII characters to Unicode Mathematical Bold Sans-Serif
    characters (e.g. 'Tribute to Ed Sheeran' -> '𝗧𝗿𝗶𝗯𝘂𝘁𝗲 𝘁𝗼 𝗘𝗱 𝗦𝗵𝗲𝗲𝗿𝗮𝗻').
    These display natively in bold across Facebook posts, mobile feeds, and groups.
    """
    bold_chars = []
    for ch in text:
        code = ord(ch)
        if 0x41 <= code <= 0x5A:  # 'A'-'Z'
            bold_chars.append(chr(0x1D5D4 + (code - 0x41)))
        elif 0x61 <= code <= 0x7A:  # 'a'-'z'
            bold_chars.append(chr(0x1D5EE + (code - 0x61)))
        elif 0x30 <= code <= 0x39:  # '0'-'9'
            bold_chars.append(chr(0x1D7EC + (code - 0x30)))
        else:
            bold_chars.append(ch)
    return "".join(bold_chars)


FACEBOOK_SECTION_HEADERS = {
    "partner_deals": "⭐ 🎁 WELCOME GEORGINA • FEATURED LOCAL PERKS",
    "private_business_events": "🛍️ 🏪 1. SMALL VENDORS, LOCAL VENUES & PRIVATE BUSINESS EVENTS",
    "library_events": "📚 📖 2. GEORGINA PUBLIC LIBRARY • UPCOMING PROGRAMS & WORKSHOPS",
    "upcoming_events": "🏛️ 🎈 3. TOWN OF GEORGINA • UPCOMING COMMUNITY EVENTS",
    "theatre_events": "🎭 🎟️ 4. STEPHEN LEACOCK THEATRE • UPCOMING SHOWS & CONCERTS",
    "concerts_shows": "🎵 🎤 4b. CONCERTS & SHOWS • LOCAL LIVE MUSIC & PERFORMANCES",
    "chamber_events": "🤝 💼 5. GEORGINA CHAMBER OF COMMERCE • BUSINESS & COMMUNITY EVENTS",
    "eventbrite_meetup": "👥 🗓️ 6. EVENTBRITE & MEETUP • LOCAL & REGIONAL GATHERINGS",
    "past_events": "📜 ✨ 7. RECENT & PAST COMMUNITY EVENTS",
    "municipal_news": "📰 🏛️ 8. TOWN OF GEORGINA • NEWSROOM, COUNCIL & PUBLIC NOTICES",
    "news": "🌲 ⛵ 9. LOCAL JOURNALISM, TOURISM & ECONOMIC DEVELOPMENT",
}


def build_newsletter_facebook_digest(
    articles: List[Dict[str, Any]],
    edition: str = "reader",
    issue_date: str = "",
) -> str:
    """
    Compiles a high-engagement, clean plain-text digest of the newsletter
    specifically formatted for copying & pasting to Facebook pages and community groups.
    Features:
      - Left-aligned title pins (📌) at column 0
      - Native Unicode BOLD event titles (𝗧𝗿𝗶𝗯𝘂𝘁𝗲 𝘁𝗼 𝗘𝗱 𝗦𝗵𝗲𝗲𝗿𝗮𝗻)
      - Explicit skipped lines between fields and cards so Facebook never collapses paragraphs
      - Social click-through tracking URLs tagged with [Facebook] and ref=facebook
      - Trailing blank line after URLs to prevent Facebook from concatenating subsequent items
      - Clean vertical whitespace without ugly underscore / box divider lines
    """
    if not issue_date:
        issue_date = datetime.now().strftime("%B %d, %Y")
    issue_iso = datetime.now().strftime("%Y-%m-%d")

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for a in articles:
        c = a.get("category", "news")
        grouped.setdefault(c, []).append(a)

    blocks: List[str] = []
    blocks.append("🌟 WELCOME GEORGINA • COMMUNITY DIGEST 🌟")
    blocks.append(f"📅 Week of {issue_date} | Local Events, News & Exclusive Perks")
    blocks.append(
        "Here is everything happening across East Gwillimbury this week! Share with family and friends to shop local and support our community. 👇"
    )

    has_content = False
    for cat_key, default_title in SECTION_CONFIG:
        # User specification: Local News is excluded from the Facebook plain-text version
        if cat_key in ("local_news", "municipal_news", "news"):
            continue

        items = grouped.get(cat_key, [])
        if not items:
            continue
        items = sort_items_chronologically(items)
        has_content = True

        header = FACEBOOK_SECTION_HEADERS.get(cat_key, f"📌 {default_title.upper()}")
        blocks.append(f"{header}")

        for item in items:
            title = item.get("title", "").strip()
            bold_title = to_facebook_bold(title)
            source = item.get("source", "").strip()
            raw_date = (item.get("date") or "").strip()
            location = (item.get("location") or "").strip()
            summary = (item.get("summary") or "").strip()
            link = item.get("link", "https://welcomeeg.ca")

            tracked_link = _build_tracked_url(
                raw_url=link,
                title=title,
                source=source,
                category=cat_key,
                issue_iso=issue_iso,
                platform="facebook",
            )

            # Build card with explicit skipped lines so Facebook cannot collapse fields into one paragraph
            card_parts = [f"📌 {bold_title}"]
            if raw_date:
                card_parts.append(f"📅 When: {raw_date}")
            if location:
                card_parts.append(f"📍 Where: {location}")
            if source:
                card_parts.append(f"🏷️ Source: {source}")
            if summary:
                card_parts.append(f"📝 {summary}")
            # Explicit trailing newline after URL ensures Facebook link preview won't glue next title onto URL
            card_parts.append(f"🔗 Details & Tickets:\r\n{tracked_link}\r\n")

            card_block = "\r\n\r\n".join(card_parts)
            blocks.append(card_block)

    if not has_content:
        blocks.append("No active community events scheduled for this edition.")

    blocks.append(
        "📬 Want the complete edition delivered directly to your inbox every Thursday morning?\r\n"
        "👉 Subscribe free at: https://welcomeeg.ca/subscribe?utm_source=facebook&utm_medium=social"
    )
    blocks.append(
        "🛍️ Local business owners & organizers: Submit your events and sales free at https://welcomeeg.ca/events"
    )
    blocks.append(
        "#East Gwillimbury #Holland Landing #Mount Albert #Queensville #LakeSimcoe #WelcomeEG #ShopLocalGeorgina"
    )

    return "\r\n\r\n".join(blocks) + "\r\n"


def _render_corrections_banner(edition: str = "reader") -> str:
    """
    Renders an official Statement of Editorial Correction banner for the newsletter
    if any active correction targets this edition ('both' or this edition).
    """
    try:
        from src.supabase_client import fetch_active_corrections
        corrections = fetch_active_corrections(edition=edition)
    except Exception:
        corrections = []

    if not corrections:
        return ""

    banner_items = []
    for c in corrections:
        title = (c.get("title") or "Editorial Correction").strip()
        body = (c.get("correction_text") or c.get("text") or "").strip()
        pub_date = (c.get("issue_date") or c.get("created_at") or "").split("T")[0]
        banner_items.append(f"""
            <div style="margin-bottom: 12px; padding: 14px 18px; background-color: #fffbeb; border: 2px solid #f59e0b; border-left: 6px solid #d97706; border-radius: 8px; color: #78350f;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #b45309; margin-bottom: 4px;">
                    ⚖️ Official Notice • Statement of Correction
                </div>
                <div style="font-size: 15px; font-weight: 800; color: #78350f; margin-bottom: 6px;">
                    {title}
                </div>
                <p style="margin: 0 0 6px 0; font-size: 13.5px; line-height: 1.5; color: #78350f;">
                    {body}
                </p>
                <div style="font-size: 11px; color: #b45309; font-weight: 600;">
                    Published: {pub_date} | Full archive &amp; corrections policy: <a href="https://welcomeeg.ca/corrections" style="color: #b45309; font-weight: 700; text-decoration: underline;">welcomeeg.ca/corrections</a>
                </div>
            </div>
        """)

    return "".join(banner_items)
