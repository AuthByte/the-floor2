"""MarketAux news with entity sentiment (https://www.marketaux.com/documentation)."""

from __future__ import annotations

import logging
from urllib.parse import urlencode

from src.data.models import CompanyNews
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)
BASE = "https://api.marketaux.com/v1/news/all"


def _sentiment_from_entities(ticker: str, entities: list[dict]) -> str | None:
    for ent in entities:
        sym = (ent.get("symbol") or "").upper()
        if sym != ticker.upper():
            continue
        score = ent.get("sentiment_score")
        if score is not None:
            try:
                s = float(score)
                if s >= 0.15:
                    return "positive"
                if s <= -0.15:
                    return "negative"
                return "neutral"
            except (TypeError, ValueError):
                pass
        label = (ent.get("sentiment") or "").lower()
        if label in ("positive", "negative", "neutral"):
            return label
    return None


def fetch_company_news(
    ticker: str, start_date: str, end_date: str, limit: int, api_key: str | None
) -> list[CompanyNews]:
    if not api_key:
        return []
    params = {
        "symbols": ticker,
        "filter_entities": "true",
        "language": "en",
        "published_after": f"{start_date}T00:00",
        "published_before": f"{end_date}T23:59",
        "limit": str(min(limit, 50)),
        "api_token": api_key,
    }
    url = f"{BASE}?{urlencode(params)}"
    resp = make_api_request(url, timeout=45)
    if resp.status_code != 200:
        logger.debug("MarketAux news failed for %s: %s", ticker, resp.status_code)
        return []
    try:
        rows = resp.json().get("data", [])
        out: list[CompanyNews] = []
        for row in rows[:limit]:
            title = row.get("title", "")
            if not title:
                continue
            day = (row.get("published_at") or "")[:10] or end_date
            out.append(
                CompanyNews(
                    ticker=ticker,
                    title=title,
                    author=None,
                    source=row.get("source", "MarketAux"),
                    date=day,
                    url=row.get("url", ""),
                    sentiment=_sentiment_from_entities(ticker, row.get("entities") or []),
                )
            )
        return out
    except Exception as exc:
        logger.debug("MarketAux parse failed for %s: %s", ticker, exc)
        return []
