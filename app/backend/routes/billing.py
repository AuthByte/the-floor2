"""Stripe billing — checkout, portal, webhooks, and status."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, HttpUrl

from app.backend.auth.deps import require_user, user_id_from_claims
from app.backend.services.entitlements import can_publish_social, paywall_detail
from app.backend.services.stripe_billing import (
    CheckoutPlan,
    StripeBillingError,
    StripeNotConfiguredError,
    WebhookPayloadError,
    WebhookSignatureError,
    create_checkout_session,
    create_portal_session,
    get_billing_status,
    handle_webhook,
    is_stripe_configured,
    stripe_dev_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

_DEFAULT_SUCCESS = "http://localhost:5173/account?billing=success"
_DEFAULT_CANCEL = "http://localhost:5173/pricing?billing=cancel"


class CheckoutRequest(BaseModel):
    plan: CheckoutPlan
    success_url: HttpUrl | None = None
    cancel_url: HttpUrl | None = None


class CheckoutSessionResponse(BaseModel):
    url: str
    session_id: str | None = None


class PortalRequest(BaseModel):
    return_url: HttpUrl | None = None


class PortalResponse(BaseModel):
    url: str


def _stripe_unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail=stripe_dev_message())


def _require_user_id(user_claims: dict | None) -> str:
    user_id = user_id_from_claims(user_claims)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user_id


@router.get("/status")
async def billing_status(user_claims: dict | None = Depends(require_user)) -> dict:
    user_id = user_id_from_claims(user_claims)
    return get_billing_status(user_id)


@router.post("/checkout", response_model=CheckoutSessionResponse)
async def checkout(
    body: CheckoutRequest,
    user_claims: dict | None = Depends(require_user),
) -> CheckoutSessionResponse:
    if not is_stripe_configured():
        raise _stripe_unavailable()
    user_id = _require_user_id(user_claims)
    email = (user_claims or {}).get("email")
    try:
        result = create_checkout_session(
            user_id,
            body.plan,
            success_url=str(body.success_url or _DEFAULT_SUCCESS),
            cancel_url=str(body.cancel_url or _DEFAULT_CANCEL),
            email=str(email) if email else None,
        )
    except StripeNotConfiguredError as exc:
        raise _stripe_unavailable() from exc
    except StripeBillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CheckoutSessionResponse(url=result["url"], session_id=result.get("session_id"))


@router.post("/checkout/pro", response_model=CheckoutSessionResponse)
async def checkout_pro_legacy(
    user_claims: dict | None = Depends(require_user),
) -> CheckoutSessionResponse:
    """Backward-compatible alias for monthly Pro checkout."""
    return await checkout(CheckoutRequest(plan="pro_monthly"), user_claims)


@router.post("/checkout/day-pass", response_model=CheckoutSessionResponse)
async def checkout_day_pass_legacy(
    user_claims: dict | None = Depends(require_user),
) -> CheckoutSessionResponse:
    """Backward-compatible alias for day-pass checkout."""
    return await checkout(CheckoutRequest(plan="day_pass"), user_claims)


@router.get("/portal", response_model=PortalResponse)
async def portal_get(
    return_url: str | None = None,
    user_claims: dict | None = Depends(require_user),
) -> PortalResponse:
    return await _open_portal(return_url, user_claims)


@router.post("/portal", response_model=PortalResponse)
async def portal_post(
    body: PortalRequest | None = None,
    user_claims: dict | None = Depends(require_user),
) -> PortalResponse:
    return_url = str(body.return_url) if body and body.return_url else None
    return await _open_portal(return_url, user_claims)


async def _open_portal(return_url: str | None, user_claims: dict | None) -> PortalResponse:
    if not is_stripe_configured():
        raise _stripe_unavailable()
    user_id = _require_user_id(user_claims)
    try:
        result = create_portal_session(
            user_id,
            return_url=return_url or "http://localhost:5173/account",
        )
    except StripeNotConfiguredError as exc:
        raise _stripe_unavailable() from exc
    except StripeBillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PortalResponse(url=result["url"])


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    if not is_stripe_configured():
        raise _stripe_unavailable()
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        return handle_webhook(payload, sig)
    except WebhookSignatureError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WebhookPayloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StripeNotConfiguredError as exc:
        raise _stripe_unavailable() from exc
    except Exception as exc:
        logger.exception("Stripe webhook handler failed")
        raise HTTPException(status_code=500, detail="Webhook processing failed") from exc


@router.get("/gate/publish")
async def gate_publish(user_claims: dict | None = Depends(require_user)) -> dict:
    """Preflight for client-side floor_posts insert."""
    user_id = user_id_from_claims(user_claims)
    ok, reason = can_publish_social(user_id)
    if not ok:
        raise HTTPException(
            status_code=402,
            detail=paywall_detail(
                "publish_blocked",
                reason or "Publishing requires upgrade",
                "publish",
            ),
        )
    return {"allowed": True}
