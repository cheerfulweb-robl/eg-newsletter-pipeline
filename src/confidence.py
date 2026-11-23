"""
Confidence that a crawled listing was read correctly (0-100).

80+ high, 60-79 medium, below 60 low (shown to staff for a manual check).
The staff page uses the same rules (wgConfidence in website/staff/admin-approvals.html)
for listings that have no stored score. Keep the two in sync.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], start=1)}
_MONTH_RE = re.compile(
    r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})\b"
    r"|\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b", re.I)
_GENERIC_PLACES = {"", "georgina, on", "georgina", "online", "tbd", "tba", "various locations", "out of area"}


def _month_num(word: str) -> int:
    w = word.lower()[:3]
    for name, n in _MONTHS.items():
        if name.startswith(w):
            return n
    return 0


def _label_month_day(label: str) -> Optional[Tuple[int, int]]:
    m = _MONTH_RE.search(label or "")
    if not m:
        return None
    if m.group(1):
        return _month_num(m.group(1)), int(m.group(2))
    return _month_num(m.group(4)), int(m.group(3))


def _to_date(value) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def score_listing(item: Dict, today: Optional[date] = None) -> Tuple[int, List[str]]:
    """Return (score 0-100, reasons) for a listing dict with vendor_events-style keys."""
    today = today or date.today()
    score, notes = 100, []
    start = _to_date(item.get("event_start_date"))
    end = _to_date(item.get("expires_after")) or start
    label = str(item.get("event_date_label") or "")
    title = str(item.get("title") or "").strip()
    location = str(item.get("location") or "").strip()
    link = str(item.get("link") or "").strip().lower()
    summary = str(item.get("summary") or "").strip()

    if not start:
        score -= 60; notes.append("no date")
    else:
        md = _label_month_day(label)
        if md and not re.search(r"\b(every|weekly|daily|until|through|to)\b", label, re.I):
            if md != (start.month, start.day):
                score -= 30; notes.append("date text does not match the start date")
        if end and end < start:
            score -= 30; notes.append("ends before it starts")
        if (start - today).days > 365:
            score -= 20; notes.append("more than a year away")
    if location.lower().rstrip(".") in _GENERIC_PLACES:
        score -= 20; notes.append("no specific address")
    if not link or link.rstrip("/") in ("https://welcomeeg.ca", "https://welcomeeg.ca/events",
                                        "https://welcomeeg.ca/sales", "https://welcomeeg.ca/dining"):
        score -= 10; notes.append("no source link")
    if len(summary) < 40:
        score -= 10; notes.append("little or no description")
    if len(title) < 6 or len(title) > 120 or (title.isupper() and len(title) > 12):
        score -= 10; notes.append("title looks wrong")
    return max(0, min(100, score)), notes
