"""Quant alpha model registry."""

from __future__ import annotations

from v2.signals.base import AlphaModel, QuantModel
from v2.signals.mean_reversion import MeanReversionModel
from v2.signals.momentum import MomentumModel
from v2.signals.pead import PEADModel
from v2.signals.volatility import VolatilityModel

ALPHA_MODEL_REGISTRY: dict[str, type[AlphaModel]] = {
    "pead": PEADModel,
    "momentum": MomentumModel,
    "mean_reversion": MeanReversionModel,
    "volatility": VolatilityModel,
}

QUANT_AGENT_MODELS: dict[str, type[QuantModel]] = {
    "quant_pead": PEADModel,
    "quant_momentum": MomentumModel,
    "quant_mean_reversion": MeanReversionModel,
    "quant_volatility": VolatilityModel,
}

__all__ = [
    "AlphaModel",
    "QuantModel",
    "PEADModel",
    "MomentumModel",
    "MeanReversionModel",
    "VolatilityModel",
    "ALPHA_MODEL_REGISTRY",
    "QUANT_AGENT_MODELS",
]
