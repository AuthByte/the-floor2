"""Resolve natural-language shift requests into ticker symbols."""

from __future__ import annotations

import re
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, field_validator

from src.llm.models import ModelProvider, get_model, get_model_info

MAX_SHIFT_TICKERS = 8

# Dedicated model for NL → ticker resolution (not the user's shift model).
# Llama 3.3 70B free: strong general reasoning, structured JSON, $0 on OpenRouter.
RESOLVER_MODEL = "meta-llama/llama-3.3-70b-instruct:free"
RESOLVER_PROVIDER = ModelProvider.OPENROUTER

# Words that match ticker shape but are finance/English descriptors, not symbols.
_TICKER_NOISE = frozenset(
    {
        "A", "I", "AI", "IT", "US", "UK", "EU", "OR", "AN", "AS", "AT", "BE", "BY", "DO", "GO",
        "IF", "IN", "IS", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "WE",
        "ALL", "AND", "ARE", "BUY", "CAP", "CEO", "CFO", "DAY", "EPS", "ETF", "FED", "FOR",
        "GDP", "IPO", "LOW", "MID", "NEW", "OLD", "OUT", "PE", "RUN", "SEC", "THE", "TOP",
        "USA", "VS", "YOY", "BIG", "HOT", "NOW", "KEY", "MAX", "MIN", "NET", "PRO", "RAW",
        "RED", "SMALL", "LARGE", "MICRO", "NANO", "MEGA", "HIGH", "BEST", "GOOD", "LONG",
        "SHORT", "BULL", "BEAR", "MOON", "WIRE", "NYSE", "USD", "EUR", "HOLD", "SELL",
        "QOQ", "YTD", "ATH", "ATL", "RSI", "MACD", "DCF", "ESG", "ADR", "REIT",
    }
)

_FINANCE_DESCRIPTOR = re.compile(
    r"\b("
    r"small|large|mid|micro|nano|mega|cap|growth|value|dividend|peptide|biotech|"
    r"semiconductor|semiconductors|tech|technology|bank|banks|energy|stock|stocks|"
    r"sector|sectors|etf|etfs|compare|analyze|analysis|leaders?|giants?|mag|"
    r"pharma|healthcare|fintech|retail|industrial|materials|utilities|reit|"
    r"undervalued|overvalued|momentum|contrarian|blue\s*chip"
    r")\b",
    re.I,
)

# Quick local map for obvious company names (avoids an LLM hop).
_NAME_ALIASES: dict[str, str] = {
    "apple": "AAPL",
    "microsoft": "MSFT",
    "google": "GOOGL",
    "alphabet": "GOOGL",
    "amazon": "AMZN",
    "nvidia": "NVDA",
    "meta": "META",
    "facebook": "META",
    "tesla": "TSLA",
    "netflix": "NFLX",
    "amd": "AMD",
    "intel": "INTC",
    "berkshire": "BRK.B",
    "jpmorgan": "JPM",
    "visa": "V",
    "walmart": "WMT",
    "disney": "DIS",
    "boeing": "BA",
    "coinbase": "COIN",
    "palantir": "PLTR",
}


class TickerResolveOutput(BaseModel):
    tickers: list[str] = Field(
        description="1-8 US-listed stock ticker symbols (uppercase)",
        min_length=1,
        max_length=MAX_SHIFT_TICKERS,
    )
    rationale: str = Field(
        default="",
        description="One short sentence explaining the selection",
    )

    @field_validator("tickers")
    @classmethod
    def normalize_tickers(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for raw in values:
            sym = str(raw or "").strip().upper()
            if not sym or not re.match(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$", sym):
                continue
            if sym in seen:
                continue
            seen.add(sym)
            out.append(sym)
        if not out:
            raise ValueError("no valid tickers")
        return out[:MAX_SHIFT_TICKERS]


def _looks_natural_language(text: str) -> bool:
    if _FINANCE_DESCRIPTOR.search(text):
        return True
    words = re.findall(r"[a-zA-Z][a-zA-Z'.-]*", text)
    if len(words) >= 3:
        return True
    # Two-word phrases like "small cap" or "big tech"
    if len(words) == 2 and _FINANCE_DESCRIPTOR.search(" ".join(words)):
        return True
    return False


def _is_ticker_token(raw: str) -> bool:
    sym = raw.strip().upper().strip(".")
    if not sym or sym in _TICKER_NOISE:
        return False
    return bool(re.match(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$", sym))


def _extract_explicit_tickers(text: str) -> list[str]:
    """Pull symbol-like tokens only when the input is clearly a ticker list."""
    seen: set[str] = set()
    out: list[str] = []

    if _looks_natural_language(text):
        # In NL mode, only keep symbols the user actually typed in uppercase (e.g. "and AAPL").
        for chunk in re.split(r"[,;\n]+", text):
            for token in chunk.split():
                raw = token.strip().strip(".")
                if raw != raw.upper():
                    continue
                if not _is_ticker_token(raw):
                    continue
                sym = raw.upper()
                if sym not in seen:
                    seen.add(sym)
                    out.append(sym)
        return out

    for chunk in re.split(r"[,;\n]+", text):
        for token in chunk.split():
            raw = token.strip().strip(".")
            if not raw:
                continue
            if not _is_ticker_token(raw):
                continue
            sym = raw.upper()
            if sym not in seen:
                seen.add(sym)
                out.append(sym)
    return out


def _extract_alias_tickers(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for word in re.findall(r"[a-zA-Z][a-zA-Z'.-]*", text.lower()):
        key = word.strip("'.")
        sym = _NAME_ALIASES.get(key)
        if sym and sym not in seen:
            seen.add(sym)
            out.append(sym)
    return out


def _is_pure_ticker_query(text: str, tickers: list[str]) -> bool:
    if not tickers:
        return False
    remainder = text
    for sym in sorted(tickers, key=len, reverse=True):
        remainder = re.sub(rf"(?i)\b{re.escape(sym)}\b", " ", remainder)
    remainder = re.sub(r"[^a-zA-Z]+", "", remainder)
    return not remainder


def parse_direct_tickers(text: str, *, max_count: int = MAX_SHIFT_TICKERS) -> list[str] | None:
    """Return symbols when input is a plain ticker list; None if NL resolution is needed."""
    query = (text or "").strip()
    if not query:
        return None
    explicit = _extract_explicit_tickers(query)
    if _is_pure_ticker_query(query, explicit):
        return explicit[:max_count]
    return None


def normalize_ticker_list(tickers: list[str], *, max_count: int = MAX_SHIFT_TICKERS) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in tickers:
        sym = str(raw or "").strip().upper()
        if not sym or sym in seen or sym in _TICKER_NOISE:
            continue
        if not re.match(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$", sym):
            continue
        seen.add(sym)
        out.append(sym)
        if len(out) >= max_count:
            break
    return out


def resolve_tickers_from_query(
    query: str,
    *,
    model_name: str,
    model_provider: str | ModelProvider,
    api_keys: dict[str, str] | None = None,
    max_tickers: int = MAX_SHIFT_TICKERS,
) -> TickerResolveOutput:
    """Turn a user string into a deduped ticker list."""
    text = (query or "").strip()
    if not text:
        raise ValueError("empty query")

    explicit = _extract_explicit_tickers(text)
    direct = parse_direct_tickers(text, max_count=max_tickers)
    if direct is not None:
        return TickerResolveOutput(
            tickers=direct,
            rationale="Parsed ticker symbols from your input.",
        )

    alias_hits = _extract_alias_tickers(text)
    if alias_hits and not re.search(
        r"\b(mag|semiconductor|bank|energy|compare|analyze|analysis|stocks?|sector|giants?|leaders?)\b",
        text,
        re.I,
    ):
        merged = normalize_ticker_list([*explicit, *alias_hits], max_count=max_tickers)
        if merged:
            return TickerResolveOutput(
                tickers=merged,
                rationale="Matched company names to tickers.",
            )

    provider = (
        model_provider
        if isinstance(model_provider, ModelProvider)
        else ModelProvider(model_provider)
    )
    resolve_model = model_name or RESOLVER_MODEL
    if provider == ModelProvider.OPENROUTER and ":free" not in resolve_model and resolve_model == "openai/gpt-4o-mini":
        resolve_model = RESOLVER_MODEL
        provider = RESOLVER_PROVIDER

    llm = get_model(resolve_model, provider, api_keys)
    model_info = get_model_info(resolve_model, provider)

    template = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You map investment research requests to US-listed stock ticker symbols. "
                f"Return JSON only. Pick 1-{max_tickers} liquid, relevant tickers. "
                "Use standard US symbols (e.g. BRK.B, GOOGL). No crypto, no ETFs unless the user asks for an ETF. "
                "English descriptors like 'small cap', 'growth', or 'peptide' are NOT tickers — map them to real companies. "
                "Never return words from the user's phrase as fake tickers (e.g. SMALL, CAP, TECH). "
                "Prefer widely traded names when the user is vague.",
            ),
            (
                "human",
                "User request:\n{query}\n\n"
                "Optional symbols already confirmed by the user (use only if clearly intended): {explicit}\n\n"
                'Return: {{"tickers": ["AAPL", "..."], "rationale": "..."}}',
            ),
        ]
    )
    prompt = template.invoke(
        {
            "query": text,
            "explicit": ", ".join(explicit) if explicit else "none",
        }
    )

    structured = llm
    if not (model_info and not model_info.has_json_mode()):
        structured = llm.with_structured_output(TickerResolveOutput, method="json_mode")

    result: TickerResolveOutput = structured.invoke(prompt)
    merged = normalize_ticker_list(
        result.tickers if _looks_natural_language(text) else [*explicit, *result.tickers],
        max_count=max_tickers,
    )
    if not merged:
        raise ValueError("could not resolve any tickers from query")
    return TickerResolveOutput(
        tickers=merged,
        rationale=(result.rationale or "").strip() or "Resolved symbols from your request.",
    )
