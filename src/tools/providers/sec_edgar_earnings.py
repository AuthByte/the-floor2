"""SEC EDGAR earnings: quarterly XBRL + filing text + optional LLM digest."""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from pydantic import BaseModel, Field, field_validator
from typing_extensions import Literal

from src.data.models import EarningsDigest, EarningsFilingRef, EarningsQuarter
from src.tools.providers.sec_edgar import GAAP_MAP, SEC_HEADERS, fetch_company_facts, get_cik
from src.tools.http import make_api_request

logger = logging.getLogger(__name__)

_EARNINGS_FORMS = ("8-K", "8-K/A", "10-Q", "10-K", "10-Q/A", "10-K/A")
_EARNINGS_8K_ITEMS = ("2.02", "2.03", "7.01")
_SEC_PAUSE = 0.12
_digest_cache: dict[str, EarningsDigest] = {}


def clear_earnings_digest_cache() -> None:
    _digest_cache.clear()


class EarningsDigestLLM(BaseModel):
    summary: str = Field(description="2-4 sentence earnings summary")
    management_tone: Literal["positive", "neutral", "negative"] = "neutral"
    guidance: str | None = None
    one_time_items: list[str] = []
    key_risks: list[str] = []
    revenue_commentary: str | None = None
    eps_commentary: str | None = None

    @field_validator("management_tone", mode="before")
    @classmethod
    def _normalize_tone(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("one_time_items", "key_risks", mode="before")
    @classmethod
    def _coerce_string_list(cls, value: object) -> object:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        return value


def _default_earnings_digest_llm() -> EarningsDigestLLM:
    return EarningsDigestLLM(
        summary="Structured SEC filing data is available; narrative digest could not be generated.",
    )


def fetch_earnings_digest(
    ticker: str,
    end_date: str,
    *,
    state: Any = None,
    agent_id: str | None = None,
    use_llm: bool = True,
) -> EarningsDigest:
    """Build earnings digest from SEC EDGAR (cached per ticker + as_of)."""
    cache_key = f"{ticker.upper()}:{end_date}:{use_llm}"
    if cache_key in _digest_cache:
        return _digest_cache[cache_key]

    cik = get_cik(ticker)
    if not cik:
        digest = _empty_digest(ticker, end_date, "Unknown ticker (no CIK)")
        _digest_cache[cache_key] = digest
        return digest

    quarters = _fetch_quarterly_earnings(ticker, limit=8)
    filings = _pick_earnings_filings(cik, end_date, limit=4)
    filing = filings[0] if filings else None
    filing_text = ""
    filing_url = None
    filing_excerpts: list[str] = []
    for f in filings:
        if not f.get("url"):
            continue
        excerpt = _fetch_filing_text(cik, f)
        if excerpt:
            filing_excerpts.append(
                f"--- {f.get('form', '?')} filed {f.get('filing_date', '?')} ---\n{excerpt[:7000]}"
            )
    if filing:
        filing_url = filing.get("url")
        filing_text = filing_excerpts[0] if filing_excerpts else _fetch_filing_text(cik, filing)

    digest = _build_digest_from_facts(ticker, end_date, quarters, filing, filing_url, filings)

    if use_llm and state and agent_id and filing_excerpts:
        try:
            from langchain_core.prompts import ChatPromptTemplate
            from src.utils.llm import call_llm

            xbrl_block = _format_xbrl_for_prompt(quarters)
            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "You are an equity research analyst. Summarize recent SEC earnings filings. "
                        "Use XBRL figures as ground truth for numbers; do not invent EPS or revenue. "
                        "Cover trends across the provided quarters and filings when possible. "
                        "Return JSON only.",
                    ),
                    (
                        "human",
                        "Ticker: {ticker}\n"
                        "Primary filing: {form} filed {fdate}\n"
                        "Additional filings in this digest: {filing_count}\n\n"
                        "XBRL quarterly facts:\n{xbrl}\n\n"
                        "Filing excerpts (newest first):\n{excerpt}",
                    ),
                ]
            )
            combined_excerpt = "\n\n".join(filing_excerpts)[:28000]
            llm_out = call_llm(
                prompt.format_messages(
                    ticker=ticker,
                    form=filing.get("form", "?"),
                    fdate=filing.get("filing_date", "?"),
                    filing_count=len(filings),
                    xbrl=xbrl_block,
                    excerpt=combined_excerpt,
                ),
                EarningsDigestLLM,
                agent_name=agent_id,
                state=state,
                default_factory=_default_earnings_digest_llm,
                stream=False,
            )
            if isinstance(llm_out, EarningsDigestLLM):
                digest.summary = llm_out.summary
                digest.management_tone = llm_out.management_tone
                digest.guidance = llm_out.guidance
                digest.one_time_items = llm_out.one_time_items or []
                digest.key_risks = llm_out.key_risks or []
                commentary_parts = [
                    c
                    for c in [llm_out.revenue_commentary, llm_out.eps_commentary]
                    if c
                ]
                if commentary_parts:
                    digest.summary = " ".join(
                        [part.strip() for part in [digest.summary or "", *commentary_parts] if part]
                    )
                digest.source = "sec_edgar+llm"
        except Exception as exc:
            logger.debug("Earnings LLM digest failed for %s: %s", ticker, exc)

    if not digest.summary:
        digest.summary = _rule_based_summary(digest)
        digest.headline = digest.summary[:200]

    _digest_cache[cache_key] = digest
    return digest


def _empty_digest(ticker: str, as_of: str, message: str) -> EarningsDigest:
    return EarningsDigest(
        ticker=ticker,
        as_of=as_of,
        available=False,
        summary=message,
        headline=message,
    )


def _build_digest_from_facts(
    ticker: str,
    end_date: str,
    quarters: list[EarningsQuarter],
    filing: dict | None,
    filing_url: str | None,
    filings: list[dict] | None = None,
) -> EarningsDigest:
    latest = quarters[0] if quarters else None
    prior_yoy = quarters[4] if len(quarters) > 4 else None
    prior_qoq = quarters[1] if len(quarters) > 1 else None
    prior = prior_yoy or prior_qoq
    rev_yoy = _yoy_pct(latest.revenue if latest else None, prior.revenue if prior else None)
    eps_yoy = _yoy_pct(latest.eps if latest else None, prior.eps if prior else None)

    digest = EarningsDigest(
        ticker=ticker,
        as_of=end_date,
        available=bool(quarters or filing),
        filing_form=filing.get("form") if filing else None,
        filing_date=filing.get("filing_date") if filing else None,
        filing_url=filing_url,
        revenue=latest.revenue if latest else None,
        revenue_prior=prior.revenue if prior else None,
        net_income=latest.net_income if latest else None,
        eps=latest.eps if latest else None,
        eps_prior=prior.eps if prior else None,
        revenue_yoy_pct=rev_yoy,
        eps_yoy_pct=eps_yoy,
        quarterly_history=quarters,
        recent_filings=[
            EarningsFilingRef(
                form=f.get("form"),
                filing_date=f.get("filing_date"),
                filing_url=f.get("url"),
            )
            for f in (filings or [])
        ],
    )
    digest.headline = _rule_based_summary(digest)
    return digest


def _rule_based_summary(d: EarningsDigest) -> str:
    parts: list[str] = []
    change_label = "YoY" if len(d.quarterly_history) > 4 else "QoQ"
    if d.recent_filings:
        labels = [
            f"{f.form or 'SEC'} ({f.filing_date})"
            for f in d.recent_filings[:4]
            if f.filing_date
        ]
        if labels:
            parts.append(f"{len(labels)} filings: " + ", ".join(labels))
    elif d.filing_form and d.filing_date:
        parts.append(f"SEC {d.filing_form} ({d.filing_date})")
    if d.revenue is not None:
        seg = f"Revenue ${d.revenue / 1e9:.2f}B" if d.revenue >= 1e9 else f"Revenue ${d.revenue / 1e6:.1f}M"
        if d.revenue_yoy_pct is not None:
            seg += f" ({change_label} {d.revenue_yoy_pct * 100:+.1f}%)"
        parts.append(seg)
    if d.eps is not None:
        seg = f"EPS ${d.eps:.2f}"
        if d.eps_yoy_pct is not None:
            seg += f" ({change_label} {d.eps_yoy_pct * 100:+.1f}%)"
        parts.append(seg)
    if d.net_income is not None:
        parts.append(f"Net income ${d.net_income / 1e6:.1f}M")
    return "; ".join(parts) if parts else "SEC earnings data limited for this ticker"


def _format_xbrl_for_prompt(quarters: list[EarningsQuarter]) -> str:
    lines = []
    for q in quarters[:6]:
        lines.append(
            f"{q.period_end} ({q.fiscal_period or '?'}): "
            f"rev={q.revenue} ni={q.net_income} eps={q.eps}"
        )
    return "\n".join(lines) or "No quarterly XBRL"


def _yoy_pct(current: float | None, prior: float | None) -> float | None:
    if current is None or prior is None or prior == 0:
        return None
    try:
        return (current - prior) / abs(prior)
    except (ZeroDivisionError, TypeError):
        return None


def _fetch_quarterly_earnings(ticker: str, limit: int = 8) -> list[EarningsQuarter]:
    facts = fetch_company_facts(ticker)
    if not facts:
        return []

    revenue_pts = _extract_quarterly_points(facts, GAAP_MAP["revenue"])
    income_pts = _extract_quarterly_points(facts, GAAP_MAP["net_income"])
    eps_pts = _extract_quarterly_points(facts, GAAP_MAP["earnings_per_share"])

    by_end: dict[str, EarningsQuarter] = {}
    for pt in revenue_pts:
        by_end.setdefault(pt["end"], {})["revenue"] = pt["val"]
        by_end[pt["end"]]["fiscal_period"] = pt.get("fp")
        by_end[pt["end"]]["form"] = pt.get("form")
    for pt in income_pts:
        by_end.setdefault(pt["end"], {})["net_income"] = pt["val"]
    for pt in eps_pts:
        by_end.setdefault(pt["end"], {})["eps"] = pt["val"]

    ends = sorted(by_end.keys(), reverse=True)[:limit]
    out: list[EarningsQuarter] = []
    for end in ends:
        row = by_end[end]
        out.append(
            EarningsQuarter(
                period_end=end,
                fiscal_period=row.get("fiscal_period"),
                form=row.get("form"),
                revenue=row.get("revenue"),
                net_income=row.get("net_income"),
                eps=row.get("eps"),
            )
        )
    return out


def _extract_quarterly_points(facts: dict, tags: list[str]) -> list[dict]:
    gaap = facts.get("facts", {}).get("us-gaap", {})
    points: list[dict] = []
    for tag in tags:
        block = gaap.get(tag)
        if not block:
            continue
        for unit_values in block.get("units", {}).values():
            for obs in unit_values:
                end = obs.get("end")
                val = obs.get("val")
                if not end or val in (None, ""):
                    continue
                fp = obs.get("fp", "")
                form = obs.get("form", "")
                if fp and fp not in ("Q1", "Q2", "Q3", "Q4", "FY"):
                    continue
                if form and form not in ("10-Q", "10-K", "10-Q/A", "10-K/A"):
                    continue
                try:
                    points.append(
                        {
                            "end": end,
                            "val": float(val),
                            "fp": fp,
                            "form": form,
                        }
                    )
                except (TypeError, ValueError):
                    continue
    # dedupe by end, keep latest filed
    dedup: dict[str, dict] = {}
    for p in points:
        if p["end"] not in dedup:
            dedup[p["end"]] = p
    return sorted(dedup.values(), key=lambda x: x["end"], reverse=True)


def _earnings_filing_candidates(cik: str, end_date: str) -> list[dict]:
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    time.sleep(_SEC_PAUSE)
    resp = make_api_request(url, SEC_HEADERS, timeout=60)
    if resp.status_code != 200:
        return []
    try:
        recent = resp.json().get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        primaries = recent.get("primaryDocument", [])
        items_list = recent.get("items", []) or [""] * len(forms)
    except Exception:
        return []

    candidates: list[dict] = []
    cik_path = str(int(cik))
    for form, fdate, acc, doc, items in zip(forms, dates, accessions, primaries, items_list):
        if fdate > end_date:
            continue
        if form not in _EARNINGS_FORMS:
            continue
        score = 0
        if form.startswith("8-K"):
            score = 3
            items_s = str(items or "")
            if any(it in items_s for it in _EARNINGS_8K_ITEMS):
                score = 5
        elif form.startswith("10-Q"):
            score = 2
        elif form.startswith("10-K"):
            score = 1
        acc_path = acc.replace("-", "")
        candidates.append(
            {
                "form": form,
                "filing_date": fdate,
                "accession": acc,
                "primary_document": doc,
                "score": score,
                "url": f"https://www.sec.gov/Archives/edgar/data/{cik_path}/{acc_path}/{doc}",
            }
        )
    return candidates


def _pick_earnings_filings(cik: str, end_date: str, limit: int = 4) -> list[dict]:
    """Return the newest distinct earnings-related filings (up to ``limit``)."""
    candidates = _earnings_filing_candidates(cik, end_date)
    if not candidates:
        return []

    ranked = sorted(candidates, key=lambda c: (c["score"], c["filing_date"]), reverse=True)
    seen_dates: set[str] = set()
    picked: list[dict] = []
    for cand in ranked:
        key = f"{cand['form']}:{cand['filing_date']}"
        if key in seen_dates:
            continue
        seen_dates.add(key)
        picked.append(cand)
        if len(picked) >= limit:
            break
    return picked


def _pick_earnings_filing(cik: str, end_date: str) -> dict | None:
    filings = _pick_earnings_filings(cik, end_date, limit=1)
    return filings[0] if filings else None


def _fetch_filing_text(cik: str, filing: dict) -> str:
    url = filing.get("url")
    if not url:
        return ""
    time.sleep(_SEC_PAUSE)
    resp = make_api_request(url, SEC_HEADERS, timeout=90)
    if resp.status_code != 200:
        return ""
    content_type = (resp.headers.get("content-type") or "").lower()
    raw = resp.text
    if "html" in content_type or raw.lstrip().startswith("<"):
        return _html_to_text(raw)
    return raw[:14000]


def _html_to_text(html: str, max_len: int = 14000) -> str:
    try:
        from bs4 import BeautifulSoup

        text = BeautifulSoup(html, "html.parser").get_text(separator=" ", strip=True)
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text)
    return text[:max_len]
