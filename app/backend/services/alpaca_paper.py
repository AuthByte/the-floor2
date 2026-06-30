"""Submit portfolio-manager decisions to Alpaca's paper trading API."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
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


def is_alpaca_paper_disabled() -> bool:
    return os.getenv("ALPACA_PAPER_DISABLED", "").strip().lower() in ("1", "true", "yes")


def alpaca_credential_source(api_keys: Optional[Dict[str, str]] = None) -> str:
    """Return env, request, or none — no secrets."""
    if is_alpaca_paper_disabled():
        return "none"
    keys = api_keys or {}
    has_request = bool(
        (keys.get("ALPACA_API_KEY_ID") or keys.get("APCA_API_KEY_ID"))
        and (keys.get("ALPACA_API_SECRET_KEY") or keys.get("APCA_API_SECRET_KEY"))
    )
    if has_request:
        return "request"
    if resolve_alpaca_credentials(None):
        return "env"
    return "none"


def build_paper_summary(
    orders: List[Dict[str, Any]],
    account: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    submitted = sum(
        1
        for o in orders
        if o.get("status") not in ("skipped",)
        and int(o.get("requested_qty") or 0) > 0
    )
    filled = sum(
        1 for o in orders if str(o.get("status", "")).lower() == "filled"
    )
    failed = sum(1 for o in orders if o.get("status") == "failed")
    equity = account.get("equity") if account else None
    last_equity = account.get("last_equity") if account else None
    day_pnl: Optional[float] = None
    if equity is not None and last_equity is not None:
        day_pnl = equity - last_equity
    return {
        "orders_submitted": submitted,
        "orders_filled": filled,
        "orders_failed": failed,
        "day_pnl": day_pnl,
        "equity": equity,
    }


def _ref_price_for_ticker(
    ticker: str,
    current_prices: Optional[Dict[str, Any]],
) -> Optional[float]:
    if not current_prices:
        return None
    sym = ticker.upper()
    for key in (sym, ticker, ticker.lower()):
        if key in current_prices:
            return _float(current_prices[key])
    return None


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

    async def get_orders(self, limit: int = 20) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                f"{self.base_url}/v2/orders",
                headers=self._headers,
                params={"status": "all", "limit": limit, "direction": "desc"},
            )
            r.raise_for_status()
            return r.json()

    async def get_account_snapshot(self, order_limit: int = 20) -> Dict[str, Any]:
        account = await self.get_account()
        positions = await self.get_positions()
        orders = await self.get_orders(limit=order_limit)
        return {
            "account": compact_account(account),
            "positions": [compact_position(p) for p in positions],
            "orders": [compact_order(o) for o in orders],
        }

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
        current_prices: Optional[Dict[str, Any]] = None,
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

            ref_price = _ref_price_for_ticker(ticker, current_prices)

            if action == "hold" or qty <= 0:
                orders_out.append(
                    {
                        "ticker": ticker.upper(),
                        "action": action,
                        "requested_qty": qty,
                        "status": "skipped",
                        "order_id": None,
                        "ref_price": ref_price,
                        "filled_avg_price": None,
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
                        "ref_price": ref_price,
                        "filled_avg_price": None,
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
                        "filled_avg_price": _float(order.get("filled_avg_price")),
                        "ref_price": ref_price,
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
                        "ref_price": ref_price,
                        "filled_avg_price": None,
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
                        "ref_price": ref_price,
                        "filled_avg_price": None,
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

        compacted_account = compact_account(account) if account else None
        return {
            "enabled": True,
            "orders": orders_out,
            "account": compacted_account,
            "positions": [compact_position(p) for p in positions],
            "summary": build_paper_summary(orders_out, compacted_account),
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


def compact_order(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": raw.get("id"),
        "symbol": raw.get("symbol"),
        "side": raw.get("side"),
        "qty": raw.get("qty"),
        "filled_qty": raw.get("filled_qty"),
        "filled_avg_price": _float(raw.get("filled_avg_price")),
        "status": raw.get("status"),
        "type": raw.get("type"),
        "submitted_at": raw.get("submitted_at"),
        "filled_at": raw.get("filled_at"),
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
    *,
    current_prices: Optional[Dict[str, Any]] = None,
    shift_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute paper orders when configured; otherwise return a skipped payload."""
    if is_alpaca_paper_disabled():
        return {
            "enabled": False,
            "skipped_reason": "Alpaca paper execution disabled by operator",
            "shift_id": shift_id,
            "orders": [],
            "account": None,
            "positions": [],
        }
    client = AlpacaPaperClient.from_api_keys(api_keys)
    if not client:
        return {
            "enabled": False,
            "skipped_reason": "Alpaca API keys not configured",
            "shift_id": shift_id,
            "orders": [],
            "account": None,
            "positions": [],
        }
    result = await client.execute_decisions(decisions, current_prices=current_prices)
    result["shift_id"] = shift_id
    result["executed_at"] = datetime.now(timezone.utc).isoformat()
    if "summary" not in result:
        result["summary"] = build_paper_summary(
            result.get("orders", []),
            result.get("account"),
        )
    n_ok = sum(
        1
        for o in result.get("orders", [])
        if o.get("status") not in ("failed", "skipped") and o.get("order_id")
    )
    logger.info(
        "Alpaca paper shift=%s orders_submitted=%s filled=%s",
        shift_id,
        result.get("summary", {}).get("orders_submitted", n_ok),
        result.get("summary", {}).get("orders_filled", 0),
    )
    return result
