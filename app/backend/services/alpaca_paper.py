"""Submit portfolio-manager decisions to Alpaca's paper trading API."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_PAPER_BASE = "https://paper-api.alpaca.markets"

# Maps PM actions to Alpaca order sides (short/cover use sell/buy).
_ACTION_TO_SIDE = {
    "buy": "buy",
    "sell": "sell",
    "short": "sell",
    "cover": "buy",
}


def resolve_alpaca_credentials(
    api_keys: Optional[Dict[str, str]] = None,
) -> Optional[Tuple[str, str, str]]:
    """Return (key_id, secret, base_url) when credentials are available."""
    keys = api_keys or {}
    key_id = (
        keys.get("ALPACA_API_KEY_ID")
        or keys.get("APCA_API_KEY_ID")
        or os.getenv("ALPACA_API_KEY_ID")
        or os.getenv("APCA_API_KEY_ID")
    )
    secret = (
        keys.get("ALPACA_API_SECRET_KEY")
        or keys.get("APCA_API_SECRET_KEY")
        or os.getenv("ALPACA_API_SECRET_KEY")
        or os.getenv("APCA_API_SECRET_KEY")
    )
    base = (
        keys.get("ALPACA_PAPER_BASE_URL")
        or os.getenv("ALPACA_PAPER_BASE_URL")
        or DEFAULT_PAPER_BASE
    ).rstrip("/")

    if key_id and secret:
        return key_id.strip(), secret.strip(), base
    return None


def is_alpaca_configured(api_keys: Optional[Dict[str, str]] = None) -> bool:
    return resolve_alpaca_credentials(api_keys) is not None


class AlpacaPaperClient:
    def __init__(self, key_id: str, secret: str, base_url: str = DEFAULT_PAPER_BASE):
        self.base_url = base_url.rstrip("/")
        self._headers = {
            "APCA-API-KEY-ID": key_id,
            "APCA-API-SECRET-KEY": secret,
        }

    @classmethod
    def from_api_keys(cls, api_keys: Optional[Dict[str, str]] = None) -> Optional["AlpacaPaperClient"]:
        creds = resolve_alpaca_credentials(api_keys)
        if not creds:
            return None
        kid, secret, base = creds
        return cls(kid, secret, base)

    async def get_account(self) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                f"{self.base_url}/v2/account",
                headers=self._headers,
            )
            r.raise_for_status()
            return r.json()

    async def get_positions(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                f"{self.base_url}/v2/positions",
                headers=self._headers,
            )
            r.raise_for_status()
            return r.json()

    async def submit_market_order(
        self,
        symbol: str,
        qty: int,
        side: str,
    ) -> Dict[str, Any]:
        payload = {
            "symbol": symbol.upper(),
            "qty": str(qty),
            "side": side,
            "type": "market",
            "time_in_force": "day",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{self.base_url}/v2/orders",
                headers=self._headers,
                json=payload,
            )
            r.raise_for_status()
            return r.json()

    async def execute_decisions(
        self,
        decisions: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Map PM decisions to market orders on Alpaca paper.
        Returns orders list, account snapshot, and positions after submission.
        """
        orders_out: List[Dict[str, Any]] = []

        for ticker, raw in decisions.items():
            if not isinstance(raw, dict):
                continue
            action = str(raw.get("action", "hold")).lower()
            qty = int(raw.get("quantity") or 0)

            if action == "hold" or qty <= 0:
                orders_out.append(
                    {
                        "ticker": ticker.upper(),
                        "action": action,
                        "requested_qty": qty,
                        "status": "skipped",
                        "order_id": None,
                        "error": None,
                    }
                )
                continue

            side = _ACTION_TO_SIDE.get(action)
            if not side:
                orders_out.append(
                    {
                        "ticker": ticker.upper(),
                        "action": action,
                        "requested_qty": qty,
                        "status": "skipped",
                        "order_id": None,
                        "error": f"unknown action: {action}",
                    }
                )
                continue

            try:
                order = await self.submit_market_order(ticker, qty, side)
                orders_out.append(
                    {
                        "ticker": ticker.upper(),
                        "action": action,
                        "requested_qty": qty,
                        "side": side,
                        "status": str(order.get("status", "submitted")),
                        "order_id": order.get("id"),
                        "filled_qty": order.get("filled_qty"),
                        "error": None,
                    }
                )
            except httpx.HTTPStatusError as exc:
                detail = exc.response.text[:500] if exc.response else str(exc)
                logger.warning("Alpaca order failed for %s: %s", ticker, detail)
                orders_out.append(
                    {
                        "ticker": ticker.upper(),
                        "action": action,
                        "requested_qty": qty,
                        "side": side,
                        "status": "failed",
                        "order_id": None,
                        "error": detail,
                    }
                )
            except Exception as exc:
                logger.warning("Alpaca order error for %s: %s", ticker, exc)
                orders_out.append(
                    {
                        "ticker": ticker.upper(),
                        "action": action,
                        "requested_qty": qty,
                        "status": "failed",
                        "order_id": None,
                        "error": str(exc),
                    }
                )

        account: Optional[Dict[str, Any]] = None
        positions: List[Dict[str, Any]] = []
        try:
            account = await self.get_account()
            positions = await self.get_positions()
        except Exception as exc:
            logger.warning("Failed to refresh Alpaca account after orders: %s", exc)

        return {
            "enabled": True,
            "orders": orders_out,
            "account": compact_account(account) if account else None,
            "positions": [compact_position(p) for p in positions],
        }


def compact_account(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "equity": _float(raw.get("equity")),
        "cash": _float(raw.get("cash")),
        "buying_power": _float(raw.get("buying_power")),
        "portfolio_value": _float(raw.get("portfolio_value")),
        "last_equity": _float(raw.get("last_equity")),
        "status": raw.get("status"),
        "currency": raw.get("currency"),
    }


def compact_position(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "symbol": raw.get("symbol"),
        "qty": raw.get("qty"),
        "side": raw.get("side"),
        "market_value": _float(raw.get("market_value")),
        "unrealized_pl": _float(raw.get("unrealized_pl")),
        "unrealized_plpc": _float(raw.get("unrealized_plpc")),
        "current_price": _float(raw.get("current_price")),
        "avg_entry_price": _float(raw.get("avg_entry_price")),
    }


def _float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def run_alpaca_paper_execution(
    decisions: Dict[str, Any],
    api_keys: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Execute paper orders when configured; otherwise return a skipped payload."""
    client = AlpacaPaperClient.from_api_keys(api_keys)
    if not client:
        return {
            "enabled": False,
            "skipped_reason": "Alpaca API keys not configured",
            "orders": [],
            "account": None,
            "positions": [],
        }
    return await client.execute_decisions(decisions)
