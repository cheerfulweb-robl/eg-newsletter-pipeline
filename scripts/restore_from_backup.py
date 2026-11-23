"""Restore Supabase table data from a JSON backup snapshot.

Dry-run by default; pass --apply to actually upsert rows into the target project.

Usage:
    set SUPABASE_URL=https://YOUR_REF.supabase.co
    set SUPABASE_SERVICE_KEY=your_service_role_key
    py scripts/restore_from_backup.py path/to/supabase_data_backup.json
    py scripts/restore_from_backup.py path/to/supabase_data_backup.json --apply
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RESTORE_ORDER = [
    "user_profiles",
    "newsletter_settings",
    "directory_listings",
    "directory_listing_admin_notes",
    "business_accounts",
    "business_claims",
    "vendor_events",
    "vendor_event_admin_notes",
    "vendor_scrape_sources",
    "scraped_url_blacklist",
    "newsletter_subscribers",
    "newsletter_editions",
    "newsletter_ad_placements",
    "home_gallery",
    "press_articles",
    "search_sponsors",
    "spotlight_schedule",
    "editorial_corrections",
    "ad_orders",
    "hamper_applications",
    "hamper_offers",
    "hamper_coupons",
    "wallets",
    "redemptions",
    "click_monthly_archives",
    "link_clicks",
]

ON_CONFLICT = {
    "newsletter_settings": "setting_key",
}


def upsert_batch(url: str, key: str, table: str, rows: list[dict]) -> None:
    conflict_col = ON_CONFLICT.get(table, "id")
    endpoint = f"{url}/rest/v1/{urllib.parse.quote(table)}?on_conflict={urllib.parse.quote(conflict_col)}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    req = urllib.request.Request(endpoint, data=json.dumps(rows).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        resp.read()


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore Supabase JSON backup")
    parser.add_argument("backup_json", help="Path to supabase_data_backup.json")
    parser.add_argument("--apply", action="store_true", help="Perform live upserts (default is dry-run)")
    parser.add_argument("--tables", nargs="*", help="Optional subset of tables to restore")
    args = parser.parse_args()

    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if args.apply and (not url or not key):
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY before using --apply.", file=sys.stderr)
        return 1

    data = json.loads(Path(args.backup_json).read_text(encoding="utf-8"))
    tables = data.get("tables", {})
    print(f"Snapshot exported_at: {data.get('exported_at', 'unknown')} | mode: {'APPLY' if args.apply else 'DRY-RUN'}")

    selected = set(args.tables) if args.tables else None
    ordered = [t for t in RESTORE_ORDER if t in tables] + [t for t in tables if t not in RESTORE_ORDER]

    for tbl in ordered:
        if selected and tbl not in selected:
            continue
        rows = tables.get(tbl) or []
        if not rows:
            print(f"  {tbl}: 0 rows (skipped)")
            continue
        if not args.apply:
            print(f"  {tbl}: {len(rows)} rows ready")
            continue
        for i in range(0, len(rows), 250):
            batch = rows[i : i + 250]
            try:
                upsert_batch(url, key, tbl, batch)
            except urllib.error.HTTPError as exc:
                err_body = exc.read().decode("utf-8", errors="ignore")
                print(f"  ERROR {tbl} batch {i}: HTTP {exc.code} {err_body}", file=sys.stderr)
                return 1
        print(f"  {tbl}: restored {len(rows)} rows")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
