"""Sanitize LLM graphs and derive structural risk metrics."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from src.utils.supply_chain.models import ChainEdge, ChainNode, SupplyChainGraphModel

_SLUG = re.compile(r"[^a-z0-9]+")
_VALID_ROLES = frozenset({"focal", "supplier", "customer", "material", "geography", "competitor"})
_VALID_REL = frozenset({"supplies", "depends_on", "distributes", "competes", "owns"})
_VALID_CRIT = frozenset({"low", "medium", "high"})


def slug_id(value: str, fallback: str = "node") -> str:
    cleaned = _SLUG.sub("_", (value or "").lower()).strip("_")
    return (cleaned[:48] or fallback)[:48]


def sanitize_graph(model: SupplyChainGraphModel, ticker: str) -> SupplyChainGraphModel:
    """Normalize ids, tiers, edges, and ensure a focal node exists."""
    key = ticker.strip().upper()
    seen: dict[str, ChainNode] = {}
    id_remap: dict[str, str] = {}

    for raw in model.nodes:
        nid = slug_id(raw.id or raw.label, "node")
        base = nid
        n = 2
        while nid in seen and seen[nid].label != raw.label:
            nid = f"{base}_{n}"
            n += 1
        id_remap[raw.id] = nid
        role = raw.role.lower() if raw.role and raw.role.lower() in _VALID_ROLES else "supplier"
        tier = max(-3, min(3, int(raw.tier)))
        seen[nid] = ChainNode(
            id=nid,
            label=(raw.label or nid).strip()[:64],
            role=role,
            tier=tier,
            region=(raw.region or None),
            risk_note=(raw.risk_note or None),
        )

    focal_id = slug_id(key)
    if focal_id not in seen:
        seen[focal_id] = ChainNode(
            id=focal_id,
            label=key,
            role="focal",
            tier=0,
            region=None,
            risk_note=None,
        )
    else:
        focal = seen[focal_id]
        seen[focal_id] = ChainNode(
            id=focal.id,
            label=focal.label or key,
            role="focal",
            tier=0,
            region=focal.region,
            risk_note=focal.risk_note,
        )

    edges: list[ChainEdge] = []
    edge_keys: set[tuple[str, str, str]] = set()
    for raw in model.edges:
        src = id_remap.get(raw.source, slug_id(raw.source, "src"))
        tgt = id_remap.get(raw.target, slug_id(raw.target, "tgt"))
        if src not in seen or tgt not in seen or src == tgt:
            continue
        rel = raw.relationship.lower() if raw.relationship.lower() in _VALID_REL else "supplies"
        crit = raw.criticality.lower() if raw.criticality.lower() in _VALID_CRIT else "medium"
        ek = (src, tgt, rel)
        if ek in edge_keys:
            continue
        edge_keys.add(ek)
        edges.append(ChainEdge(source=src, target=tgt, relationship=rel, criticality=crit))

    nodes = list(seen.values())
    if len(nodes) < 3:
        nodes, edges = _minimal_graph(key, nodes, edges)

    risks = list(dict.fromkeys(r.strip() for r in model.concentration_risks if r and r.strip()))[:8]
    structural = analyze_graph_structure(nodes, edges, key)
    for r in structural.get("derived_risks") or []:
        if r not in risks:
            risks.append(r)
    risks = risks[:8]

    title = (model.title or f"{key} supply web").strip()[:120]
    caption = (model.caption or "Multi-tier supplier and customer map.").strip()[:280]

    return SupplyChainGraphModel(
        title=title,
        caption=caption,
        focal_ticker=key,
        nodes=nodes,
        edges=edges,
        concentration_risks=risks,
    )


def _minimal_graph(
    ticker: str,
    nodes: list[ChainNode],
    edges: list[ChainEdge],
) -> tuple[list[ChainNode], list[ChainEdge]]:
    """Ensure at least focal + one supplier + one customer."""
    focal_id = slug_id(ticker)
    by_id = {n.id: n for n in nodes}
    if focal_id not in by_id:
        by_id[focal_id] = ChainNode(id=focal_id, label=ticker, role="focal", tier=0)

    suppliers = [n for n in by_id.values() if n.role == "supplier" and n.tier <= 0]
    customers = [n for n in by_id.values() if n.role == "customer" and n.tier >= 0]

    if not suppliers:
        sid = "tier1_supplier"
        by_id[sid] = ChainNode(
            id=sid,
            label="Key supplier (unspecified)",
            role="supplier",
            tier=-1,
            risk_note="Placeholder — refine with filings",
        )
        edges.append(ChainEdge(source=sid, target=focal_id, relationship="supplies", criticality="medium"))
    if not customers:
        cid = "tier1_customer"
        by_id[cid] = ChainNode(
            id=cid,
            label="Major customer segment",
            role="customer",
            tier=1,
        )
        edges.append(ChainEdge(source=focal_id, target=cid, relationship="supplies", criticality="medium"))

    return list(by_id.values()), edges


def analyze_graph_structure(
    nodes: list[ChainNode],
    edges: list[ChainEdge],
    ticker: str,
) -> dict[str, Any]:
    """Deterministic metrics from graph topology."""
    focal_id = slug_id(ticker)
    node_map = {n.id: n for n in nodes}
    focal = node_map.get(focal_id)

    in_edges = [e for e in edges if e.target == focal_id]
    out_edges = [e for e in edges if e.source == focal_id]
    high_in = [e for e in in_edges if e.criticality == "high"]

    tier_counts = Counter(n.tier for n in nodes)
    role_counts = Counter(n.role for n in nodes)
    geo_nodes = [n for n in nodes if n.role == "geography" or (n.region and n.region.strip())]

    supplier_tiers = sorted({n.tier for n in nodes if n.role == "supplier"})
    depth = abs(min(supplier_tiers)) if supplier_tiers else 0

    derived_risks: list[str] = []
    if len(in_edges) == 1 and in_edges[0].criticality in {"high", "medium"}:
        src = node_map.get(in_edges[0].source)
        label = src.label if src else in_edges[0].source
        derived_risks.append(f"Single inbound supplier path: {label}")

    if len(high_in) >= 2 and len(in_edges) <= 3:
        derived_risks.append("High-criticality inputs concentrated in few links")

    if role_counts.get("geography", 0) >= 2 or len(geo_nodes) >= 2:
        regions = ", ".join(sorted({n.region for n in geo_nodes if n.region}))[:80]
        derived_risks.append(f"Geographic concentration exposure{f' ({regions})' if regions else ''}")

    if depth < 2 and role_counts.get("material", 0) == 0:
        derived_risks.append("Shallow upstream map — raw material tier may be under-modeled")

    resilience = 7.0
    resilience -= min(3.0, len(derived_risks) * 0.9)
    resilience -= 1.0 if len(in_edges) <= 1 else 0
    resilience -= 0.5 if len(high_in) >= 2 else 0
    resilience += 0.5 if role_counts.get("customer", 0) >= 2 else 0
    resilience = max(2.0, min(9.5, resilience))

    return {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "supplier_count": role_counts.get("supplier", 0),
        "customer_count": role_counts.get("customer", 0),
        "upstream_depth": depth,
        "tier_spread": dict(sorted(tier_counts.items())),
        "inbound_links": len(in_edges),
        "outbound_links": len(out_edges),
        "high_criticality_inbound": len(high_in),
        "geography_nodes": len(geo_nodes),
        "resilience_score": round(resilience, 1),
        "derived_risks": derived_risks[:4],
        "has_focal": focal is not None,
    }
