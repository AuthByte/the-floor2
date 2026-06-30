"""PEAD — post-earnings announcement drift."""

from __future__ import annotations

from datetime import datetime

from v2.data.client import FDClient
from v2.data.models import EarningsRecord
from v2.models import Signal
from v2.signals.base import QuantModel

_RETROSPECTIVE_CUTOFF_DAYS = 45
_SOURCE_PRIORITY = {"8-K": 0, "10-Q": 1, "10-K": 2, "20-F": 3}


class PEADModel(QuantModel):
    def __init__(self, *, earnings_limit: int = 8, signal_window_days: int = 4) -> None:
        self._earnings_limit = earnings_limit
        self._signal_window_days = signal_window_days
        self._cache: dict[str, list[EarningsRecord]] = {}

    @property
    def name(self) -> str:
        return "pead"

    def predict(self, ticker: str, date: str, fd_client: FDClient) -> Signal:
        as_of = _parse_date(date)
        events = self._qualifying_events(ticker, fd_client)
        past = [e for e in events if _parse_date(e["filing_date"]) <= as_of]
        if not past:
            return self._neutral(ticker, date)

        event = max(past, key=lambda e: e["filing_date"])
        filed = _parse_date(event["filing_date"])
        if (as_of - filed).days > self._signal_window_days:
            return self._neutral(ticker, date)

        surprise = event["surprise"]
        value = 1.0 if surprise == "BEAT" else -1.0
        return Signal(
            model_name=self.name,
            ticker=ticker,
            date=date,
            value=value,
            reasoning=(
                f"{surprise} on {event['report_period']} earnings "
                f"(filed {event['filing_date']}, {event['source_type']})"
            ),
            metadata={
                "eps_surprise": surprise,
                "source_type": event["source_type"],
                "report_period": event["report_period"],
                "filing_date": event["filing_date"],
            },
        )

    def _neutral(self, ticker: str, date: str) -> Signal:
        return Signal(model_name=self.name, ticker=ticker, date=date, value=0.0, reasoning="No fresh earnings surprise")

    def _qualifying_events(self, ticker: str, fd_client: FDClient) -> list[dict]:
        if ticker in self._cache:
            records = self._cache[ticker]
        else:
            records = fd_client.get_earnings_history(ticker, limit=self._earnings_limit)
            self._cache[ticker] = records

        best: dict[str, tuple[int, EarningsRecord]] = {}
        for r in records:
            if not r.filing_date or not r.quarterly:
                continue
            surprise = r.quarterly.eps_surprise
            if surprise not in ("BEAT", "MISS"):
                continue
            lag = (_parse_date(r.filing_date) - _parse_date(r.report_period)).days
            if lag >= _RETROSPECTIVE_CUTOFF_DAYS:
                continue
            priority = _SOURCE_PRIORITY.get(r.source_type, 99)
            if r.report_period not in best or priority < best[r.report_period][0]:
                best[r.report_period] = (priority, r)

        return [
            {
                "filing_date": r.filing_date,
                "report_period": r.report_period,
                "source_type": r.source_type,
                "surprise": r.quarterly.eps_surprise,
            }
            for _, r in best.values()
        ]


def _parse_date(s: str):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()
