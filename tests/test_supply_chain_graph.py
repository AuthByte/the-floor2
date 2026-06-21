"""Tests for supply chain graph artifacts."""

from src.utils.supply_chain.models import ChainEdge, ChainNode, SupplyChainGraphModel
from src.utils.supply_chain.planner import graph_to_artifact
from src.utils.supply_chain.seeds import seed_graph_for_ticker
from src.utils.supply_chain.validate import analyze_graph_structure, sanitize_graph


def test_graph_to_artifact_shape():
    model = SupplyChainGraphModel(
        title="NVDA Supply Web",
        caption="GPU supply chain",
        focal_ticker="NVDA",
        nodes=[
            {"id": "asml", "label": "ASML", "role": "supplier", "tier": -2},
            {"id": "tsmc", "label": "TSMC", "role": "supplier", "tier": -1},
            {"id": "nvda", "label": "NVIDIA", "role": "focal", "tier": 0},
            {"id": "msft", "label": "Microsoft", "role": "customer", "tier": 1},
        ],
        edges=[
            {"source": "asml", "target": "tsmc", "relationship": "supplies", "criticality": "high"},
            {"source": "tsmc", "target": "nvda", "relationship": "supplies", "criticality": "high"},
            {"source": "nvda", "target": "msft", "relationship": "supplies", "criticality": "medium"},
        ],
        concentration_risks=["TSMC single-source fab"],
    )
    art = graph_to_artifact(model)
    assert art["kind"] == "supply_chain_graph"
    assert len(art["graph"]["nodes"]) == 4
    assert art["graph"]["concentration_risks"][0].startswith("TSMC")


def test_sanitize_repairs_dangling_edges():
    raw = SupplyChainGraphModel.model_construct(
        title="Test",
        caption="Test",
        focal_ticker="ABC",
        nodes=[
            ChainNode(id="BAD ID!", label="Supplier X", role="supplier", tier=-1),
            ChainNode(id="abc", label="ABC Corp", role="focal", tier=0),
        ],
        edges=[
            ChainEdge(source="BAD ID!", target="abc", relationship="supplies", criticality="high"),
            ChainEdge(source="missing", target="abc", relationship="supplies", criticality="low"),
        ],
        concentration_risks=[],
    )
    clean = sanitize_graph(raw, "ABC")
    node_ids = {n.id for n in clean.nodes}
    assert "abc" in node_ids
    assert all(e.source in node_ids and e.target in node_ids for e in clean.edges)
    assert any(n.role == "focal" and n.tier == 0 for n in clean.nodes)


def test_sanitize_adds_minimal_upstream_downstream():
    raw = SupplyChainGraphModel.model_construct(
        title="Lonely",
        caption="Lonely",
        focal_ticker="ZZZ",
        nodes=[ChainNode(id="zzz", label="ZZZ", role="focal", tier=0)],
        edges=[],
        concentration_risks=[],
    )
    clean = sanitize_graph(raw, "ZZZ")
    assert len(clean.nodes) >= 3
    assert len(clean.edges) >= 2


def test_analyze_detects_single_supplier_risk():
    model = SupplyChainGraphModel(
        title="Solo",
        caption="Solo",
        focal_ticker="SOLO",
        nodes=[
            {"id": "solo", "label": "SOLO", "role": "focal", "tier": 0},
            {"id": "only_sup", "label": "Only Supplier", "role": "supplier", "tier": -1},
            {"id": "cust", "label": "Customer", "role": "customer", "tier": 1},
        ],
        edges=[
            {"source": "only_sup", "target": "solo", "relationship": "supplies", "criticality": "high"},
            {"source": "solo", "target": "cust", "relationship": "supplies", "criticality": "medium"},
        ],
        concentration_risks=[],
    )
    stats = analyze_graph_structure(model.nodes, model.edges, "SOLO")
    assert stats["inbound_links"] == 1
    assert any("Single inbound" in r for r in stats["derived_risks"])


def test_seed_graph_nvda():
    seed = seed_graph_for_ticker("NVDA")
    assert seed is not None
    clean = sanitize_graph(seed, "NVDA")
    assert clean.focal_ticker == "NVDA"
    assert len(clean.nodes) >= 6


def test_seed_graph_unknown_returns_none():
    assert seed_graph_for_ticker("NOTAREALTICKER123") is None
