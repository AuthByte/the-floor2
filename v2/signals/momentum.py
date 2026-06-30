"""12-1 month price momentum alpha model."""

from __future__ import annotations

from v2.data.client import FDClient
from v2.models import Signal
from v2.signals.base import QuantModel


class MomentumModel(QuantModel):
    @property
    def name(self) -> str:
        return "momentum"

    def predict(self, ticker: str, date: str, fd_client: FDClient) -> Signal:
        closes = self._price_frame(fd_client, ticker, date)
        if len(closes) < 60:
            return Signal(model_name=self.name, ticker=ticker, date=date, value=0.0, reasoning="Insufficient price history")

        ret_12m = (closes.iloc[-1] / closes.iloc[0]) - 1.0 if len(closes) >= 200 else (closes.iloc[-1] / closes.iloc[max(0, len(closes) - 200)]) - 1.0
        ret_1m = (closes.iloc[-1] / closes.iloc[max(0, len(closes) - 22)]) - 1.0
        blended = 0.65 * ret_12m + 0.35 * ret_1m
        value = self._normalize_to_signal(self._sigmoid(blended, scale=3.0))
        direction = "bullish" if value > 0.15 else "bearish" if value < -0.15 else "neutral"
        return Signal(
            model_name=self.name,
            ticker=ticker,
            date=date,
            value=value,
            reasoning=f"Momentum desk: 12-1 blend {blended:.1%} → {direction}",
            metadata={"return_12m": ret_12m, "return_1m": ret_1m},
        )
