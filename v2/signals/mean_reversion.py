"""Short-horizon mean-reversion alpha model."""

from __future__ import annotations

from v2.data.client import FDClient
from v2.models import Signal
from v2.signals.base import QuantModel


class MeanReversionModel(QuantModel):
    @property
    def name(self) -> str:
        return "mean_reversion"

    def predict(self, ticker: str, date: str, fd_client: FDClient) -> Signal:
        closes = self._price_frame(fd_client, ticker, date, lookback_days=120)
        if len(closes) < 25:
            return Signal(model_name=self.name, ticker=ticker, date=date, value=0.0, reasoning="Insufficient price history")

        ma20 = float(closes.tail(20).mean())
        latest = float(closes.iloc[-1])
        z = (latest - ma20) / (float(closes.tail(20).std()) or 1.0)
        value = self._normalize_to_signal(-self._sigmoid(z, scale=0.35))
        stance = "fade strength" if z > 0 else "fade weakness" if z < 0 else "flat"
        return Signal(
            model_name=self.name,
            ticker=ticker,
            date=date,
            value=value,
            reasoning=f"Mean-reversion: price vs 20d mean z={z:.2f} → {stance}",
            metadata={"z_score_20d": z, "ma20": ma20, "last_close": latest},
        )
