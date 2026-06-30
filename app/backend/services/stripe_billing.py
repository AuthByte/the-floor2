"""Stripe Checkout, Customer Portal, and webhook-driven entitlements."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from app.backend.services.entitlements import (
    DAY_PASS_HOURS,
    FREE_SHIFTS_PER_MONTH,
    Tier,
    _parse_ts,
    _utcnow,
    invalidate_billing_cache,
)

logger = logging.getLogger(__name__)

CheckoutPlan = Literal["pro_monthly", "pro_yearly", "day_pass"]

_STRIPE_NOT_CONFIGURED = "Stripe billing is not configured (dev mode)."


class StripeBillingError(Exception):
    """Base billing error."""


class StripeNotConfiguredError(StripeBillingError):
    """Raised when Stripe env vars are missing."""


class WebhookPayloadError(StripeBillingError):
    """Invalid webhook body."""


class WebhookSignatureError(StripeBillingError):
    """Stripe signature verification failed."""


def _stripe_secret() -> str | None:
    key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    return key or None


def _webhook_secret() -> str | None:
    secret = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
    return secret or None


def _price_id(plan: CheckoutPlan) -> str | None:
    mapping = {
        "pro_monthly": "STRIPE_PRICE_PRO_MONTHLY",
        "pro_yearly": "STRIPE_PRICE_PRO_YEARLY",
        "day_pass": "STRIPE_PRICE_DAY_PASS",
    }
    return (os.getenv(mapping[plan]) or "").strip() or None


def is_stripe_configured() -> bool:
    return bool(_stripe_secret())


def stripe_dev_message() -> str:
    return _STRIPE_NOT_CONFIGURED


def _require_stripe() -> Any:
    if not is_stripe_configured():
        raise StripeNotConfiguredError(_STRIPE_NOT_CONFIGURED)
    import stripe

    stripe.api_key = _stripe_secret()
    return stripe


def _profile_select(user_id: str) -> dict[str, Any] | None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured or not sb.service_key:
        return None
    return sb.rest_select_one(
        "profiles",
        select=(
            "plan_tier,stripe_customer_id,stripe_subscription_id,"
            "entitlement_expires_at,shifts_used_this_period,billing_period_start"
        ),
        filters={"id": user_id},
    )


def _profile_patch(user_id: str, updates: dict[str, Any]) -> None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if sb.configured and sb.service_key:
        with httpx.Client(timeout=30.0) as client:
            res = client.patch(
                f"{sb.url}/rest/v1/profiles",
                headers={**sb._service_headers(), "Prefer": "return=minimal"},
                params={"id": f"eq.{user_id}"},
                json=updates,
            )
            if res.status_code >= 400:
                logger.warning("profiles billing patch failed: %s %s", res.status_code, res.text)
    invalidate_billing_cache(user_id)


def _billing_event_exists(stripe_event_id: str) -> bool:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured or not sb.service_key:
        return False
    row = sb.rest_select_one(
        "billing_events",
        select="id",
        filters={"stripe_event_id": stripe_event_id},
    )
    return row is not None


def _log_billing_event(
    *,
    user_id: str | None,
    stripe_event_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured or not sb.service_key:
        return
    row = {
        "user_id": user_id,
        "stripe_event_id": stripe_event_id,
        "event_type": event_type,
        "payload": payload,
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.post(
                f"{sb.url}/rest/v1/billing_events",
                headers={**sb._service_headers(), "Prefer": "return=minimal"},
                json=row,
            )
            if res.status_code >= 400:
                logger.warning("billing_events insert failed: %s %s", res.status_code, res.text)
    except Exception as exc:
        logger.warning("billing_events insert error: %s", exc)


def _effective_plan_tier(profile: dict[str, Any] | None) -> Tier:
    if not profile:
        return "free"
    tier = str(profile.get("plan_tier") or "free").lower()
    if tier == "day_pass":
        expires = _parse_ts(profile.get("entitlement_expires_at"))
        if expires and expires > _utcnow():
            return "day_pass"
        return "free"
    if tier == "pro":
        return "pro"
    return "free"


def _user_id_from_customer(customer_id: str | None) -> str | None:
    if not customer_id:
        return None
    from app.backend.services.supabase_client import get_supabase

    sb = get_supabase()
    if not sb.configured or not sb.service_key:
        return None
    row = sb.rest_select_one(
        "profiles",
        select="id",
        filters={"stripe_customer_id": customer_id},
    )
    if row and row.get("id"):
        return str(row["id"])
    return None


def _ensure_customer(user_id: str, *, email: str | None = None) -> str:
    profile = _profile_select(user_id) or {}
    existing = profile.get("stripe_customer_id")
    if existing:
        return str(existing)

    stripe = _require_stripe()
    params: dict[str, Any] = {"metadata": {"user_id": user_id}}
    if email:
        params["email"] = email
    customer = stripe.Customer.create(**params)
    _profile_patch(user_id, {"stripe_customer_id": customer.id})
    return customer.id


def create_checkout_session(
    user_id: str,
    plan: CheckoutPlan,
    *,
    success_url: str,
    cancel_url: str,
    email: str | None = None,
) -> dict[str, str]:
    stripe = _require_stripe()
    price = _price_id(plan)
    if not price:
        raise StripeNotConfiguredError(f"Missing Stripe price env for plan {plan}")

    customer_id = _ensure_customer(user_id, email=email)
    metadata = {"user_id": user_id, "plan": plan}

    if plan == "day_pass":
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="payment",
            line_items=[{"price": price, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
        )
    else:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
            subscription_data={"metadata": metadata},
        )

    return {"url": session.url or "", "session_id": session.id}


def create_portal_session(user_id: str, *, return_url: str) -> dict[str, str]:
    stripe = _require_stripe()
    profile = _profile_select(user_id) or {}
    customer_id = profile.get("stripe_customer_id")
    if not customer_id:
        raise StripeBillingError("No Stripe customer on file. Complete checkout first.")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return {"url": session.url or ""}


def get_billing_status(user_id: str | None) -> dict[str, Any]:
    from app.backend.services.entitlements import get_user_entitlements

    ent = get_user_entitlements(user_id)
    profile = _profile_select(user_id) if user_id else None
    sub_id = (profile or {}).get("stripe_subscription_id")
    return {
        "plan_tier": ent["tier"],
        "shifts_used_this_period": ent["shifts_used"],
        "shifts_limit": ent["shifts_limit"],
        "entitlement_expires_at": ent.get("day_pass_expires_at"),
        "has_subscription": bool(sub_id and ent["tier"] == "pro"),
        "can_use_scheduler": ent.get("can_use_scheduler", False),
        "can_use_paper": ent.get("can_use_paper", False),
        "can_publish_social": ent.get("can_publish_social", False),
        "scheduler_block_reason": ent.get("scheduler_block_reason"),
    }


def _activate_day_pass(user_id: str) -> None:
    expires = _utcnow() + timedelta(hours=DAY_PASS_HOURS)
    _profile_patch(
        user_id,
        {
            "plan_tier": "day_pass",
            "entitlement_expires_at": expires.isoformat(),
        },
    )


def _activate_pro(user_id: str, *, subscription_id: str | None) -> None:
    now = _utcnow()
    updates: dict[str, Any] = {
        "plan_tier": "pro",
        "entitlement_expires_at": None,
        "billing_period_start": now.isoformat(),
        "shifts_used_this_period": 0,
    }
    if subscription_id:
        updates["stripe_subscription_id"] = subscription_id
    _profile_patch(user_id, updates)


def _downgrade_free(user_id: str) -> None:
    _profile_patch(
        user_id,
        {
            "plan_tier": "free",
            "stripe_subscription_id": None,
            "entitlement_expires_at": None,
        },
    )


def _handle_checkout_completed(session: dict[str, Any]) -> None:
    metadata = session.get("metadata") or {}
    user_id = metadata.get("user_id") or _user_id_from_customer(session.get("customer"))
    if not user_id:
        logger.warning("checkout.session.completed without resolvable user_id")
        return

    plan = str(metadata.get("plan") or "")
    mode = session.get("mode")
    if mode == "payment" or plan == "day_pass":
        _activate_day_pass(user_id)
        return

    subscription_id = session.get("subscription")
    _activate_pro(user_id, subscription_id=str(subscription_id) if subscription_id else None)


def _handle_subscription_updated(subscription: dict[str, Any]) -> None:
    user_id = (subscription.get("metadata") or {}).get("user_id")
    if not user_id:
        user_id = _user_id_from_customer(subscription.get("customer"))
    if not user_id:
        return

    status = str(subscription.get("status") or "")
    sub_id = subscription.get("id")
    if status in ("active", "trialing"):
        _activate_pro(user_id, subscription_id=str(sub_id) if sub_id else None)
    elif status in ("canceled", "unpaid", "incomplete_expired"):
        _downgrade_free(user_id)


def _handle_subscription_deleted(subscription: dict[str, Any]) -> None:
    user_id = (subscription.get("metadata") or {}).get("user_id")
    if not user_id:
        user_id = _user_id_from_customer(subscription.get("customer"))
    if user_id:
        _downgrade_free(user_id)


def _handle_invoice_paid(invoice: dict[str, Any]) -> None:
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return

    customer_id = invoice.get("customer")
    user_id = _user_id_from_customer(str(customer_id) if customer_id else None)
    if not user_id:
        return

    now = _utcnow()
    _profile_patch(
        user_id,
        {
            "billing_period_start": now.isoformat(),
            "shifts_used_this_period": 0,
            "stripe_subscription_id": str(subscription_id),
            "plan_tier": "pro",
        },
    )


def handle_webhook(payload: bytes, sig_header: str | None) -> dict[str, Any]:
    if not is_stripe_configured() or not _webhook_secret():
        raise StripeNotConfiguredError(_STRIPE_NOT_CONFIGURED)
    if not sig_header:
        raise WebhookSignatureError("Missing stripe-signature header")

    stripe = _require_stripe()
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, _webhook_secret())
    except ValueError as exc:
        raise WebhookPayloadError("Invalid webhook payload") from exc
    except stripe.error.SignatureVerificationError as exc:
        raise WebhookSignatureError("Invalid webhook signature") from exc

    event_id = event["id"]
    if _billing_event_exists(event_id):
        return {"ok": True, "duplicate": True, "type": event["type"]}

    event_type = event["type"]
    data_object = event["data"]["object"]
    user_id: str | None = None

    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata") or {}
        user_id = metadata.get("user_id")
        if not user_id:
            user_id = _user_id_from_customer(data_object.get("customer"))
        _handle_checkout_completed(data_object)
    elif event_type == "customer.subscription.updated":
        user_id = (data_object.get("metadata") or {}).get("user_id")
        if not user_id:
            user_id = _user_id_from_customer(data_object.get("customer"))
        _handle_subscription_updated(data_object)
    elif event_type == "customer.subscription.deleted":
        user_id = (data_object.get("metadata") or {}).get("user_id")
        if not user_id:
            user_id = _user_id_from_customer(data_object.get("customer"))
        _handle_subscription_deleted(data_object)
    elif event_type == "invoice.paid":
        customer_id = data_object.get("customer")
        user_id = _user_id_from_customer(str(customer_id) if customer_id else None)
        _handle_invoice_paid(data_object)

    _log_billing_event(
        user_id=user_id,
        stripe_event_id=event_id,
        event_type=event_type,
        payload=dict(event),
    )
    return {"ok": True, "type": event_type}
