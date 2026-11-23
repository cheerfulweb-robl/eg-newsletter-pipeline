"""
Welcome East Gwillimbury newsletter pipeline (twice weekly, rules set 2026-11-16):

- Monday edition   (`monday`):   listings happening Monday to Friday, sent Monday morning.
- Thursday edition (`thursday`): listings happening Friday to Sunday, sent Thursday morning.

Each run first crawls the tracked sources and syncs what it finds into Supabase
`vendor_events` (the live calendar), then builds the edition from the approved listings
there (src/editions.py): grouped by day, news left out (website only).
"""
import argparse
from datetime import datetime
import os
from pathlib import Path
import sys

from src.compiler import build_newsletter_facebook_digest
from src.editions import build_edition_html, edition_subject, edition_window
from src.sender import dispatch_email, dispatch_facebook_digest, send_admin_alert
from src.supabase_client import (
    edition_already_sent,
    fetch_edition_listings,
    fetch_newsletter_ads,
    mark_edition_sent,
    save_crawl_audit_log,
    save_latest_edition,
    sync_scraped_items_to_vendor_events,
)

# Archive / latest-edition keys: the Thursday edition keeps the existing "reader" key.
ARCHIVE_KEY = {"monday": "monday", "thursday": "reader"}


def _resolve_edition(cli_edition: str) -> str:
    requested = (cli_edition if cli_edition and cli_edition != "auto" else os.environ.get("NEWSLETTER_EDITION") or "").strip().lower()
    if requested in ("monday", "thursday"):
        return requested
    if requested in ("reader", "both", "vendor"):
        return "thursday"
    # auto: by the day it runs (Toronto time is behind UTC, so a 06:00 UTC run is still the same day)
    return "monday" if datetime.utcnow().weekday() in (0, 5, 6) else "thursday"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Welcome East Gwillimbury newsletter pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Build the edition and save the HTML preview; send nothing.")
    parser.add_argument("--edition", choices=["auto", "monday", "thursday", "reader", "vendor", "both"], default="auto",
                        help="monday (Mon-Fri) or thursday (Fri-Sun). auto picks by the day of the run.")
    parser.add_argument("--output", default="", help="Preview file (default: preview_<edition>.html).")
    parser.add_argument("--test-only", action="store_true",
                        help="Send ONLY to TEST_RECIPIENT; do not email subscribers or save to the public archive.")
    parser.add_argument("--test-recipient", default="", help="Email for a test-only build (overrides TEST_RECIPIENT).")
    parser.add_argument("--skip-crawl", action="store_true", help="Build from the listings already in Supabase without crawling first.")
    args = parser.parse_args()

    is_dry_run = args.dry_run or os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
    is_test_only = args.test_only or os.environ.get("TEST_ONLY", "").lower() in ("1", "true", "yes")
    skip_crawl = args.skip_crawl or os.environ.get("SKIP_CRAWL", "").lower() in ("1", "true", "yes")
    test_recipient = (args.test_recipient or os.environ.get("TEST_RECIPIENT") or "").strip()
    edition = _resolve_edition(args.edition)
    today = datetime.now().date()
    window = edition_window(edition, today)

    print(f"Welcome East Gwillimbury pipeline: {edition.upper()} edition, {window[0]} to {window[-1]}")
    if is_test_only:
        print(f"*** TEST-ONLY: sending only to {test_recipient or '(nobody - preview only)'}; archive and subscribers untouched ***")

    content = []
    # 1. Crawl tracked sources and sync to the live calendar (skipped in test runs' sync step)
    if not skip_crawl:
        from src.scraper import aggregate_content  # crawler deps are only needed when crawling
        content, crawl_audit = aggregate_content()
        print(f"Crawled {len(content)} items across {len(crawl_audit)} tracked sources.")
        save_crawl_audit_log(edition="reader", audit_data={
            "edition": edition,
            "issue_date": today.isoformat(),
            "published_at": datetime.utcnow().isoformat() + "Z",
            "total_items": len(content),
            "is_test_mode": is_test_only,
            "sources": crawl_audit,
            "items": [{k: it.get(k, "") for k in ("title", "source", "category", "link", "date", "location")} for it in content],
        })
        if not is_test_only:
            print("Syncing crawled items to vendor_events (live calendar)...")
            sync_scraped_items_to_vendor_events(content)

    # 2. Build the edition from approved listings
    rows = fetch_edition_listings(window[0].isoformat())
    ads = fetch_newsletter_ads(edition, today.isoformat())
    print(f"Loaded {len(ads)} active newsletter ad(s) for {edition.upper()} edition.")
    html_body, shown = build_edition_html(edition, rows, today, ads=ads)
    subject = edition_subject(edition, window)
    out = Path(args.output or f"preview_{edition}.html")
    out.write_text(html_body, encoding="utf-8")
    print(f"{len(rows)} approved listings loaded; {shown} in this edition. Preview: {out.resolve()}")

    if not is_test_only and not is_dry_run:
        save_latest_edition(edition=ARCHIVE_KEY[edition], subject=subject, html_content=html_body)

    # 3. Send. One send per edition and window: a re-run or a second click never mails the list again.
    sent_key = f"sent_{ARCHIVE_KEY[edition]}_{window[0].isoformat()}"
    failed = False
    if is_dry_run:
        print("Dry run: nothing sent.")
    elif shown == 0 and not is_test_only:
        print("No listings for this edition: nothing sent to subscribers.")
    else:
        try:
            if not is_test_only and edition_already_sent(sent_key):
                print(f"Already sent ({sent_key}): not sending again.")
            else:
                delivered, total = dispatch_email(
                    html_body,
                    edition="monday" if edition == "monday" else "reader",
                    is_test_only=is_test_only,
                    test_recipient=test_recipient,
                    subject=subject,
                )
                if not is_test_only and delivered:
                    mark_edition_sent(sent_key, {"delivered": delivered, "total": total,
                                                 "sent_at": datetime.utcnow().isoformat() + "Z"})
                if delivered < total:
                    failed = True
                    send_admin_alert(f"{edition.capitalize()} edition: {total - delivered} of {total} emails failed",
                                     f"Edition: {subject}\nDelivered: {delivered} of {total}.\n"
                                     "Check the GitHub Actions log for the errors. The edition is marked as sent, "
                                     "so re-running will not mail anyone again.")
                # Facebook post copy is generated on-demand from the Admin Approvals modal (not auto-emailed).
        except Exception as exc:
            failed = True
            print(f"ERROR: the {edition} edition was not sent: {exc}")
            send_admin_alert(f"{edition.capitalize()} edition was NOT sent", f"Edition: {subject}\nError: {exc}")

    print("Pipeline finished.")
    if failed:
        sys.exit(1)  # shows the run as failed in GitHub Actions


if __name__ == "__main__":
    main()
