"""Tests for sub-agent delegation utilities."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.utils.sub_agents.registry import catalog_for_parent, spec_by_id
from src.utils.sub_agents.runner import sub_agents_enabled, _progress_payload
from src.utils.sub_agents.types import SubAgentResult, SubAgentStatus


def test_sub_agents_enabled_default_on():
    with patch.dict("os.environ", {}, clear=True):
        assert sub_agents_enabled() is True


def test_sub_agents_disabled_via_env():
    with patch.dict("os.environ", {"SUB_AGENTS": "0"}):
        assert sub_agents_enabled() is False


def test_catalog_for_forensic_parent():
    catalog = catalog_for_parent("david_einhorn_agent")
    ids = {s.id for s in catalog}
    assert "forensic_accounting" in ids
    assert "bear_stress" in ids


def test_catalog_for_quant_parent():
    catalog = catalog_for_parent("jim_simons_agent")
    ids = {s.id for s in catalog}
    assert "peer_benchmark" in ids
    assert "forensic_accounting" not in ids


def test_spec_by_id():
    spec = spec_by_id("moat_check")
    assert spec is not None
    assert spec.label == "Moat Check"


def test_progress_payload_shape():
    statuses = [SubAgentStatus(id="peer_benchmark", label="Peer Benchmark", task="Compare margins")]
    results = [
        SubAgentResult(
            id="peer_benchmark",
            label="Peer Benchmark",
            task="Compare margins",
            summary="Focal name trades at a premium.",
            key_findings=["Higher ROE vs peers"],
            confidence=72.0,
        )
    ]
    payload = _progress_payload(statuses, results)
    assert len(payload["subagents"]) == 1
    assert payload["subagents"][0]["status"] == "queued"
    assert payload["subagent_results"][0]["summary"].startswith("Focal")


def test_delegate_sub_agents_disabled_returns_none():
    from src.utils.sub_agents.runner import delegate_sub_agents

    state = {"data": {}, "metadata": {}}
    with patch.dict("os.environ", {"SUB_AGENTS": "0"}):
        assert (
            delegate_sub_agents(
                parent_agent_id="warren_buffett_agent",
                parent_name="Warren Buffett",
                ticker="AAPL",
                parent_analysis={"score": 7},
                chart_ctx={"ticker": "AAPL"},
                state=state,
            )
            is None
        )


def test_plan_sub_agents_respects_catalog_ids():
    from src.utils.sub_agents.runner import plan_sub_agents
    from src.utils.sub_agents.types import SubAgentPick, SubAgentPlan

    catalog = [spec_by_id("peer_benchmark"), spec_by_id("bear_stress")]
    catalog = [c for c in catalog if c]

    fake_plan = SubAgentPlan(
        tasks=[
            SubAgentPick(id="peer_benchmark", task_focus="Margin vs peers"),
            SubAgentPick(id="invalid_id", task_focus="Should drop"),
        ]
    )
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value.invoke.return_value = fake_plan

    state = {"data": {}, "metadata": {"request": MagicMock(api_keys=None)}}
    with patch("src.llm.models.get_model", return_value=mock_llm):
        picks = plan_sub_agents(
            parent_agent_id="peter_lynch_agent",
            parent_name="Peter Lynch",
            ticker="AAPL",
            parent_analysis={"score": 6},
            state=state,
            catalog=catalog,
            max_tasks=2,
        )
    assert len(picks) == 1
    assert picks[0].id == "peer_benchmark"
