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

ALPACA_LEGAL_DISCLAIMER = (
    "Simulated execution via Alpaca paper. THE FLOOR does not provide investment advice."
)

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


def _revision_diff_line(revision_history: Any) -> str:
    if not isinstance(revision_history, list) or not revision_history:
        return ""
    latest = revision_history[-1]
    if not isinstance(latest, dict):
        return ""
    before = latest.get("before") if isinstance(latest.get("before"), dict) else {}
    after = latest.get("after") if isinstance(latest.get("after"), dict) else {}
    parts: list[str] = []
    b_sig, a_sig = before.get("signal"), after.get("signal")
    if b_sig != a_sig:
        parts.append(f"signal: {b_sig or '—'} → {a_sig or '—'}")
    b_conf, a_conf = before.get("confidence"), after.get("confidence")
    if b_conf != a_conf:
        parts.append(f"conf: {b_conf or '—'}% → {a_conf or '—'}%")
    b_pt, a_pt = before.get("price_target"), after.get("price_target")
    if b_pt != a_pt:
        parts.append(
            f"PT: ${b_pt if b_pt is not None else '—'} → ${a_pt if a_pt is not None else '—'}"
        )
    return " · ".join(parts)


def _outlook_line(bucket: dict[str, Any]) -> str:
    pt = bucket.get("price_target")
    horizon = bucket.get("time_horizon_months")
    upside = bucket.get("upside_pct")
    parts: list[str] = []
    if isinstance(pt, (int, float)):
        parts.append(f"PT ${int(pt) if pt >= 100 else pt}")
    if isinstance(horizon, (int, float)) and horizon > 0:
        if horizon >= 12 and horizon % 12 == 0:
            yrs = int(horizon / 12)
            parts.append(f"{yrs}yr" if yrs == 1 else f"{yrs}yr")
        else:
            parts.append(f"{int(horizon)}mo")
    if isinstance(upside, (int, float)):
        sign = "+" if upside > 0 else ""
        parts.append(f"{sign}{upside:.1f}%")
    return " · ".join(parts)


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
        revision_history = bucket.get("revision_history")
        user_consulted = bool(bucket.get("user_consulted"))
        rows.append(
            {
                "name": (
                    f"{_display_name(agent_id)} ✦ revised"
                    if user_consulted
                    else _display_name(agent_id)
                ),
                "signal": signal,
                "confidence": int(float(conf)) if conf is not None else None,
                "summary": _opinion_summary(bucket),
                "user_consulted": user_consulted,
                "revision_history": revision_history,
                "revision_diff": _revision_diff_line(revision_history),
                "outlook": _outlook_line(bucket),
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


def build_chair_impact_html(chair_impact: dict[str, Any] | None) -> str:
    if not chair_impact or not chair_impact.get("consult_count"):
        return ""

    consult_count = int(chair_impact.get("consult_count") or 0)
    material_count = int(chair_impact.get("material_count") or 0)
    decisions = chair_impact.get("decisions") or {}
    revisions = chair_impact.get("revisions") or []

    pm_changes = [
        (t, d)
        for t, d in decisions.items()
        if isinstance(d, dict) and d.get("changed")
    ]
    headline = (
        f"{consult_count} consults · {material_count} material"
        + (f" · PM action changed on {', '.join(t for t, _ in pm_changes)}" if pm_changes else "")
    )

    ticker_blocks = ""
    for ticker, rev_block in decisions.items():
        if not isinstance(rev_block, dict):
            continue
        before = rev_block.get("before") or {}
        after = rev_block.get("after") or before
        if not rev_block.get("changed") and not any(
            r.get("prompt") for r in revisions if isinstance(r, dict)
        ):
            continue
        b_act = str(before.get("action") or "hold").upper()
        a_act = str(after.get("action") or "hold").upper()
        b_conf = before.get("confidence")
        a_conf = after.get("confidence")
        conf_html = ""
        if b_conf is not None or a_conf is not None:
            conf_html = (
                f' <span style="color:{FAINT};">{b_conf or "—"}%</span>'
                f' → <span style="color:{INK};">{a_conf or "—"}%</span>'
            )
        consult_lines = ""
        for rev in revisions:
            if not isinstance(rev, dict):
                continue
            prompt = rev.get("prompt") or ""
            after_rev = rev.get("after") or {}
            before_rev = rev.get("before") or {}
            if not prompt:
                continue
            consult_lines += (
                f'<div style="margin-top:6px;font-size:11px;color:{INK_SOFT};line-height:1.45;">'
                f'"{html.escape(prompt[:160])}" → '
                f'{html.escape(str(after_rev.get("signal") or "—"))} '
                f'{html.escape(str(after_rev.get("confidence") or "—"))}%'
                f' (was {html.escape(str(before_rev.get("signal") or "—"))} '
                f'{html.escape(str(before_rev.get("confidence") or "—"))}%)'
                f"</div>"
            )
        ticker_blocks += f"""
        <div style="margin-top:14px;padding-top:10px;border-top:1px solid {HAIR};">
          <div style="font-size:12px;font-weight:700;color:{INK};">{html.escape(str(ticker))}</div>
          <div style="margin-top:4px;font-size:11px;color:{BRASS};">{b_act}{conf_html} → {a_act}</div>
          {consult_lines}
        </div>"""

    if not ticker_blocks and not revisions:
        return ""

    return f"""
        <tr><td style="padding:18px 24px;border-top:2px solid {BRASS}55;background:rgba(165,126,34,0.05);">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.24em;color:{BRASS};">CHANGED BY CHAIR</div>
          <div style="margin-top:6px;font-size:10px;letter-spacing:0.12em;color:{INK_SOFT};">{html.escape(headline)}</div>
          {ticker_blocks}
        </td></tr>"""


def build_chair_impact_text(chair_impact: dict[str, Any] | None) -> list[str]:
    if not chair_impact or not chair_impact.get("consult_count"):
        return []

    consult_count = int(chair_impact.get("consult_count") or 0)
    material_count = int(chair_impact.get("material_count") or 0)
    decisions = chair_impact.get("decisions") or {}
    revisions = chair_impact.get("revisions") or []

    pm_changes = [
        t
        for t, d in decisions.items()
        if isinstance(d, dict) and d.get("changed")
    ]
    headline = f"{consult_count} consults · {material_count} material"
    if pm_changes:
        headline += f" · PM action changed on {', '.join(pm_changes)}"

    lines: list[str] = ["", "CHANGED BY CHAIR", headline, ""]

    for ticker, rev_block in decisions.items():
        if not isinstance(rev_block, dict) or not rev_block.get("changed"):
            continue
        before = rev_block.get("before") or {}
        after = rev_block.get("after") or before
        b_act = str(before.get("action") or "hold").upper()
        a_act = str(after.get("action") or "hold").upper()
        b_conf = before.get("confidence")
        a_conf = after.get("confidence")
        conf_txt = ""
        if b_conf is not None or a_conf is not None:
            conf_txt = f" ({b_conf or '—'}% → {a_conf or '—'}%)"
        lines.append(f"{ticker}: {b_act}{conf_txt} → {a_act}")

    for rev in revisions:
        if not isinstance(rev, dict):
            continue
        prompt = rev.get("prompt") or ""
        if not prompt:
            continue
        after_rev = rev.get("after") or {}
        before_rev = rev.get("before") or {}
        lines.append(
            f'  @consult: "{prompt[:160]}" → '
            f'{after_rev.get("signal") or "—"} {after_rev.get("confidence") or "—"}% '
            f'(was {before_rev.get("signal") or "—"} {before_rev.get("confidence") or "—"}%)'
        )

    return lines


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
            revised_badge = ""
            if op.get("user_consulted") and op.get("revision_history"):
                revised_badge = (
                    f'<span style="display:inline-block;margin-right:6px;padding:1px 5px;'
                    f'border:1px solid {BRASS}88;color:{BRASS};font-size:9px;'
                    f'font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">'
                    f"revised</span>"
                )
            outlook_html = ""
            if op.get("outlook"):
                outlook_html = (
                    f'<div style="margin-top:3px;font-size:10px;color:{FAINT};">'
                    f'{html.escape(op["outlook"])}</div>'
                )
            diff_html = ""
            if op.get("revision_diff"):
                diff_html = (
                    f'<div style="margin-top:3px;font-size:10px;color:{BRASS};">'
                    f'{html.escape(op["revision_diff"])}</div>'
                )
            vote_rows += f"""
            <tr>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{INK};font-size:12px;">{html.escape(op["name"])}</td>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{sig_color};font-size:11px;font-weight:700;text-transform:uppercase;">{html.escape(op["signal"])}</td>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};font-size:11px;">{conf_txt}</td>
              <td style="padding:6px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};font-size:11px;line-height:1.45;">{revised_badge}{html.escape(op["summary"])}{outlook_html}{diff_html}</td>
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

        reasoning_html = ""
        reasoning = action.get("reasoning") if isinstance(action, dict) else None
        if isinstance(reasoning, str) and reasoning.strip():
            excerpt = reasoning.strip().replace("\n", " ")
            if len(excerpt) > 320:
                excerpt = excerpt[:317] + "…"
            reasoning_html = (
                f'<p style="margin-top:10px;font-size:12px;line-height:1.5;color:{INK_SOFT};">'
                f"{html.escape(excerpt)}</p>"
            )

        dossier_html = ""
        dossiers = complete_payload.get("ticker_dossiers") or {}
        dossier = dossiers.get(ticker) if isinstance(dossiers, dict) else None
        if isinstance(dossier, dict):
            facts = dossier.get("facts") or []
            claims = dossier.get("claims") or []
            disputes = dossier.get("disputes") or []
            if facts or claims or disputes:
                dispute_lines = ""
                for d in disputes[:3]:
                    if isinstance(d, dict):
                        dispute_lines += (
                            f'<div style="font-size:11px;color:{RED};margin-top:4px;">'
                            f"⚑ {html.escape(str(d.get('summary') or d.get('kind') or ''))}</div>"
                        )
                dossier_html = (
                    f'<div style="margin-top:12px;font-size:10px;letter-spacing:0.16em;'
                    f'text-transform:uppercase;color:{FAINT};">Dossier · '
                    f"{len(facts)} facts · {len(claims)} claims"
                    f'{f" · {len(disputes)} disputes" if disputes else ""}</div>'
                    f"{dispute_lines}"
                )

        risk_html = ""
        risk_pipeline = complete_payload.get("risk_pipeline") or {}
        risk = risk_pipeline.get(ticker) if isinstance(risk_pipeline, dict) else None
        if isinstance(risk, dict):
            inventory = risk.get("inventory") or []
            scenarios = risk.get("scenarios") or []
            if inventory or scenarios:
                risk_lines = ""
                for r in inventory[:4]:
                    if isinstance(r, dict):
                        risk_lines += (
                            f'<div style="font-size:11px;color:{INK_SOFT};margin-top:3px;">'
                            f"• {html.escape(str(r.get('title') or ''))}</div>"
                        )
                risk_html = (
                    f'<div style="margin-top:12px;font-size:10px;letter-spacing:0.16em;'
                    f'text-transform:uppercase;color:{FAINT};">Risk · '
                    f"{len(inventory)} risks · {len(scenarios)} scenarios</div>"
                    f"{risk_lines}"
                )

        position_blocks.append(
            f"""
        <tr><td style="padding:18px 24px;border-top:1px solid {HAIR};">
          <div style="font-size:18px;font-weight:700;color:{INK};letter-spacing:0.06em;">{html.escape(ticker)}</div>
          <div style="margin-top:8px;">
            <span style="display:inline-block;padding:6px 10px;border:1px solid {color}66;color:{color};font-size:12px;font-weight:700;letter-spacing:0.14em;">{label}{qty_html}</span>
          </div>
          {conv_html}
          {reasoning_html}
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
          {dossier_html}
          {risk_html}
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
            fill = o.get("filled_avg_price")
            ref = o.get("ref_price")
            fill_txt = f"${float(fill):.2f}" if fill is not None else "—"
            ref_txt = f"${float(ref):.2f}" if ref is not None else "—"
            order_rows += f"""
            <tr>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{INK};">{html.escape(str(o.get("ticker", "")))}</td>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};">{html.escape(str(o.get("action", "")))}</td>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{INK_SOFT};">{html.escape(str(o.get("requested_qty", "")))}</td>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{INK};">{html.escape(fill_txt)}</td>
              <td style="padding:4px 8px;border-top:1px solid {HAIR};color:{FAINT};">{html.escape(ref_txt)}</td>
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

    chair_html = build_chair_impact_html(complete_payload.get("chair_impact"))

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
        {chair_html}
        {paper_html}
        <tr><td style="padding:20px 24px;border-top:1px solid {HAIR};">
          <div style="font-size:20px;font-style:italic;color:{INK};">The Boss</div>
          <div style="margin-top:6px;font-size:9px;letter-spacing:0.18em;color:{FAINT};">{n_pos} POSITION{"S" if n_pos != 1 else ""} · {footer_note}</div>
          <div style="margin-top:12px;font-size:9px;letter-spacing:0.2em;color:{BRASS};">◆ SIGNED OFF</div>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:10px;color:#807A6B;text-align:center;">THE FLOOR shift digest</p>
      <p style="margin:8px 0 0;font-size:9px;color:#807A6B;text-align:center;line-height:1.45;">{html.escape(ALPACA_LEGAL_DISCLAIMER)}</p>
    </td></tr>
  </table>
</body></html>"""


def build_memo_text(
    *,
    complete_payload: dict[str, Any],
    tickers: list[str],
) -> str:
    """Plain-text boss memo for Resend multipart accessibility."""
    decisions = complete_payload.get("decisions") or {}
    analyst_signals = complete_payload.get("analyst_signals") or {}
    paper = complete_payload.get("paper_trading")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    lines: list[str] = [
        "BOSS MEMO",
        "PORTFOLIO MANAGER → TRADING DESK",
        f"{stamp} UTC",
        "",
    ]

    if not isinstance(decisions, dict) or not decisions:
        lines.append("NO DECISIONS RETURNED")
    else:
        for ticker, raw in decisions.items():
            action = raw if isinstance(raw, dict) else {}
            act = str(action.get("action") or "hold").upper()
            qty = action.get("quantity")
            conf = action.get("confidence")
            pct = int(float(conf)) if conf is not None else None
            header = f"{ticker} — {act}"
            if qty is not None:
                header += f" {qty}"
            if pct is not None:
                header += f" · {pct}% conviction"
            lines.extend(["", header, "-" * len(header)])

            reasoning = action.get("reasoning")
            if isinstance(reasoning, str) and reasoning.strip():
                lines.append(reasoning.strip())

            opinions = _collect_opinions(ticker, analyst_signals)
            tally = {"bullish": 0, "bearish": 0, "neutral": 0}
            for op in opinions:
                tally[op["signal"]] = tally.get(op["signal"], 0) + 1
            lines.append(
                f"Committee: {tally['bullish']} bull · {tally['bearish']} bear · {tally['neutral']} neutral"
            )
            for op in opinions:
                conf_txt = f"{op['confidence']}%" if op["confidence"] is not None else "—"
                revised = " [revised]" if op.get("user_consulted") else ""
                row = f"  {op['name']}: {op['signal']} ({conf_txt}){revised}"
                if op.get("outlook"):
                    row += f" · {op['outlook']}"
                lines.append(row)
                if op.get("revision_diff"):
                    lines.append(f"    was → now: {op['revision_diff']}")
                if op.get("summary"):
                    lines.append(f"    {op['summary']}")

            dossiers = complete_payload.get("ticker_dossiers") or {}
            dossier = dossiers.get(ticker) if isinstance(dossiers, dict) else None
            if isinstance(dossier, dict):
                disputes = dossier.get("disputes") or []
                if disputes:
                    lines.append("Dossier disputes:")
                    for d in disputes[:3]:
                        if isinstance(d, dict):
                            lines.append(f"  ⚑ {d.get('summary') or d.get('kind')}")

            risk_pipeline = complete_payload.get("risk_pipeline") or {}
            risk = risk_pipeline.get(ticker) if isinstance(risk_pipeline, dict) else None
            if isinstance(risk, dict):
                inventory = risk.get("inventory") or []
                if inventory:
                    lines.append("Risk inventory:")
                    for r in inventory[:4]:
                        if isinstance(r, dict):
                            lines.append(f"  • {r.get('title')}")

    lines.extend(build_chair_impact_text(complete_payload.get("chair_impact")))

    if isinstance(paper, dict) and paper.get("enabled"):
        lines.extend(["", "ALPACA PAPER DESK"])
        acct = paper.get("account") if isinstance(paper.get("account"), dict) else {}
        lines.append(
            f"Equity: {acct.get('equity', '—')} · Cash: {acct.get('cash', '—')}"
        )
        for o in paper.get("orders") or []:
            if isinstance(o, dict):
                fill = o.get("filled_avg_price")
                ref = o.get("ref_price")
                fill_txt = f"${float(fill):.2f}" if fill is not None else "—"
                ref_txt = f"${float(ref):.2f}" if ref is not None else "—"
                lines.append(
                    f"  {o.get('ticker')} {o.get('action')} x{o.get('requested_qty')} "
                    f"fill {fill_txt} ref {ref_txt} — {o.get('status')}"
                )

    n_pos = len(decisions) if isinstance(decisions, dict) else 0
    footer_note = (
        "ALPACA PAPER"
        if isinstance(paper, dict) and paper.get("enabled")
        else "PAPER ONLY"
    )
    lines.extend(
        [
            "",
            "—",
            f"The Boss · {n_pos} POSITION{'S' if n_pos != 1 else ''} · {footer_note}",
            ALPACA_LEGAL_DISCLAIMER,
            "THE FLOOR shift digest",
        ]
    )
    return "\n".join(lines)


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
    text_body = build_memo_text(complete_payload=complete_payload, tickers=tickers)

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
                    "text": text_body,
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
