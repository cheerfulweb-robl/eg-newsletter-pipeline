import re
"""
Unified Supabase REST (PostgREST) client for the combined Welcome East Gwillimbury ecosystem
(welcomeeg.ca + news.welcomeeg.ca, Project ID: cyxomkhydsmttefanalx).

Connects to:
- `partners`: Live Welcome East Gwillimbury Business Offers & Sponsors (`status IN ('Approved', 'is_example')`)
- `vendor_events`: Admin-approved vendor event & news submissions (`status = 'approved'`)
- `vendor_scrape_sources`: Admin-approved vendor website auto-scrape URLs (`status = 'approved'`)
- `newsletter_subscribers`: newsletter sign-ups; only confirmed (`active`) rows are mailed
- `link_clicks` / `advertiser_click_summary`: Clickthrough analytics for Advertiser & Vendor reporting
"""
from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urlparse
import requests

DEFAULT_SUPABASE_URL = "https://cyxomkhydsmttefanalx.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_o21_dFCXCHW2fvVJNS45Tw_sFVcprqw"


def _get_supabase_config() -> Dict[str, Any]:
    url = (os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL).strip().rstrip("/")
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or DEFAULT_SUPABASE_ANON_KEY
    ).strip()

    return {
        "url": url,
        "headers": {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    }


def fetch_approved_partner_deals(limit: int = 12) -> List[Dict[str, str]]:
    """
    Fetches live Approved Partner Offers from the Welcome East Gwillimbury `partners` table
    so the Thursday Reader Newsletter includes a 'Featured Local Perks & Partner Deals' section.
    """
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/partners"
    params = {
        "select": "id,business_name,offer_details,category,location,target_audience,tier,business_description,status",
        "status": "in.(Approved,is_example)",
        "order": "created_at.desc",
        "limit": str(limit),
    }

    deals: List[Dict[str, str]] = []
    try:
        resp = requests.get(endpoint, headers=cfg["headers"], params=params, timeout=12)
        if resp.status_code != 200:
            return []
        rows = resp.json()
        for row in rows:
            if not isinstance(row, dict):
                continue
            business = " ".join((row.get("business_name") or "").split())
            offer = " ".join((row.get("offer_details") or "").split())
            if not business or not offer:
                continue

            cat = " ".join((row.get("category") or "Local Business").split())
            loc = " ".join((row.get("location") or "East Gwillimbury, ON").split())
            tier = " ".join((row.get("tier") or "Partner").split())
            desc = " ".join((row.get("business_description") or "").split())
            summary_txt = desc[:220] + "..." if len(desc) > 220 else (
                desc or f"Claim this exclusive {cat} perk from {business} in {loc} on Welcome East Gwillimbury."
            )

            deals.append({
                "title": f"{business}: {offer}",
                "link": "https://welcomeeg.ca/",
                "source": f"Welcome East Gwillimbury • {cat} ({tier})",
                "date": "Active Local Perk",
                "location": f"{loc}, ON",
                "category": "partner_deals",
                "summary": summary_txt,
            })
    except Exception as exc:
        print(f"Warning: Supabase partners fetch skipped: {exc}")

    return deals


def fetch_approved_vendor_events() -> List[Dict[str, str]]:
    """
    Fetches manually submitted vendor events from Supabase where status = 'approved'
    and expires_after is either null or >= today.
    """
    cfg = _get_supabase_config()
    today_iso = datetime.now().strftime("%Y-%m-%d")
    endpoint = f"{cfg['url']}/rest/v1/vendor_events"
    params = {
        "select": "id,business_name,title,event_date_label,event_start_date,expires_after,location,link,summary,category",
        "status": "eq.approved",
        "order": "event_start_date.asc.nullslast,created_at.desc",
        "limit": "30",
    }

    events: List[Dict[str, str]] = []
    try:
        resp = requests.get(endpoint, headers=cfg["headers"], params=params, timeout=12)
        if resp.status_code != 200:
            return []
        rows = resp.json()
        for row in rows:
            if not isinstance(row, dict):
                continue
            expires = (row.get("expires_after") or "").strip()
            if expires and expires < today_iso:
                continue

            title = " ".join((row.get("title") or "").split())
            if not title:
                continue

            business = " ".join((row.get("business_name") or "East Gwillimbury Vendor").split())
            events.append({
                "title": title,
                "link": (row.get("link") or "https://welcomeeg.ca/news").strip(),
                "source": f"{business} • Verified Local Vendor",
                "date": (row.get("event_date_label") or "Upcoming").strip(),
                "location": (row.get("location") or "East Gwillimbury, ON").strip(),
                "category": (row.get("category") or "private_business_events").strip(),
                "summary": " ".join((row.get("summary") or "").split()),
            })
    except Exception as exc:
        print(f"Warning: Supabase vendor_events fetch skipped: {exc}")

    return events


_GEORGINA_LOCATION_RE = re.compile(
    r"\b(?:east\s+gwillimbury|holland\s+landing|mount\s+albert|queensville|sharon|"
    r"river\s+drive\s+park|river\s+drive|holt|franklin|brown\s+hill|ravenshoe)\b",
    re.I,
)
_NEIGHBOUR_LOCATION_RE = re.compile(
    r"\b(?:bradford\s+west\s+gwillimbury|whitchurch[-\s]stouffville|georgina|keswick|sutton|"
    r"pefferlaw|jackson'?s?\s+point|roches?\s+point|port\s+bolster|willow\s+beach|island\s+grove|"
    r"udora|baldwin|belhaven|virginia|egypt|richmond\s+hill|stouffville|port\s+perry|"
    r"cannington|sunderland|newmarket|king\s+city|schomberg|beaverton|innisfil|bradford|"
    r"uxbridge|markham|vaughan|orillia|aurora|barrie|zephyr|toronto)\b",
    re.I,
)


def _tag_out_of_area_location(raw_location: str) -> str:
    """Prefix neighbouring-town addresses with 'Out of Area: ' unless East Gwillimbury appears last."""
    loc = (raw_location or "East Gwillimbury, ON").strip()
    if not loc or "out of area" in loc.lower():
        return loc or "East Gwillimbury, ON"
    last_georgina = max((m.start() for m in _GEORGINA_LOCATION_RE.finditer(loc)), default=-1)
    last_neighbour = max((m.start() for m in _NEIGHBOUR_LOCATION_RE.finditer(loc)), default=-1)
    if last_neighbour > last_georgina:
        return f"Out of Area: {loc}"
    return loc


def sync_scraped_items_to_vendor_events(items: List[Dict[str, Any]]) -> int:
    """
    Upserts / syncs all scraped community events, vendor events, and store sales/deals
    into the Supabase `vendor_events` table (status: 'approved') so they immediately appear
    on the Welcome East Gwillimbury Live Event Calendar (welcomeeg.ca/events) and Sales page.
    """
    cfg = _get_supabase_config()
    if not cfg.get("headers", {}).get("apikey"):
        return 0

    endpoint = f"{cfg['url']}/rest/v1/vendor_events"
    
    from src.deduplication import is_fuzzy_duplicate

    # Duplicate check against every listing from the last 60 days on (paged). If that read fails,
    # skip the sync: inserting without it would re-add everything as approved duplicates.
    from datetime import date, timedelta
    since = (date.today() - timedelta(days=60)).isoformat()
    try:
        rows = _get_all_rows(cfg, "vendor_events", {
            "select": "id,title,business_name,event_date_label,event_start_date,expires_after,location,status",
            "or": f"(event_start_date.is.null,event_start_date.gte.{since})",
            "order": "id.asc",
        })
    except Exception as exc:
        print(f"Warning: crawl sync skipped, could not load existing listings for the duplicate check: {exc}")
        return 0
    existing_records: List[Dict[str, str]] = [
        {
            "id": r.get("id"),
            "title": r["title"].strip(),
            "business_name": (r.get("business_name") or "").strip(),
            "event_date_label": (r.get("event_date_label") or "").strip(),
            "event_start_date": (r.get("event_start_date") or "").strip(),
            "expires_after": (r.get("expires_after") or "").strip(),
            "location": (r.get("location") or "").strip(),
            "status": (r.get("status") or "").strip(),
        }
        for r in rows if r.get("title")
    ]
    by_biz_title = {
        ((r["business_name"] or "").lower(), r["title"].lower()): r
        for r in existing_records if r.get("id")
    }

    synced_count = 0
    records_to_insert = []
    
    for it in items:
        raw_title = (it.get("title") or "").strip()
        if not raw_title:
            continue
        
        category = (it.get("category") or "").lower()
        source = (it.get("source") or "").strip()
        is_news = category in ("local_news", "municipal_news", "news")
        is_sale = not is_news and ("deal" in category or "sale" in category or "deal" in source.lower() or "sale" in raw_title.lower())
        
        # Sales are marked by category, never by a "[Sale]" prefix in the title
        title = raw_title[len("[Sale]"):].strip() if raw_title.startswith("[Sale]") else raw_title
        date_label = (it.get("date") or "Upcoming").strip()
        
        # RapidFuzz fuzzy deduplication against existing database items
        is_dup, matched_item, score = is_fuzzy_duplicate(title, date_label, existing_records, threshold=85.0)
        if is_dup and matched_item:
            continue
            
        from src.compiler import parse_event_date
        parsed_dt = parse_event_date(it.get("date") or "")
        if not parsed_dt and is_news:
            # Lock undated local_news / news stories to the date they were added to the news calendar
            parsed_dt = datetime.now().date()
            if not it.get("date"):
                date_label = parsed_dt.strftime("%b %d, %Y")
        start_date_iso = parsed_dt.strftime("%Y-%m-%d") if parsed_dt else None
        if not start_date_iso:
            # No real date on event/sale: leave it out of the calendar entirely
            continue
        
        biz_name = source.split("•")[0].strip() or "East Gwillimbury Community"
        
        cat_val = "special_sale" if is_sale else (it.get("category") or "private_business_events").strip()
        expires_iso = (parsed_dt + timedelta(days=366)).strftime("%Y-%m-%d") if is_news else start_date_iso
        records_to_insert.append({
            "business_name": biz_name,
            "submitter_email": "crawler@welcomeeg.ca",
            "title": title,
            "event_date_label": date_label,
            "event_start_date": start_date_iso,
            "expires_after": expires_iso,
            "location": _tag_out_of_area_location(it.get("location") or "East Gwillimbury, ON"),
            "link": (it.get("link") or "https://welcomeeg.ca/events").strip(),
            "summary": (it.get("summary") or "").strip()[:500],
            "category": cat_val,
            "status": "approved",
        })
        existing_records.append({"title": title, "event_date_label": date_label})

    if not records_to_insert:
        return 0

    # How sure we are each crawled listing was read correctly (staff see low scores first)
    from src.confidence import score_listing
    LOW_CONFIDENCE_THRESHOLD = 75
    filtered_inserts = []
    for rec in records_to_insert:
        conf, notes = score_listing(rec)
        rec["data_confidence"] = conf
        rec["confidence_notes"] = "; ".join(notes) if notes else "crawler: all checks passed"
        existing_match = by_biz_title.get((rec["business_name"].lower(), rec["title"].lower()))
        if existing_match:
            dates_changed = (
                existing_match.get("event_start_date") != (rec.get("event_start_date") or "")
                or existing_match.get("expires_after") != (rec.get("expires_after") or "")
                or existing_match.get("event_date_label") != (rec.get("event_date_label") or "")
            )
            generic_locs = ("", "east gwillimbury", "east gwillimbury, on")
            existing_loc_low = (existing_match.get("location") or "").strip().lower()
            new_loc = (rec.get("location") or "").strip()
            loc_upgraded = existing_loc_low in generic_locs and new_loc.lower() not in generic_locs
            if (dates_changed and conf >= LOW_CONFIDENCE_THRESHOLD) or loc_upgraded:
                patch_body: Dict[str, Any] = {
                    "summary": rec["summary"],
                    "data_confidence": conf,
                    "confidence_notes": rec["confidence_notes"],
                }
                if dates_changed and conf >= LOW_CONFIDENCE_THRESHOLD:
                    patch_body.update({
                        "event_date_label": rec["event_date_label"],
                        "event_start_date": rec["event_start_date"],
                        "expires_after": rec["expires_after"],
                    })
                if loc_upgraded:
                    patch_body["location"] = new_loc
                try:
                    requests.patch(
                        f"{endpoint}?id=eq.{existing_match['id']}",
                        headers=dict(cfg["headers"], **{"Prefer": "return=minimal"}),
                        json=patch_body,
                        timeout=10,
                    )
                    synced_count += 1
                except Exception as exc:
                    print(f"Warning: Failed to update {rec['title']}: {exc}")
            continue
        if conf < LOW_CONFIDENCE_THRESHOLD:
            rec["status"] = "pending"
        filtered_inserts.append(rec)
    records_to_insert = filtered_inserts

    chunk_size = 20
    for i in range(0, len(records_to_insert), chunk_size):
        chunk = records_to_insert[i:i + chunk_size]
        try:
            ins_res = requests.post(
                endpoint,
                headers=dict(cfg["headers"], **{"Prefer": "return=minimal"}),
                json=chunk,
                timeout=12
            )
            if ins_res.status_code == 400 and "data_confidence" in ins_res.text:
                # Database not updated yet (migration 20261130): save without the scores
                chunk = [{k: v for k, v in r.items() if k not in ("data_confidence", "confidence_notes")} for r in chunk]
                ins_res = requests.post(
                    endpoint,
                    headers=dict(cfg["headers"], **{"Prefer": "return=minimal"}),
                    json=chunk,
                    timeout=20,
                )
            if ins_res.status_code in (200, 201, 204):
                synced_count += len(chunk)
            else:
                print(f"Warning: vendor_events batch insert returned HTTP {ins_res.status_code}: {ins_res.text[:120]}")
        except Exception as exc:
            print(f"Warning: Failed to insert vendor_events chunk: {exc}")

    print(f"Successfully synced {synced_count} scraped events & deals to vendor_events calendar!")
    return synced_count


def fetch_approved_scrape_sources() -> List[Dict[str, str]]:
    """
    Fetches vendor-submitted webpage URLs from Supabase where status = 'approved'
    for automatic recurring event scraping.
    """
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/vendor_scrape_sources"
    params = {
        "select": "id,business_name,scrape_url,default_location",
        "status": "eq.approved",
        "order": "created_at.asc",
        "limit": "50",
    }

    sources: List[Dict[str, str]] = []
    try:
        resp = requests.get(endpoint, headers=cfg["headers"], params=params, timeout=12)
        if resp.status_code != 200:
            return []
        rows = resp.json()
        for row in rows:
            if not isinstance(row, dict):
                continue
            raw_scrape_url = (row.get("scrape_url") or "").strip()
            if not raw_scrape_url:
                continue
            # Support multiple URLs per entry (newline or comma-separated, same domain)
            multi_urls = [u.strip() for u in re.split(r"[\r\n,]+", raw_scrape_url) if u.strip() and u.strip().startswith("http")]
            if not multi_urls and raw_scrape_url:
                multi_urls = [raw_scrape_url]

            for u in multi_urls:
                sources.append({
                    "id": str(row.get("id") or ""),
                    "business_name": " ".join((row.get("business_name") or "East Gwillimbury Vendor").split()),
                    "scrape_url": u,
                    "default_location": " ".join((row.get("default_location") or "East Gwillimbury, ON").split()),
                })
    except Exception as exc:
        print(f"Warning: Supabase vendor_scrape_sources fetch skipped: {exc}")

    return sources


def mark_source_scraped(source_id: str) -> None:
    """Updates last_scraped_at timestamp in Supabase when using a service key."""
    if not source_id:
        return
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/vendor_scrape_sources?id=eq.{source_id}"
    try:
        requests.patch(
            endpoint,
            headers=cfg["headers"],
            json={"last_scraped_at": datetime.utcnow().isoformat() + "Z"},
            timeout=8,
        )
    except Exception:
        pass


def _extract_clean_domain(raw_url_or_domain: str) -> str:
    """Extracts a normalized lowercase domain (without leading www.) from a URL or domain string."""
    val = (raw_url_or_domain or "").strip().lower()
    if not val:
        return ""
    if "://" not in val:
        val = "https://" + val
    try:
        parsed = urlparse(val)
        host = (parsed.netloc or parsed.path.split("/")[0]).strip().lower()
        if ":" in host:
            host = host.split(":", 1)[0]
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def _normalize_comparable_url(raw_url: str) -> str:
    """Normalizes a URL to `domain/path?query` (lowercase host, no scheme, no www., no trailing slash)."""
    val = (raw_url or "").strip()
    if not val:
        return ""
    if "://" not in val:
        val = "https://" + val
    try:
        parsed = urlparse(val)
        host = (parsed.netloc or "").strip().lower()
        if ":" in host:
            host = host.split(":", 1)[0]
        if host.startswith("www."):
            host = host[4:]
        path = (parsed.path or "").rstrip("/")
        query = f"?{parsed.query}" if parsed.query else ""
        return f"{host}{path}{query}".lower()
    except Exception:
        return val.lower().rstrip("/")


def fetch_url_blacklist() -> List[Dict[str, Any]]:
    """
    Fetches active blacklisted websites and specific page URLs from
    `public.scraped_url_blacklist` in Supabase, supplemented by optional local
    `data/url_blacklist.json`.
    """
    entries: List[Dict[str, Any]] = []
    seen_rules = set()

    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/scraped_url_blacklist"
    params = {
        "select": "id,target_url,match_type,source_label,reason,active",
        "active": "eq.true",
        "order": "created_at.desc",
        "limit": "500",
    }
    try:
        resp = requests.get(endpoint, headers=cfg["headers"], params=params, timeout=10)
        if resp.status_code == 200:
            for row in resp.json():
                if not isinstance(row, dict) or row.get("active") is False:
                    continue
                t_url = (row.get("target_url") or "").strip()
                t_kw = (row.get("title_keyword") or row.get("title") or "").strip()
                r_key = f"{t_url.lower()}::{t_kw.lower()}"
                if not t_url or r_key in seen_rules:
                    continue
                seen_rules.add(r_key)
                entries.append({
                    "target_url": t_url,
                    "title_keyword": t_kw,
                    "match_type": (row.get("match_type") or "exact_url").strip().lower(),
                    "source_label": (row.get("source_label") or "").strip(),
                    "reason": (row.get("reason") or "").strip(),
                })
    except Exception as exc:
        print(f"Warning: Supabase scraped_url_blacklist fetch skipped: {exc}")

    local_path = Path(__file__).resolve().parent.parent / "data" / "url_blacklist.json"
    if local_path.exists():
        try:
            local_items = json.loads(local_path.read_text(encoding="utf-8"))
            if isinstance(local_items, list):
                for item in local_items:
                    if not isinstance(item, dict) or item.get("active", True) is False:
                        continue
                    t_url = (item.get("target_url") or "").strip()
                    t_kw = (item.get("title_keyword") or item.get("title") or "").strip()
                    r_key = f"{t_url.lower()}::{t_kw.lower()}"
                    if not t_url or r_key in seen_rules:
                        continue
                    seen_rules.add(r_key)
                    entries.append({
                        "target_url": t_url,
                        "title_keyword": t_kw,
                        "match_type": (item.get("match_type") or "exact_url").strip().lower(),
                        "source_label": (item.get("source_label") or "").strip(),
                        "reason": (item.get("reason") or "").strip(),
                    })
        except Exception:
            pass

    return entries


def is_url_blacklisted(
    url: str,
    blacklist: List[Dict[str, Any]],
    source_url: str = "",
    title: str = "",
) -> bool:
    """
    Returns True if either `url` (the article/event destination URL) or `source_url`
    (the parent feed/calendar URL being scraped) matches any active entry in `blacklist`.
    If the blacklist rule specifies a `title_keyword`, it also verifies that `title`
    contains the keyword.
    Supports:
      - `match_type == 'domain'`: blocks the entire website domain and all subdomains/pages
      - `match_type == 'prefix'`: blocks any URL starting with the normalized prefix
      - `match_type == 'exact_url'`: blocks that exact page/feed URL (or domain if bare domain given)
      - `title_keyword`: if present on a rule, matches when title contains this keyword
    """
    if not blacklist:
        return False

    title_clean = (title or "").strip().lower()

    # First check pure title-based blacklist rules (rules with empty target_url or wildcard "*")
    for rule in blacklist:
        rule_kw = (rule.get("title_keyword") or "").strip().lower()
        rule_target = (rule.get("target_url") or "").strip()
        if rule_kw and title_clean and rule_kw in title_clean:
            if not rule_target or rule_target == "*":
                return True

    candidates = [c for c in (url, source_url) if c and c.strip()]
    if not candidates:
        return False

    for candidate in candidates:
        cand_domain = _extract_clean_domain(candidate)
        cand_norm = _normalize_comparable_url(candidate)

        for rule in blacklist:
            target_raw = (rule.get("target_url") or "").strip()
            if not target_raw:
                continue
            rule_kw = (rule.get("title_keyword") or "").strip().lower()
            if rule_kw and (not title_clean or rule_kw not in title_clean):
                # A title-scoped rule must not block an entire feed/source URL when no title is being checked
                continue

            m_type = (rule.get("match_type") or "exact_url").strip().lower()
            rule_domain = _extract_clean_domain(target_raw)
            rule_norm = _normalize_comparable_url(target_raw)

            if m_type == "domain":
                if rule_domain and cand_domain and (
                    cand_domain == rule_domain or cand_domain.endswith("." + rule_domain)
                ):
                    return True
            elif m_type == "prefix":
                if rule_norm and cand_norm and cand_norm.startswith(rule_norm):
                    return True
            else:
                # exact_url match
                if rule_norm and cand_norm and cand_norm == rule_norm:
                    return True

    return False
    candidates = [c for c in (url, source_url) if c and c.strip()]
    if not candidates:
        return False

    for candidate in candidates:
        cand_domain = _extract_clean_domain(candidate)
        cand_norm = _normalize_comparable_url(candidate)

        for rule in blacklist:
            target_raw = (rule.get("target_url") or "").strip()
            if not target_raw:
                continue
            m_type = (rule.get("match_type") or "exact_url").strip().lower()
            rule_domain = _extract_clean_domain(target_raw)
            rule_norm = _normalize_comparable_url(target_raw)

            if m_type == "domain":
                if rule_domain and cand_domain and (
                    cand_domain == rule_domain or cand_domain.endswith("." + rule_domain)
                ):
                    return True
            elif m_type == "prefix":
                if rule_norm and cand_norm and cand_norm.startswith(rule_norm):
                    return True
            else:
                # exact_url match: if the rule is a bare domain with no path (e.g. "briars.ca"),
                # only match exact URL or if candidate is also the root URL; if exact URL matches, block it.
                if rule_norm and cand_norm and cand_norm == rule_norm:
                    return True

    return False


def save_crawl_audit_log(edition: str, audit_data: Dict[str, Any]) -> None:
    """
    Saves the structured scrape crawl audit report into `public.newsletter_settings`
    under setting_key = 'crawl_audit_{edition}' so the Verification / Audit page
    can display crawl health, source statuses, timestamps, and item counts in real time.
    """
    if edition not in ("reader", "vendor"):
        return
    key = f"crawl_audit_{edition}"
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/rpc/save_newsletter_setting"
    try:
        requests.post(
            endpoint,
            headers=cfg["headers"],
            json={
                "key_input": key,
                "value_input": audit_data,
            },
            timeout=15,
        )
    except Exception as exc:
        print(f"Warning: Could not persist crawl audit log for {edition} to Supabase: {exc}")


def edition_already_sent(key: str) -> bool:
    """True when the "sent" marker for this edition and window exists (newsletter_settings).
    Raises if it cannot be checked, so a run never risks a second send to everyone."""
    cfg = _get_supabase_config()
    resp = requests.get(
        f"{cfg['url']}/rest/v1/newsletter_settings",
        headers=cfg["headers"],
        params={"select": "setting_key", "setting_key": f"eq.{key}"},
        timeout=15,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Could not check whether {key} was already sent (HTTP {resp.status_code}): {resp.text[:200]}")
    return bool(resp.json())


def mark_edition_sent(key: str, info: Dict[str, Any]) -> None:
    cfg = _get_supabase_config()
    resp = requests.post(
        f"{cfg['url']}/rest/v1/rpc/save_newsletter_setting",
        headers=cfg["headers"],
        json={"key_input": key, "value_input": info},
        timeout=15,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Could not save the sent marker {key} (HTTP {resp.status_code}): {resp.text[:200]}")


def save_latest_edition(edition: str, subject: str, html_content: str) -> None:
    """
    Persists the latest compiled newsletter HTML in Supabase (`public.newsletter_editions`)
    so new subscribers immediately receive the latest edition upon signing up.
    """
    # "reader" = Thursday edition (Friday to Sunday), "monday" = Monday edition (Monday to Friday).
    if edition not in ("reader", "vendor", "monday") or not html_content:
        return
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/rpc/save_newsletter_edition"
    try:
        requests.post(
            endpoint,
            headers=cfg["headers"],
            json={
                "edition_input": edition,
                "subject_input": subject,
                "html_input": html_content,
            },
            timeout=15,
        )
    except Exception as exc:
        print(f"Warning: Could not persist latest {edition} edition to Supabase: {exc}")


def fetch_edition_listings(window_start: str) -> List[Dict[str, Any]]:
    """Approved listings that can still happen on or after `window_start` (YYYY-MM-DD),
    with the structured date columns the twice-weekly editions need (src/editions.py)."""
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/vendor_events"
    rows: List[Dict[str, Any]] = []
    page = 0
    while True:
        params = {
            "select": "id,slug,title,business_name,category,status,event_date_label,event_start_date,"
                      "expires_after,date_type,recurrence_rule,location,summary,price_text,link",
            "status": "eq.approved",
            "or": f"(expires_after.is.null,expires_after.gte.{window_start})",
            "order": "event_start_date.asc.nullslast,created_at.desc",
        }
        headers = dict(cfg["headers"], Range=f"{page * 1000}-{page * 1000 + 999}")
        try:
            resp = requests.get(endpoint, headers=headers, params=params, timeout=20)
        except Exception as exc:
            print(f"Warning: could not load listings for the edition: {exc}")
            break
        if resp.status_code not in (200, 206):
            print(f"Warning: could not load listings for the edition (HTTP {resp.status_code}): {resp.text[:200]}")
            break
        if not (resp.text or "").strip():
            print(f"Warning: empty response from {endpoint} (HTTP {resp.status_code}) — check SUPABASE_URL secret.")
            break
        batch = resp.json() or []
        rows.extend(r for r in batch if isinstance(r, dict))
        if len(batch) < 1000:
            break
        page += 1
    return rows


def _get_all_rows(cfg: Dict[str, Any], table: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
    """Every row matching params, 1000 at a time (the API returns at most 1000 per request).
    Raises on any failure so a send never goes ahead on a partial or empty list."""
    rows: List[Dict[str, Any]] = []
    page = 0
    while True:
        headers = dict(cfg["headers"], Range=f"{page * 1000}-{page * 1000 + 999}")
        resp = requests.get(f"{cfg['url']}/rest/v1/{table}", headers=headers, params=params, timeout=20)
        if resp.status_code not in (200, 206):
            raise RuntimeError(f"Could not load {table} (HTTP {resp.status_code}): {resp.text[:200]}")
        batch = resp.json() or []
        rows.extend(r for r in batch if isinstance(r, dict))
        if len(batch) < 1000:
            return rows
        page += 1


def fetch_active_subscribers(edition: str = "reader") -> List[Dict[str, str]]:
    """Confirmed subscribers (newsletter_subscribers, status 'active' = double opt-in) who want
    this edition: wants_monday for "monday", wants_thursday otherwise. No other table is mailed
    (CASL). Raises if the list cannot be loaded."""
    cfg = _get_supabase_config()
    rows = _get_all_rows(cfg, "newsletter_subscribers", {
        "select": "email,first_name,community_area,unsubscribe_token",
        "status": "eq.active",
        "audience_type": "in.(reader,both)",
        ("wants_monday" if edition == "monday" else "wants_thursday"): "eq.true",
        "order": "id.asc",
    })
    recipients: Dict[str, Dict[str, str]] = {}
    for row in rows:
        email = (row.get("email") or "").strip()
        low = email.lower()
        if "@" not in email or low in recipients or low in ("test@test.com", "example@example.com"):
            continue
        recipients[low] = {
            "email": email,
            "first_name": (row.get("first_name") or "").strip(),
            "community_area": (row.get("community_area") or "All East Gwillimbury").strip(),
            "unsubscribe_token": str(row.get("unsubscribe_token") or "").strip(),
        }
    _fill_unsubscribe_tokens(cfg, recipients)
    return list(recipients.values())


def _fill_unsubscribe_tokens(cfg: Dict[str, Any], recipients: Dict[str, Dict[str, str]]) -> None:
    """Give every recipient without a subscriber token a one-click unsubscribe token (CASL).
    Tokens come from wg_unsubscribe_tokens_for (migration 20261206). On failure the link falls
    back to "manage" and the unsubscribe page tells the reader how to contact us."""
    missing = [k for k, r in recipients.items() if not r.get("unsubscribe_token")]
    for i in range(0, len(missing), 500):
        try:
            resp = requests.post(
                f"{cfg['url']}/rest/v1/rpc/wg_unsubscribe_tokens_for",
                headers=cfg["headers"],
                json={"emails_input": missing[i:i + 500]},
                timeout=15,
            )
            tokens = resp.json() if resp.status_code == 200 else {}
            if not isinstance(tokens, dict):
                tokens = {}
            for email, token in tokens.items():
                if email in recipients and token:
                    recipients[email]["unsubscribe_token"] = str(token)
            if resp.status_code != 200:
                print(f"Warning: unsubscribe token lookup returned {resp.status_code}: {resp.text[:200]}")
        except Exception as exc:
            print(f"Warning: unsubscribe token lookup failed: {exc}")


def fetch_active_corrections(edition: str = "reader") -> List[Dict[str, Any]]:
    """
    Fetches active Statements of Correction from Supabase table `editorial_corrections`
    or local fallback `data/editorial_corrections.json`.
    Filters for corrections targeting this edition ('both', 'all', or edition),
    excluding 'website_only'.
    """
    corrections: List[Dict[str, Any]] = []
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/editorial_corrections"
    params = {
        "select": "id,title,correction_text,issue_date,edition_target,status,created_at",
        "status": "eq.active",
        "order": "created_at.desc",
        "limit": "20",
    }
    try:
        resp = requests.get(endpoint, headers=cfg["headers"], params=params, timeout=10)
        if resp.status_code == 200:
            for row in resp.json():
                target = (row.get("edition_target") or "both").strip().lower()
                if target in ("both", "all", edition.lower()) and target != "website_only":
                    corrections.append(row)
    except Exception:
        pass

    local_path = Path(__file__).resolve().parent.parent / "data" / "editorial_corrections.json"
    if local_path.exists():
        try:
            local_items = json.loads(local_path.read_text(encoding="utf-8"))
            if isinstance(local_items, list):
                seen_ids = {str(c.get("id")) for c in corrections if c.get("id")}
                for item in local_items:
                    if not isinstance(item, dict) or item.get("status") != "active":
                        continue
                    if str(item.get("id")) in seen_ids:
                        continue
                    target = (item.get("edition_target") or "both").strip().lower()
                    if target in ("both", "all", edition.lower()) and target != "website_only":
                        corrections.append(item)
        except Exception:
            pass

    return corrections


def fetch_newsletter_ads(edition: str, today_iso: str) -> List[Dict[str, Any]]:
    """
    Fetches active positional sponsored ads from `public.newsletter_ad_placements`
    for the given edition ('monday' or 'thursday') and date.
    """
    ed = (edition or "thursday").strip().lower()
    if ed not in ("monday", "thursday"):
        ed = "thursday"
    cfg = _get_supabase_config()
    endpoint = f"{cfg['url']}/rest/v1/newsletter_ad_placements"
    params = {
        "select": "id,sponsor_name,headline,body_text,image_url,cta_label,target_type,target_url,edition,insert_after_index,sub_order,start_date,end_date,is_complimentary,active",
        "active": "eq.true",
        "order": "insert_after_index.asc,sub_order.asc,created_at.asc",
        "limit": "100",
    }
    ads: List[Dict[str, Any]] = []
    try:
        resp = requests.get(endpoint, headers=cfg["headers"], params=params, timeout=10)
        if resp.status_code == 200 and isinstance(resp.json(), list):
            for row in resp.json():
                row_ed = (row.get("edition") or "both").strip().lower()
                if row_ed not in ("both", ed):
                    continue
                s_date = (row.get("start_date") or "")[:10]
                e_date = (row.get("end_date") or "")[:10]
                if s_date and s_date > today_iso:
                    continue
                if e_date and e_date < today_iso:
                    continue
                ads.append(row)
    except Exception:
        pass
    return ads
