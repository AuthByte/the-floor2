"""Member tier entitlements — shift limits, paper trading, social publish."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Literal

import httpx

from app.backend.auth.deps import is_auth_required
from app.backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Set PAYWALL_ENABLED=1 in production when Stripe tiers should block features.
PAYWALL_ENABLED = os.getenv("PAYWALL_ENABLED", "").strip().lower() in ("1", "true", "yes")


def paywall_enabled() -> bool:
    return PAYWALL_ENABLED

Tier = Literal["free", "pro", "day_pass"]

FREE_SHIFTS_PER_MONTH = 2
FREE_MAX_ROSTER = 3
DAY_PASS_HOURS = 24
UNLIMITED_ROSTER = 999

# Dev fallback when Supabase tables are missing or unconfigured.
_mem_profiles: dict[str, dict[str, Any]] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(raw: Any) -> datetime | None:
    if raw is None:
        return None
    try:
        text = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


def invalidate_billing_cache(user_id: str | None = None) -> None:
    if user_id:
        _mem_profiles.pop(user_id, None)
    else:
        _mem_profiles.clear()


def _load_profile(user_id: str) -> dict[str, Any] | None:
    if user_id in _mem_profiles:
        return _mem_profiles[user_id]

    sb = get_supabase()
    if not sb.configured or not sb.service_key:
        return _mem_profiles.get(user_id)

    row = sb.rest_select_one(
        "profiles",
        select=(
            "plan_tier,entitlement_expires_at,stripe_customer_id,"
            "shifts_used_this_period,billing_period_start"
        ),
        filters={"id": user_id},
    )
    if row:
        _mem_profiles[user_id] = row
    return row


def _patch_profile(user_id: str, updates: dict[str, Any]) -> None:
    cached = _mem_profiles.get(user_id, {}).copy()
    cached.update(updates)
    _mem_profiles[user_id] = cached

    sb = get_supabase()
    if not sb.configured or not sb.service_key:
        return
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.patch(
                f"{sb.url}/rest/v1/profiles",
                headers={**sb._service_headers(), "Prefer": "return=minimal"},
                params={"id": f"eq.{user_id}"},
                json=updates,
            )
            if res.status_code >= 400:
                logger.warning("profiles patch failed: %s %s", res.status_code, res.text)
    except Exception as exc:
        logger.warning("profiles patch error: %s", exc)


def _month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _maybe_reset_free_period(user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    period_start = _parse_ts(profile.get("billing_period_start"))
    if not period_start:
        return profile
    current_month = _month_start(_utcnow())
    if _month_start(period_start) >= current_month:
        return profile
    updates = {
        "billing_period_start": current_month.isoformat(),
        "shifts_used_this_period": 0,
    }
    _patch_profile(user_id, updates)
    return {**profile, **updates}


def _effective_tier(user_id: str | None) -> Tier:
    if not user_id:
        return "pro" if not is_auth_required() else "free"

    row = _load_profile(user_id)
    if not row:
        return "free"

    tier = str(row.get("plan_tier") or "free").lower()
    if tier == "day_pass":
        expires = _parse_ts(row.get("entitlement_expires_at"))
        if expires and expires > _utcnow():
            return "day_pass"
        return "free"
    if tier == "pro":
        return "pro"
    return "free"


def _shift_count(user_id: str) -> int:
    row = _load_profile(user_id)
    if not row:
        return 0
    row = _maybe_reset_free_period(user_id, row)
    return int(row.get("shifts_used_this_period") or 0)


def _set_shift_count(user_id: str, count: int) -> None:
    _patch_profile(user_id, {"shifts_used_this_period": count})


def _upgrade_payload(feature: str) -> dict[str, Any]:
    return {
        "feature": feature,
        "tiers": [
            {
                "id": "pro",
                "label": "Pro",
                "price": "$29/mo",
                "checkout_path": "/billing/checkout/pro",
            },
            {
                "id": "day_pass",
                "label": "Day pass",
                "price": "$9",
                "checkout_path": "/billing/checkout/day-pass",
            },
        ],
    }


def paywall_detail(code: str, message: str, feature: str) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "upgrade": _upgrade_payload(feature),
    }


def _paywall_detail(code: str, message: str, feature: str) -> dict[str, Any]:
    return paywall_detail(code, message, feature)


def max_roster_size(user_id: str | None) -> int:
    if not PAYWALL_ENABLED:
        return UNLIMITED_ROSTER
    tier = _effective_tier(user_id)
    if tier in ("pro", "day_pass"):
        return UNLIMITED_ROSTER
    return FREE_MAX_ROSTER


def get_user_entitlements(user_id: str | None) -> dict[str, Any]:
    tier = _effective_tier(user_id)
    shifts_used = _shift_count(user_id) if user_id else 0
    shifts_limit: int | None = None
    if PAYWALL_ENABLED and tier == "free":
        shifts_limit = FREE_SHIFTS_PER_MONTH

    row = _load_profile(user_id) if user_id else None
    day_pass_expires_at = None
    if row:
        expires = _parse_ts(row.get("entitlement_expires_at"))
        if expires:
            day_pass_expires_at = expires.isoformat()

    if not PAYWALL_ENABLED:
        return {
            "tier": tier,
            "shifts_used": shifts_used,
            "shifts_limit": None,
            "shifts_remaining": None,
            "max_roster_size": UNLIMITED_ROSTER,
            "can_run_shift": True,
            "can_use_paper": True,
            "can_publish_social": True,
            "can_use_scheduler": True,
            "shift_block_reason": None,
            "paper_block_reason": None,
            "publish_block_reason": None,
            "scheduler_block_reason": None,
            "day_pass_expires_at": day_pass_expires_at,
            "auth_required": is_auth_required(),
        }

    can_shift, shift_reason, _ = can_run_shift(user_id, roster_size=0)
    paper_ok, paper_reason = can_use_paper(user_id)
    publish_ok, publish_reason = can_publish_social(user_id)
    scheduler_ok, scheduler_reason = can_use_scheduler(user_id)

    return {
        "tier": tier,
        "shifts_used": shifts_used,
        "shifts_limit": shifts_limit,
        "shifts_remaining": (
            max(0, shifts_limit - shifts_used) if shifts_limit is not None else None
        ),
        "max_roster_size": max_roster_size(user_id),
        "can_run_shift": can_shift,
        "can_use_paper": paper_ok,
        "can_publish_social": publish_ok,
        "can_use_scheduler": scheduler_ok,
        "shift_block_reason": shift_reason,
        "paper_block_reason": paper_reason,
        "publish_block_reason": publish_reason,
        "scheduler_block_reason": scheduler_reason,
        "day_pass_expires_at": day_pass_expires_at,
        "auth_required": is_auth_required(),
    }


def can_run_shift(
    user_id: str | None,
    *,
    roster_size: int = 0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    if not PAYWALL_ENABLED:
        return True, None, None
    tier = _effective_tier(user_id)
    limit = max_roster_size(user_id)
    if roster_size > limit:
        msg = f"Free tier allows up to {FREE_MAX_ROSTER} analysts per shift."
        return False, msg, _paywall_detail("roster_limit", msg, "shift")

    if tier in ("pro", "day_pass"):
        return True, None, None

    if not user_id:
        return True, None, None

    used = _shift_count(user_id)
    if used >= FREE_SHIFTS_PER_MONTH:
        msg = f"Free tier includes {FREE_SHIFTS_PER_MONTH} shifts per month. Upgrade for unlimited shifts."
        return False, msg, _paywall_detail("shift_limit", msg, "shift")
    return True, None, None


def can_use_paper(user_id: str | None) -> tuple[bool, str | None]:
    if not PAYWALL_ENABLED:
        return True, None
    tier = _effective_tier(user_id)
    if tier in ("pro", "day_pass"):
        return True, None
    if not user_id and not is_auth_required():
        return True, None
    return False, "Alpaca paper execution requires Pro or a Day pass."


def can_publish_social(user_id: str | None) -> tuple[bool, str | None]:
    if not PAYWALL_ENABLED:
        return True, None
    tier = _effective_tier(user_id)
    if tier in ("pro", "day_pass"):
        return True, None
    if not user_id and not is_auth_required():
        return True, None
    return False, "Publishing to the floor feed requires Pro or a Day pass."


def can_use_scheduler(user_id: str | None) -> tuple[bool, str | None]:
    if not PAYWALL_ENABLED:
        return True, None
    tier = _effective_tier(user_id)
    if tier in ("pro", "day_pass"):
        return True, None
    if not user_id and not is_auth_required():
        return True, None
    return False, "Schedule mode requires Pro or an active day pass."


def increment_shift_count(user_id: str | None) -> None:
    if not PAYWALL_ENABLED:
        return
    if not user_id:
        return
    tier = _effective_tier(user_id)
    if tier in ("pro", "day_pass"):
        return
    used = _shift_count(user_id)
    _set_shift_count(user_id, used + 1)


def grant_day_pass(user_id: str, *, hours: int = DAY_PASS_HOURS) -> None:
    """Test / webhook helper — activate 24h entitlements."""
    from datetime import timedelta

    expires = _utcnow() + timedelta(hours=hours)
    _patch_profile(
        user_id,
        {
            "plan_tier": "day_pass",
            "entitlement_expires_at": expires.isoformat(),
        },
    )


def set_tier(user_id: str, tier: Tier) -> None:
    """Test / webhook helper."""
    _patch_profile(
        user_id,
        {
            "plan_tier": tier,
            "entitlement_expires_at": None,
        },
    )


def reset_usage(user_id: str | None = None) -> None:
    """Test helper — clear in-memory billing cache."""
    invalidate_billing_cache(user_id)
