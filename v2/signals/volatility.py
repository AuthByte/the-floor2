"""Volatility regime alpha model — favors stable tape, penalizes chaos."""

from __future__ import annotations

import numpy as np

from v2.data.client import FDClient
from v2.models import Signal
from v2.signals.base import QuantModel


class VolatilityModel(QuantModel):
    @property
    def name(self) -> str:
        return "volatility"

    def predict(self, ticker: str, date: str, fd_client: FDClient) -> Signal:
        closes = self._price_frame(fd_client, ticker, date, lookback_days=180)
        if len(closes) < 30:
            return Signal(model_name=self.name, ticker=ticker, date=date, value=0.0, reasoning="Insufficient price history")

        rets = closes.pct_change().dropna()
        vol = float(rets.tail(20).std() * np.sqrt(252))
        trend = float((closes.iloc[-1] / closes.iloc[max(0, len(closes) - 60)]) - 1.0)
        # Prefer moderate vol with positive drift; punish very high vol.
        raw = trend - max(0.0, vol - 0.35) * 1.5
        value = self._normalize_to_signal(self._sigmoid(raw, scale=2.5))
        regime = "stable uptrend" if vol < 0.30 and trend > 0 else "high vol" if vol > 0.45 else "mixed"
        return Signal(
            model_name=self.name,
            ticker=ticker,
            date=date,
            value=value,
            reasoning=f"Vol desk: ann. vol {vol:.1%}, 60d trend {trend:.1%} → {regime}",
            metadata={"realized_vol": vol, "trend_60d": trend},
        )
