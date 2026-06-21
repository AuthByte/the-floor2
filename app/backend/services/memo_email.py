"""Boss memo digest emails via Resend."""

from __future__ import annotations

import json
import html
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

from app.backend.services.graph import extract_base_agent_key
from src.utils.analysts import ANALYST_CONFIG
from src.utils.data_feed_keys import DATA_FEED_KEYS

load_dotenv()

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "Boss Memo <onboarding@resend.dev>"

PAPER = "#F4F1E8"
INK = "#16140F"
INK_SOFT = "#4A463C"
FAINT = "#807A6B"
HAIR = "#E2DDD0"
BRASS = "#A57E22"
EMERALD = "#0E9F6E"
RED = "#C8442C"
AMBER = "#B07A1E"

_MEMO_EXCLUDED = frozenset(
    {
        "portfolio_manager",
        "risk_management_agent",
        "debate_chamber",
        "argument_room",
    }
)


def resolve_resend_api_key(api_keys: Optional[dict[str, str]] = None) -> Optional[str]:
    keys = api_keys or {}
    return keys.get("RESEND_API_KEY") or os.getenv("RESEND_API_KEY")


def resolve_resend_from() -> str:
    return os.getenv("RESEND_FROM", DEFAULT_FROM)


def is_resend_configured(api_keys: Optional[dict[str, str]] = None) -> bool:
    return bool(resolve_resend_api_key(api_keys))


def _display_name(agent_id: str) -> str:
    base = extract_base_agent_key(agent_id)
    cfg = ANALYST_CONFIG.get(base, {})
    return cfg.get("display_name", base.replace("_", " ").title())


def _action_style(action: str) -> tuple[str, str]:
    a = (action or "hold").lower()
    if a in ("buy", "cover"):
        return a.upper(), EMERALD
    if a in ("sell", "short"):
        return a.upper(), RED
    if a == "hold":
        return "HOLD", AMBER
    return a.upper(), INK_SOFT


def _is_memo_investor(agent_id: str) -> bool:
    base = extract_base_agent_key(agent_id)
    if base in DATA_FEED_KEYS or base in _MEMO_EXCLUDED:
        return False
    return base in ANALYST_CONFIG


def _opinion_summary(bucket: dict[str, Any]) -> str:
    summary = bucket.get("thesis_summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip()
    reasoning = bucket.get("pre_debate_reasoning") or bucket.get("reasoning")
    if isinstance(reasoning, str):
        text = reasoning.replace("\n", " ").strip()
        if text.startswith("{"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict) and isinstance(parsed.get("reasoning"), str):
                    text = parsed["reasoning"].replace("\n", " ").strip()
            except json.JSONDecodeError:
                pass
        return text[:180] + ("…" if len(text) > 180 else "")
    return ""


def _collect_opinions(
    ticker: str, analyst_signals: dict[str, Any]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for agent_id, by_ticker in analyst_signals.items():
        if not _is_memo_investor(agent_id):
            continue
        if not isinstance(by_ticker, dict):
            continue
        bucket = by_ticker.get(ticker)
        if not isinstance(bucket, dict):
            continue
        signal = str(bucket.get("signal") or "neutral").lower()
        conf = bucket.get("confidence")
        rows.append(
            {
                "name": _display_name(agent_id),
                "signal": signal,
                "confidence": int(float(conf)) if conf is not None else None,
                "summary": _opinion_summary(bucket),
            }
        )

    def sort_key(row: dict[str, Any]) -> tuple[int, int]:
        order = {"bullish": 0, "bearish": 1, "neutral": 2}
        return (order.get(row["signal"], 2), -(row["confidence"] or 0))

    rows.sort(key=sort_key)
    return rows


def _signal_color(signal: str) -> str:
    if signal == "bullish":
        return EMERALD
    if signal == "bearish":
        return RED
    return FAINT


def build_memo_subject(
    *, tickers: list[str], decisions: dict[str, Any] | None
) -> str:
    syms = ", ".join(tickers[:5]) if tickers else "shift"
    if len(tickers) > 5:
        syms += f" +{len(tickers) - 5}"
    if not decisions:
        return f"BOSS MEMO // {syms}"
    actions = [
        str((v or {}).get("action", "hold")).upper()
        for v in decisions.values()
        if isinstance(v, dict)
    ]
    summary = ", ".join(actions[:4]) if actions else "complete"
    return f"BOSS MEMO // {syms} — {summary}"


def build_memo_html(
    *,
    complete_payload: dict[str, Any],
    tickers: list[str],
) -> str:
    decisions = complete_payload.get("decisions") or {}
    analyst_signals = complete_payload.get("analyst_signals") or {}
    paper = complete_payload.get("paper_trading")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    position_blocks: list[str] = []
    for ticker, raw in decisions.items():
        action = raw if isinstance(raw, dict) else {}
        act = str(action.get("action") or "hold")
        label, color = _action_style(act)
        qty = action.get("quantity")
        conf = action.get("confidence")
        pct = int(float(conf)) if conf is not None else None
        opinions = _collect_opinions(ticker, analyst_signals)
        tally = {"bullish": 0, "bearish": 0, "neutral": 0}
        for op in opinions:
            tally[op["signal"]] = tally.get(op["signal"], 0) + 1

        vote_rows = ""
        for op in opinions:
            sig_color = _signal_color(op["signal"])
            conf_txt = f'{op["confidence"]}%' if op["confidence"] is not None else "—"
            vote_rows += f"""
            <tr>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{INK};font-size:12px;">{html.escape(op["name"])}</td>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{sig_color};font-size:11px;font-weight:700;text-transform:uppercase;">{html.escape(op["signal"])}</td>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};font-size:11px;">{conf_txt}</td>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};font-size:11px;line-height:1.45;">{html.escape(op["summary"])}</td>
            </tr>"""

        qty_html = (
            f' <span style="color:{INK_SOFT};">{html.escape(str(qty))}</span>'
            if qty is not None
            else ""
        )
        conv_html = (
            f'<div style="margin-top:8px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:{FAINT};">'
            f'Conviction <span style="color:{color};font-weight:700;">{pct}%</span></div>'
            if pct is not None
            else ""
        )

        position_blocks.append(
            f"""
        <tr><td style="padding:18px 24px;border-top:1px solid {HAIR};">
          <div style="font-size:18px;font-weight:700;color:{INK};letter-spacing:0.06em;">{html.escape(ticker)}</div>
          <div style="margin-top:8px;">
            <span style="display:inline-block;padding:6px 10px;border:1px solid {color}66;color:{color};font-size:12px;font-weight:700;letter-spacing:0.14em;">{label}{qty_html}</span>
          </div>
          {conv_html}
          <div style="margin-top:12px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:{FAINT};">
            Committee · <span style="color:{EMERALD};">{tally["bullish"]} bull</span> ·
            <span style="color:{RED};">{tally["bearish"]} bear</span> ·
            <span style="color:{FAINT};">{tally["neutral"]} neutral</span>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
            <tr style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:{FAINT};">
              <th align="left" style="padding:4px 8px;">Agent</th>
              <th align="left" style="padding:4px 8px;">Vote</th>
              <th align="left" style="padding:4px 8px;">Conf</th>
              <th align="left" style="padding:4px 8px;">Thesis</th>
            </tr>
            {vote_rows}
          </table>
        </td></tr>"""
        )

    if not position_blocks:
        position_blocks.append(
            f"""
        <tr><td style="padding:32px 24px;text-align:center;color:{FAINT};font-size:12px;letter-spacing:0.2em;">
          NO DECISIONS RETURNED
        </td></tr>"""
        )

    paper_html = ""
    if isinstance(paper, dict) and paper.get("enabled"):
        orders = paper.get("orders") or []
        order_rows = ""
        for o in orders:
            if not isinstance(o, dict):
                continue
            st = str(o.get("status") or "")
            st_color = RED if st == "failed" else EMERALD if st not in ("skipped", "") else FAINT
            order_rows += f"""
            <tr>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{INK};">{html.escape(str(o.get("ticker", "")))}</td>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};">{html.escape(str(o.get("action", "")))}</td>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};">{html.escape(str(o.get("requested_qty", "")))}</td>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{st_color};">{html.escape(st)}</td>
            </tr>"""
        acct = paper.get("account") if isinstance(paper.get("account"), dict) else {}
        equity = acct.get("equity")
        cash = acct.get("cash")
        paper_html = f"""
        <tr><td style="padding:16px 24px;border-top:1px solid {HAIR};background:rgba(165,126,34,0.06);">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.24em;color:{BRASS};">ALPACA PAPER DESK</div>
          <div style="margin-top:8px;font-size:11px;color:{INK_SOFT};">
            Equity <span style="color:{INK};">{html.escape(str(equity or "—"))}</span> ·
            Cash <span style="color:{INK};">{html.escape(str(cash or "—"))}</span>
          </div>
          {f'<table width="100%" style="margin-top:10px;border-collapse:collapse;">{order_rows}</table>' if order_rows else ""}
        </td></tr>"""

    n_pos = len(decisions) if isinstance(decisions, dict) else 0
    footer_note = (
        "ALPACA PAPER"
        if isinstance(paper, dict) and paper.get("enabled")
        else "PAPER ONLY"
    )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#1a1814;font-family:Consolas,'Courier New',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:{PAPER};border:1px solid {HAIR};">
        <tr><td style="padding:20px 24px;border-bottom:1px solid {HAIR};">
          <div style="font-size:22px;font-weight:700;color:{INK};">BOSS MEMO</div>
          <div style="margin-top:4px;font-size:10px;letter-spacing:0.22em;color:{INK_SOFT};">PORTFOLIO MANAGER → TRADING DESK</div>
          <div style="margin-top:8px;font-size:9px;letter-spacing:0.16em;color:{FAINT};">{stamp} UTC</div>
        </td></tr>
        {"".join(position_blocks)}
        {paper_html}
        <tr><td style="padding:20px 24px;border-top:1px solid {HAIR};">
          <div style="font-size:20px;font-style:italic;color:{INK};">The Boss</div>
          <div style="margin-top:6px;font-size:9px;letter-spacing:0.18em;color:{FAINT};">{n_pos} POSITION{"S" if n_pos != 1 else ""} · {footer_note}</div>
          <div style="margin-top:12px;font-size:9px;letter-spacing:0.2em;color:{BRASS};">◆ SIGNED OFF</div>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:10px;color:#807A6B;text-align:center;">THE FLOOR shift digest</p>
    </td></tr>
  </table>
</body></html>"""


def _valid_email(addr: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", addr.strip()))


def _friendly_resend_error(status: int, detail: str, recipient: str) -> str:
    lower = detail.lower()
    if "only send testing emails to your own email" in lower or (
        status == 403 and "onboarding@resend.dev" in resolve_resend_from()
    ):
        return (
            f"Resend test mode: with onboarding@resend.dev you can only send to the "
            f"email address on your Resend account (not {recipient}). Verify a domain "
            f"at resend.com/domains and set RESEND_FROM to use that address."
        )
    if status == 401 or "invalid api key" in lower:
        return "Resend rejected the API key — check RESEND_API_KEY in .env or the console field."
    return f"Resend {status}: {detail}"


async def send_memo_digest(
    *,
    to_email: str,
    complete_payload: dict[str, Any],
    tickers: list[str],
    api_keys: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """Send the boss memo HTML email. Returns a result dict for the complete payload."""
    recipient = to_email.strip()
    if not _valid_email(recipient):
        return {
            "enabled": True,
            "sent": False,
            "to": recipient,
            "error": "Invalid email address",
        }

    api_key = resolve_resend_api_key(api_keys)
    if not api_key:
        return {
            "enabled": True,
            "sent": False,
            "to": recipient,
            "error": "RESEND_API_KEY missing — set in .env or pass in api_keys",
        }

    subject = build_memo_subject(
        tickers=tickers, decisions=complete_payload.get("decisions")
    )
    html_body = build_memo_html(complete_payload=complete_payload, tickers=tickers)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": resolve_resend_from(),
                    "to": [recipient],
                    "subject": subject,
                    "html": html_body,
                },
            )
        if resp.status_code >= 400:
            detail = resp.text[:500]
            logger.error("Resend API error %s: %s", resp.status_code, detail)
            friendly = _friendly_resend_error(resp.status_code, detail, recipient)
            return {
                "enabled": True,
                "sent": False,
                "to": recipient,
                "error": friendly,
            }
        data = resp.json()
        return {
            "enabled": True,
            "sent": True,
            "to": recipient,
            "id": data.get("id"),
            "error": None,
        }
    except Exception as exc:
        logger.exception("Memo email failed")
        return {
            "enabled": True,
            "sent": False,
            "to": recipient,
            "error": str(exc),
        }
