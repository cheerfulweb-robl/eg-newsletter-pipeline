"""Shared HTTP request helpers with retry and structured logging."""

import logging
import time
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger("welcome_georgina.http")


def fetch_with_retry(
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    timeout: int = 15,
    retries: int = 3,
    backoff_seconds: float = 0.5,
) -> Optional[requests.Response]:
    """Perform a GET request with exponential backoff on transient failures."""
    last_exc: Optional[Exception] = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=timeout)
            if resp.status_code < 500:
                return resp
            logger.warning(
                "HTTP %s from %s (attempt %d/%d)",
                resp.status_code,
                url,
                attempt,
                retries,
            )
        except requests.RequestException as exc:
            last_exc = exc
            logger.warning(
                "Request error for %s (attempt %d/%d): %s",
                url,
                attempt,
                retries,
                exc,
            )
        if attempt < retries:
            time.sleep(backoff_seconds * (2 ** (attempt - 1)))

    if last_exc is not None:
        logger.error("All %d attempts failed for %s: %s", retries, url, last_exc)
    return None
