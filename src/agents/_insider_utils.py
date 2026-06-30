"""Shared insider trade normalization, windowing, cluster heuristics, and scoring."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Literal

from src.data.models import InsiderTrade

OfficerRank = Literal["ceo", "cfo", "officer", "director", "other", "unknown"]

_OFFICER_RANK_WEIGHT: dict[OfficerRank, float] = {
    "ceo": 3.0,
    "cfo": 2.5,
    "officer": 2.0,
    "director": 1.0,
    "other": 0.5,
    "unknown": 0.25,
}

_RSU_PATTERN = re.compile(
    r"\b(restricted\s+stock|rsu|stock\s+award|performance\s+share|phantom\s+stock)\b",
    re.I,
)

_SEC_STUB_NAME = "SEC Form 4"


def _parse_day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def _trade_day(trade: InsiderTrade) -> date | None:
    return _parse_day(trade.transaction_date) or _parse_day(trade.filing_date)


def _is_sec_stub(trade: InsiderTrade) -> bool:
    return (trade.name or "").strip() == _SEC_STUB_NAME and (trade.transaction_shares or 0) == 0


def _is_rsu_grant(trade: InsiderTrade) -> bool:
    title = (trade.security_title or "").strip()
    if not title:
        return False
    if _RSU_PATTERN.search(title):
        return True
    shares = trade.transaction_shares or 0
    price = trade.transaction_price_per_share
    return shares > 0 and (price is None or price == 0) and "common" not in title.lower()


def normalize_trades(trades: list[InsiderTrade], *, as_of: str) -> list[InsiderTrade]:
    """Drop SEC stubs when richer rows share filing_date; filter future dates; drop RSU grants."""
    as_of_day = _parse_day(as_of) or date.today()
    rich_filing_dates = {
        t.filing_date
        for t in trades
        if t.filing_date and not _is_sec_stub(t) and (t.transaction_shares or 0) != 0
    }

    out: list[InsiderTrade] = []
    for trade in trades:
        if _is_sec_stub(trade) and trade.filing_date in rich_filing_dates:
            continue
        if _is_rsu_grant(trade):
            continue
        day = _trade_day(trade)
        if day and day > as_of_day:
            continue
        shares = trade.transaction_shares
        if shares is not None and shares != 0:
            trade = trade.model_copy(update={"transaction_shares": float(shares)})
        out.append(trade)
    return out


def classify_officer(title: str | None, is_board_director: bool | None) -> OfficerRank:
    """Regex map: CEO/CFO/President/EVP/Director."""
    text = (title or "").strip().lower()
    if not text:
        return "director" if is_board_director else "unknown"
    if re.search(r"\b(ceo|chief executive)\b", text):
        return "ceo"
    if re.search(r"\b(cfo|chief financial)\b", text):
        return "cfo"
    if re.search(r"\b(president|evp|svp|executive vice|chief operating|coo|cto|chief technology)\b", text):
        return "officer"
    if re.search(r"\bdirector\b", text) or is_board_director:
        return "director"
    if re.search(r"\b(officer|vp|vice president|treasurer|controller|general counsel)\b", text):
        return "officer"
    return "other"


def window_trades(trades: list[InsiderTrade], *, end: str, days: int) -> list[InsiderTrade]:
    """Inclusive window ending at shift end_date."""
    end_day = _parse_day(end) or date.today()
    start_day = end_day - timedelta(days=max(days - 1, 0))
    out: list[InsiderTrade] = []
    for trade in trades:
        day = _trade_day(trade)
        if day is None:
            continue
        if start_day <= day <= end_day:
            out.append(trade)
    return out


def _unique_names(trades: list[InsiderTrade], *, side: Literal["buy", "sell"]) -> int:
    names: set[str] = set()
    for trade in trades:
        shares = trade.transaction_shares or 0
        if side == "buy" and shares > 0:
            names.add((trade.name or "unknown").strip().lower())
        elif side == "sell" and shares < 0:
            names.add((trade.name or "unknown").strip().lower())
    return len(names)


def _count_buys_sells(trades: list[InsiderTrade]) -> tuple[int, int]:
    buys = sells = 0
    for trade in trades:
        shares = trade.transaction_shares or 0
        if shares > 0:
            buys += 1
        elif shares < 0:
            sells += 1
    return buys, sells


def _net_shares(trades: list[InsiderTrade]) -> float:
    return sum(t.transaction_shares or 0 for t in trades)


def _officer_weighted_net(trades: list[InsiderTrade]) -> float:
    total = 0.0
    for trade in trades:
        shares = trade.transaction_shares or 0
        if shares == 0:
            continue
        rank = classify_officer(trade.title, trade.is_board_director)
        total += shares * _OFFICER_RANK_WEIGHT[rank]
    return total


def _largest_buys(trades: list[InsiderTrade], limit: int = 5) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for trade in trades:
        shares = trade.transaction_shares or 0
        if shares <= 0:
            continue
        value = trade.transaction_value
        if value is None and trade.transaction_price_per_share is not None:
            value = abs(shares) * trade.transaction_price_per_share
        rows.append(
            {
                "name": trade.name,
                "title": trade.title,
                "shares": shares,
                "value": value,
                "date": (trade.transaction_date or trade.filing_date),
            }
        )
    rows.sort(key=lambda r: (r.get("value") or 0, r.get("shares") or 0), reverse=True)
    return rows[:limit]


def _filing_velocity(trades: list[InsiderTrade], *, end: str, window_days: int = 90) -> tuple[float, float]:
    """Return (recent filings per month, trailing baseline filings per month)."""
    end_day = _parse_day(end) or date.today()
    recent_start = end_day - timedelta(days=window_days - 1)
    baseline_end = recent_start - timedelta(days=1)
    baseline_start = baseline_end - timedelta(days=window_days - 1)

    recent_dates: set[str] = set()
    baseline_dates: set[str] = set()
    for trade in trades:
        fdate = trade.filing_date
        day = _parse_day(fdate)
        if not day or not fdate:
            continue
        if recent_start <= day <= end_day:
            recent_dates.add(fdate)
        elif baseline_start <= day <= baseline_end:
            baseline_dates.add(fdate)

    months = max(window_days / 30.0, 1.0)
    recent_rate = len(recent_dates) / months
    baseline_rate = len(baseline_dates) / months
    return recent_rate, baseline_rate


def _cluster_score(
    *,
    unique_buyers_30d: int,
    net_shares_30d: float,
    officer_weighted_net: float,
    filing_velocity_90d: float,
    filing_baseline_90d: float,
    flags_10b5_1_count: int,
    sell_count: int,
) -> float:
    officer_norm = max(-1.0, min(1.0, officer_weighted_net / 50_000.0))
    velocity_boost = 1.0 if filing_baseline_90d > 0 and filing_velocity_90d > filing_baseline_90d * 1.5 else 0.0
    plan_penalty = 2.0 if flags_10b5_1_count > sell_count * 0.5 else 0.0
    raw = (
        2 * min(unique_buyers_30d, 4)
        + 2 * (1 if net_shares_30d > 0 else 0)
        + 2 * officer_norm
        + 1 * velocity_boost
        - plan_penalty
    )
    return max(0.0, min(10.0, raw))


def _human_summary(
    *,
    unique_buyers_30d: int,
    unique_sellers_30d: int,
    net_shares_90d: float,
    cluster_score: float,
    buy_ratio: float,
) -> str:
    parts = [
        f"30d buyers={unique_buyers_30d}, sellers={unique_sellers_30d}",
        f"90d net shares={net_shares_90d:,.0f}",
        f"buy ratio={buy_ratio:.0%}",
        f"cluster={cluster_score:.1f}/10",
    ]
    if cluster_score >= 7 and unique_buyers_30d >= 3:
        parts.append("Form 4 cluster alert")
    return "; ".join(parts)


def _gross_share_totals(trades: list[InsiderTrade]) -> tuple[float, float, float]:
    bought = sum(t.transaction_shares or 0 for t in trades if (t.transaction_shares or 0) > 0)
    sold = abs(sum(t.transaction_shares or 0 for t in trades if (t.transaction_shares or 0) < 0))
    return bought, sold, bought - sold


def compute_insider_metrics(
    trades: list[InsiderTrade],
    *,
    as_of: str,
    windows: tuple[int, ...] = (30, 90, 365),
    normalize: bool = True,
) -> dict[str, Any]:
    """Aggregate insider filing metrics across rolling windows."""
    gross_bought, gross_sold, gross_net = _gross_share_totals(trades)
    normalized = normalize_trades(trades, as_of=as_of) if normalize else list(trades)
    metrics: dict[str, Any] = {"trade_row_count": len(trades)}

    for window in windows:
        windowed = window_trades(normalized, end=as_of, days=window)
        metrics[f"net_shares_{window}d"] = _net_shares(windowed)
        metrics[f"unique_buyers_{window}d"] = _unique_names(windowed, side="buy")
        metrics[f"unique_sellers_{window}d"] = _unique_names(windowed, side="sell")

    all_buys, all_sells = _count_buys_sells(normalized)
    metrics["buy_count"] = all_buys
    metrics["sell_count"] = all_sells
    total = all_buys + all_sells
    metrics["buy_ratio"] = (all_buys / total) if total else 0.5
    metrics["largest_buys"] = _largest_buys(normalized)

    filing_velocity_90d, filing_baseline_90d = _filing_velocity(normalized, end=as_of, window_days=90)
    metrics["filing_velocity_90d"] = filing_velocity_90d
    metrics["filing_baseline_90d"] = filing_baseline_90d

    flags_10b5_1 = sum(
        1
        for t in normalized
        if getattr(t, "is_10b5_1", None) is True or (t.model_extra or {}).get("is_10b5_1") is True
    )
    metrics["flags_10b5_1_count"] = flags_10b5_1

    officer_weighted_net = _officer_weighted_net(window_trades(normalized, end=as_of, days=90))
    metrics["officer_weighted_net"] = officer_weighted_net

    metrics["cluster_score"] = _cluster_score(
        unique_buyers_30d=metrics.get("unique_buyers_30d", 0),
        net_shares_30d=metrics.get("net_shares_30d", 0.0),
        officer_weighted_net=officer_weighted_net,
        filing_velocity_90d=filing_velocity_90d,
        filing_baseline_90d=filing_baseline_90d,
        flags_10b5_1_count=flags_10b5_1,
        sell_count=all_sells,
    )
    metrics["details"] = _human_summary(
        unique_buyers_30d=metrics.get("unique_buyers_30d", 0),
        unique_sellers_30d=metrics.get("unique_sellers_30d", 0),
        net_shares_90d=metrics.get("net_shares_90d", 0.0),
        cluster_score=metrics["cluster_score"],
        buy_ratio=metrics["buy_ratio"],
    )
    metrics["gross_bought_shares"] = gross_bought
    metrics["gross_sold_shares"] = gross_sold
    metrics["gross_net_shares"] = gross_net
    return metrics


def score_insider_activity(
    metrics: dict[str, Any],
    *,
    mode: Literal["desk", "burry", "druck"],
) -> dict[str, Any]:
    """Score insider activity for desk, Burry (0–2), or Druckenmiller (0–10) modes."""
    if mode == "desk":
        score = float(metrics.get("cluster_score", 0.0))
        return {
            **metrics,
            "score": score,
            "max_score": 10,
            "details": metrics.get("details", ""),
        }

    if mode == "burry":
        max_score = 2
        score = 0
        details: list[str] = []
        if metrics.get("trade_row_count", 0) == 0:
            details.append("No insider trade data")
            return {**metrics, "score": score, "max_score": max_score, "details": "; ".join(details)}

        net = float(metrics.get("gross_net_shares", 0.0))
        shares_sold = float(metrics.get("gross_sold_shares", 0.0))
        if net > 0:
            score = 2 if net / max(shares_sold, 1) > 1 else 1
            details.append(f"Net insider buying of {net:,.0f} shares")
        else:
            details.append("Net insider selling")
        return {**metrics, "score": score, "max_score": max_score, "details": "; ".join(details)}

    # mode == "druck"
    score = 5
    details_druck: list[str] = []
    buys = int(metrics.get("buy_count", 0))
    sells = int(metrics.get("sell_count", 0))
    total = buys + sells
    if total == 0:
        details_druck.append("No insider trades data; defaulting to neutral")
        return {**metrics, "score": score, "details": "; ".join(details_druck)}

    buy_ratio = buys / total
    if buy_ratio > 0.7:
        score = 8
        details_druck.append(f"Heavy insider buying: {buys} buys vs. {sells} sells")
    elif buy_ratio > 0.4:
        score = 6
        details_druck.append(f"Moderate insider buying: {buys} buys vs. {sells} sells")
    else:
        score = 4
        details_druck.append(f"Mostly insider selling: {buys} buys vs. {sells} sells")
    return {**metrics, "score": score, "details": "; ".join(details_druck)}


def score_insider_trades(
    trades: list[InsiderTrade],
    *,
    as_of: str,
    mode: Literal["desk", "burry", "druck"],
) -> dict[str, Any]:
    """Normalize, compute metrics, and score — convenience for agent callers."""
    normalize = mode == "desk"
    metrics = compute_insider_metrics(trades, as_of=as_of, normalize=normalize)
    return score_insider_activity(metrics, mode=mode)


def insider_tone(trades: list[InsiderTrade], *, as_of: str | None = None) -> dict[str, Any]:
    """Thin wrapper over compute_insider_metrics for buy/sell tone."""
    as_of_day = as_of or date.today().isoformat()
    metrics = compute_insider_metrics(trades, as_of=as_of_day, windows=(365,), normalize=False)
    buys = int(metrics.get("buy_count", 0))
    sells = int(metrics.get("sell_count", 0))
    total = buys + sells
    return {
        "buys": buys,
        "sells": sells,
        "buy_ratio": (buys / total) if total else 0.5,
    }


def get_prefetched_insider_trades(state: dict[str, Any], ticker: str) -> list[InsiderTrade] | None:
    """Return cached insider trades when graph/desk prefetch populated state."""
    by_ticker = (state.get("data") or {}).get("insider_trades_by_ticker") or {}
    rows = by_ticker.get(ticker) or by_ticker.get(str(ticker).upper())
    return rows if rows is not None else None
