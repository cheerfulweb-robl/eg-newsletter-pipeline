"""
Deduplication and Event Fingerprinting Module for Welcome East Gwillimbury.
Combines RapidFuzz token-set similarity with date and location compatibility
to eliminate redundant listings from Town, Chamber, and community sources.
"""
from datetime import datetime
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    from rapidfuzz import fuzz
    HAS_RAPIDFUZZ = True
except ImportError:
    import difflib
    HAS_RAPIDFUZZ = False

# Common prefixes, entity names, and noise tokens that cause near-duplicates
NOISE_PATTERNS = [
    re.compile(r"^(the\s+)?town\s+of\s+georgina\s*[-:–—•]\s*", re.IGNORECASE),
    re.compile(r"^(the\s+)?town\s+of\s+georgina\s+", re.IGNORECASE),
    re.compile(r"^georgina\s+chamber\s+of\s+commerce\s*[-:–—•]\s*", re.IGNORECASE),
    re.compile(r"^georgina\s+public\s+library\s*[-:–—•]\s*", re.IGNORECASE),
    re.compile(r"^sutton\s+legion\s+(branch\s+356)?\s*[-:–—•]\s*", re.IGNORECASE),
    re.compile(r"^stephen\s+leacock\s+theatre\s*[-:–—•]\s*", re.IGNORECASE),
    re.compile(r"\bannual\b", re.IGNORECASE),
    re.compile(r"\bpresent(s)?\b", re.IGNORECASE),
]


def clean_title_for_comparison(title: str) -> str:
    """
    Cleans an event or news title by removing common organizational prefixes,
    punctuation, and normalizing whitespace.
    """
    if not title:
        return ""
    text = title.strip()
    for pat in NOISE_PATTERNS:
        text = pat.sub("", text)
    # Remove leading sale tag if present for fair title comparison
    if text.lower().startswith("[sale]"):
        text = text[6:].strip()
    # Normalize punctuation to spaces
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.lower().split())


def compute_title_similarity(title_a: str, title_b: str) -> float:
    """
    Calculates token-set similarity between two titles (0.0 to 100.0).
    Uses RapidFuzz token_set_ratio when available, with a SequenceMatcher fallback.
    """
    clean_a = clean_title_for_comparison(title_a)
    clean_b = clean_title_for_comparison(title_b)

    if not clean_a or not clean_b:
        return 0.0
    if clean_a == clean_b:
        return 100.0

    if HAS_RAPIDFUZZ:
        return float(fuzz.token_set_ratio(clean_a, clean_b))

    # Pure Python fallback using token set matching with difflib
    tokens_a = set(clean_a.split())
    tokens_b = set(clean_b.split())
    intersection = tokens_a.intersection(tokens_b)
    if not intersection:
        return 0.0
    if len(intersection) == min(len(tokens_a), len(tokens_b)) and len(intersection) >= 2:
        return 100.0
    jaccard = len(intersection) / len(tokens_a.union(tokens_b))
    sm_ratio = difflib.SequenceMatcher(None, clean_a, clean_b).ratio()
    return max(jaccard * 100.0, sm_ratio * 100.0)


def are_dates_compatible(date_a: str, date_b: str) -> bool:
    """
    Checks if two date strings refer to the same event or can be considered compatible.
    If both strings have clear and conflicting calendar dates (e.g. 'Nov 14' vs 'Nov 21'),
    they are considered distinct (not duplicates).
    """
    d_a = (date_a or "").strip().lower()
    d_b = (date_b or "").strip().lower()

    if not d_a or not d_b:
        return True
    if d_a == d_b:
        return True
    if "ongoing" in d_a or "ongoing" in d_b or "drop-in" in d_a or "drop-in" in d_b:
        return True

    # Look for matching day names (e.g. 'Every Tuesday' vs 'Tuesday, Nov 10')
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    days_a = [w for w in weekdays if w in d_a]
    days_b = [w for w in weekdays if w in d_b]
    if days_a and days_b and set(days_a).intersection(set(days_b)):
        return True

    # Check for extractable YYYY-MM-DD or Month Day patterns
    date_pat = re.compile(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b", re.I)
    match_a = date_pat.search(d_a)
    match_b = date_pat.search(d_b)
    if match_a and match_b:
        return match_a.group(0).lower() == match_b.group(0).lower()

    # If neither specific conflict found, treat as compatible if title similarity is very high
    return True


def is_fuzzy_duplicate(
    candidate_title: str,
    candidate_date: str,
    existing_items: List[Dict[str, Any]],
    threshold: float = 85.0,
) -> Tuple[bool, Optional[Dict[str, Any]], float]:
    """
    Determines whether a candidate event is a duplicate of any item in existing_items.
    Returns: (is_duplicate, matched_item, similarity_score)
    """
    if not candidate_title:
        return False, None, 0.0

    best_score = 0.0
    best_match = None

    for item in existing_items:
        existing_title = item.get("title") or ""
        if not existing_title:
            continue

        score = compute_title_similarity(candidate_title, existing_title)
        if score > best_score:
            best_score = score
            best_match = item

    if best_score >= threshold and best_match:
        existing_date = best_match.get("date") or best_match.get("event_date_label") or ""
        if are_dates_compatible(candidate_date, existing_date):
            return True, best_match, best_score

    return False, None, best_score


def deduplicate_events(
    items: List[Dict[str, Any]],
    threshold: float = 85.0,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Filters a list of scraped event/deal items, removing duplicates based on RapidFuzz
    similarity and date compatibility. Returns (deduplicated_list, duplicates_removed_count).
    """
    unique_items: List[Dict[str, Any]] = []
    removed_count = 0

    for item in items:
        title = item.get("title", "")
        date = item.get("date", "") or item.get("event_date_label", "")

        is_dup, matched, score = is_fuzzy_duplicate(title, date, unique_items, threshold=threshold)
        if is_dup and matched:
            removed_count += 1
            # Optionally enrich the existing item with more details if the current has more
            if len(item.get("summary", "")) > len(matched.get("summary", "")):
                matched["summary"] = item["summary"]
            if not matched.get("link") and item.get("link"):
                matched["link"] = item["link"]
        else:
            unique_items.append(item)

    return unique_items, removed_count
