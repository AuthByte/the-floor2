"""Alpha models — pure-Python quant views in [-1, +1]."""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
import pandas as pd

from v2.data.client import FDClient
from v2.models import Signal, SignalResult


class AlphaModel(ABC):
    """Forms a point-in-time view on a ticker."""

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def predict(self, ticker: str, date: str, fd_client: FDClient) -> Signal:
        ...


class QuantModel(AlphaModel):
    """Shared numeric helpers for quant alpha models."""

    @staticmethod
    def _safe_float(value, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            f = float(value)
            return default if (np.isnan(f) or np.isinf(f)) else f
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _normalize_to_signal(raw: float, low: float = -1.0, high: float = 1.0) -> float:
        return max(low, min(high, raw))

    @staticmethod
    def _sigmoid(x: float, scale: float = 5.0) -> float:
        return float(np.tanh(x * scale))

    @staticmethod
    def _compute_rsi(prices: pd.Series, period: int = 14) -> float:
        delta = prices.diff()
        gain = delta.where(delta > 0, 0.0).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100.0 - (100.0 / (1.0 + rs))
        latest = rsi.iloc[-1]
        if pd.isna(latest):
            return 50.0
        return float(latest)

    @staticmethod
    def _price_frame(fd_client: FDClient, ticker: str, end_date: str, lookback_days: int = 260) -> pd.Series:
        from datetime import datetime, timedelta

        end = datetime.strptime(end_date[:10], "%Y-%m-%d").date()
        start = (end - timedelta(days=lookback_days)).isoformat()
        bars = fd_client.get_prices(ticker, start, end_date[:10])
        if not bars:
            return pd.Series(dtype=float)
        closes = pd.Series([b.close for b in bars], dtype=float)
        return closes.dropna()


# Legacy alias used by early v2 docs/tests.
class BaseSignal(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def compute(
        self,
        ticker: str,
        end_date: str,
        *,
        api_key: str | None = None,
    ) -> SignalResult:
        ...
