"""CLI entrypoint for automated 6x/day Facebook Page posting."""
import argparse
import os
import sys

from src.facebook_poster import pick_candidate, publish_to_facebook


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Auto-post Welcome community content to Facebook Page")
    parser.add_argument(
        "--slot",
        choices=["auto", "morning", "midday", "afternoon"],
        default=os.environ.get("FB_POST_SLOT", "auto"),
        help="Time-of-day slot (auto picks by Toronto local hour).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Select and print the post without calling Facebook or logging to Supabase.",
    )
    args = parser.parse_args()

    dry_run = args.dry_run or os.environ.get("DRY_RUN", "").strip().lower() in ("1", "true", "yes")
    candidate = pick_candidate(slot=args.slot, skip_recent_guard=dry_run)
    if candidate is None:
        print("No eligible non-expired candidate found for this slot.")
        return 0

    publish_to_facebook(candidate, dry_run=dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
