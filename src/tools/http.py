"""Shared HTTP helpers for market data providers."""

import logging
import time

import requests

logger = logging.getLogger(__name__)


def make_api_request(
    url: str,
    headers: dict | None = None,
    method: str = "GET",
    json_data: dict | None = None,
    max_retries: int = 3,
    timeout: int = 30,
) -> requests.Response:
    headers = headers or {}
    for attempt in range(max_retries + 1):
        if method.upper() == "POST":
            response = requests.post(url, headers=headers, json=json_data, timeout=timeout)
        else:
            response = requests.get(url, headers=headers, timeout=timeout)

        if response.status_code == 429 and attempt < max_retries:
            delay = 60 + (30 * attempt)
            logger.warning("Rate limited (429). Waiting %ss before retry…", delay)
            time.sleep(delay)
            continue
        return response
    return response
