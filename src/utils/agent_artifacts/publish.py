"""Top-level glue: plan → render → save → return artifact metadata.

The backend route is expected to call `set_run_artifact_root(run_id)` at the
start of each shift. If that hasn't been called, we fall back to a
process-local default under `app/backend/static/artifacts/_unscoped`.
"""

from __future__ import annotations

import logging
import re
import shutil
import time
from pathlib import Path
from typing import Any

from src.utils.agent_artifacts.custom import CUSTOM_CHART_ID, plan_custom_chart
from src.utils.agent_artifacts.plan import plan_charts
from src.utils.agent_artifacts.registry import eligible_specs, spec_by_id
from src.utils.agent_artifacts.render import figure_pixel_size, figure_to_png_bytes
from src.utils.agent_artifacts.sandbox import run_custom_chart
from src.utils.agent_artifacts.serialize import has_chartable_data
from src.utils.agent_artifacts.types import ArtifactMeta

logger = logging.getLogger(__name__)

ARTIFACT_ROOT = Path(__file__).resolve().parents[3] / "app" / "backend" / "static" / "artifacts"
URL_PREFIX = "/artifacts"
TTL_SECONDS = 24 * 60 * 60

_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9._-]+")

_current_run_id: str | None = None


def set_run_artifact_root(run_id: str | None) -> None:
    """Called once per shift to scope artifact paths."""
    global _current_run_id
    _current_run_id = _safe_segment(run_id) if run_id else None


def _safe_segment(value: str) -> str:
    cleaned = _SAFE_SEGMENT.sub("_", value or "").strip("._-")
    return cleaned or "default"


def _ensure_dir(*parts: str) -> Path:
    run = _current_run_id or "_unscoped"
    path = ARTIFACT_ROOT.joinpath(run, *[_safe_segment(p) for p in parts])
    path.mkdir(parents=True, exist_ok=True)
    return path


def cleanup_old_runs(max_age_seconds: int = TTL_SECONDS) -> None:
    """Delete run directories older than the TTL. Safe to call at shift start."""
    if not ARTIFACT_ROOT.exists():
        return
    cutoff = time.time() - max_age_seconds
    for child in ARTIFACT_ROOT.iterdir():
        if not child.is_dir():
            continue
        try:
            if child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
        except OSError:
            continue


def attach_artifacts(
    *,
    agent_id: str,
    investor_name: str,
    ticker: str,
    state: Any | None,
    metrics_ctx: dict[str, Any],
    reasoning_payload: dict[str, Any] | str | None,
) -> list[dict[str, Any]]:
    """Plan + render charts for an agent/ticker and return artifact dicts.

    Returns a list of serialized `ArtifactMeta` dicts ready to drop into the
    agent's `analysis` JSON. Empty list when nothing can be rendered.
    """
    enriched_ctx = dict(metrics_ctx or {})
    if isinstance(reasoning_payload, dict):
        enriched_ctx.setdefault("reasoning", reasoning_payload)

    eligible = eligible_specs(agent_id, enriched_ctx)
    if not eligible and not has_chartable_data(enriched_ctx):
        return []

    plan = (
        plan_charts(
            agent_id=agent_id,
            investor_name=investor_name,
            ticker=ticker,
            metrics_ctx=enriched_ctx,
            eligible=eligible,
            state=state,
        )
        if eligible
        else None
    )

    out_dir = _ensure_dir(agent_id, ticker)
    artifacts: list[ArtifactMeta] = []

    custom = plan_custom_chart(
        agent_id=agent_id,
        investor_name=investor_name,
        ticker=ticker,
        metrics_ctx=enriched_ctx,
        state=state,
    )
    if custom:
        try:
            fig = run_custom_chart(custom.code, enriched_ctx)
            width, height = figure_pixel_size(fig)
            png = figure_to_png_bytes(fig)
            filename = f"{_safe_segment(CUSTOM_CHART_ID)}.png"
            (out_dir / filename).write_bytes(png)
            run = _current_run_id or "_unscoped"
            url = f"{URL_PREFIX}/{run}/{_safe_segment(agent_id)}/{_safe_segment(ticker)}/{filename}"
            artifacts.append(
                ArtifactMeta(
                    id=CUSTOM_CHART_ID,
                    title=custom.title,
                    caption=custom.caption,
                    url=url,
                    width=width,
                    height=height,
                )
            )
        except Exception as exc:
            logger.warning(
                "custom chart render failed for %s/%s: %s", agent_id, ticker, exc
            )

    if not plan or not plan.charts:
        return [a.model_dump() for a in artifacts]

    for pick in plan.charts:
        spec = spec_by_id(pick.id)
        if not spec:
            continue
        try:
            fig = spec.builder(enriched_ctx)
            width, height = figure_pixel_size(fig)
            png = figure_to_png_bytes(fig)
            filename = f"{_safe_segment(pick.id)}.png"
            (out_dir / filename).write_bytes(png)
            run = _current_run_id or "_unscoped"
            url = f"{URL_PREFIX}/{run}/{_safe_segment(agent_id)}/{_safe_segment(ticker)}/{filename}"
            artifacts.append(
                ArtifactMeta(
                    id=pick.id,
                    title=pick.title or spec.label,
                    caption=pick.caption or spec.description,
                    url=url,
                    width=width,
                    height=height,
                )
            )
        except Exception as exc:
            logger.warning("artifact render failed for %s/%s/%s: %s", agent_id, ticker, pick.id, exc)
            continue

    return [a.model_dump() for a in artifacts]
