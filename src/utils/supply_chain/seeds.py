"""Curated supply-chain templates for well-known tickers (fallback when LLM fails)."""

from __future__ import annotations

from src.utils.supply_chain.models import ChainEdge, ChainNode, SupplyChainGraphModel


def _edge(src: str, tgt: str, crit: str = "medium") -> ChainEdge:
    return ChainEdge(source=src, target=tgt, relationship="supplies", criticality=crit)


def seed_graph_for_ticker(ticker: str) -> SupplyChainGraphModel | None:
    key = ticker.strip().upper()
    builder = _SEED_BUILDERS.get(key)
    if not builder:
        return None
    return builder(key)


def _nvda(t: str) -> SupplyChainGraphModel:
    return SupplyChainGraphModel(
        title=f"{t} GPU supply web",
        caption="Semiconductor fab and hyperscaler demand chain (curated seed).",
        focal_ticker=t,
        nodes=[
            ChainNode(id="asml", label="ASML", role="supplier", tier=-3, region="Netherlands"),
            ChainNode(id="tsmc", label="TSMC", role="supplier", tier=-1, region="Taiwan", risk_note="Single-source leading-edge fab"),
            ChainNode(id="sk_hynix", label="SK Hynix", role="supplier", tier=-2, region="Korea"),
            ChainNode(id="nvda", label="NVIDIA", role="focal", tier=0),
            ChainNode(id="msft", label="Microsoft", role="customer", tier=1),
            ChainNode(id="amzn", label="Amazon AWS", role="customer", tier=1),
            ChainNode(id="goog", label="Alphabet", role="customer", tier=1),
            ChainNode(id="taiwan_geo", label="Taiwan", role="geography", tier=-1, region="Taiwan"),
        ],
        edges=[
            _edge("asml", "tsmc", "high"),
            _edge("sk_hynix", "nvda", "high"),
            _edge("tsmc", "nvda", "high"),
            _edge("nvda", "msft", "high"),
            _edge("nvda", "amzn", "high"),
            _edge("nvda", "goog", "medium"),
        ],
        concentration_risks=["TSMC leading-edge fab concentration", "Taiwan geopolitical chokepoint"],
    )


def _aapl(t: str) -> SupplyChainGraphModel:
    return SupplyChainGraphModel(
        title=f"{t} hardware supply web",
        caption="Assembly, components, and retail distribution (curated seed).",
        focal_ticker=t,
        nodes=[
            ChainNode(id="tsmc", label="TSMC", role="supplier", tier=-1, region="Taiwan"),
            ChainNode(id="foxconn", label="Foxconn", role="supplier", tier=-1, region="China"),
            ChainNode(id="aapl", label="Apple", role="focal", tier=0),
            ChainNode(id="carriers", label="Carrier partners", role="customer", tier=1),
            ChainNode(id="retail", label="Apple Retail", role="customer", tier=1),
            ChainNode(id="china_geo", label="China assembly", role="geography", tier=-1, region="China"),
        ],
        edges=[
            _edge("tsmc", "aapl", "high"),
            _edge("foxconn", "aapl", "high"),
            _edge("aapl", "carriers", "medium"),
            _edge("aapl", "retail", "low"),
        ],
        concentration_risks=["Foxconn assembly concentration", "China/Taiwan component exposure"],
    )


def _tsla(t: str) -> SupplyChainGraphModel:
    return SupplyChainGraphModel(
        title=f"{t} EV supply web",
        caption="Battery, power electronics, and materials (curated seed).",
        focal_ticker=t,
        nodes=[
            ChainNode(id="lithium", label="Lithium miners", role="material", tier=-3),
            ChainNode(id="catl", label="CATL", role="supplier", tier=-2, region="China"),
            ChainNode(id="panasonic", label="Panasonic", role="supplier", tier=-1, region="Japan"),
            ChainNode(id="tsla", label="Tesla", role="focal", tier=0),
            ChainNode(id="china_geo", label="Shanghai Gigafactory", role="geography", tier=-1, region="China"),
            ChainNode(id="consumers", label="Global EV buyers", role="customer", tier=2),
        ],
        edges=[
            _edge("lithium", "catl", "high"),
            _edge("catl", "tsla", "high"),
            _edge("panasonic", "tsla", "medium"),
            _edge("tsla", "consumers", "medium"),
        ],
        concentration_risks=["Battery cell supplier concentration", "Lithium raw material volatility"],
    )


def _amd(t: str) -> SupplyChainGraphModel:
    return SupplyChainGraphModel(
        title=f"{t} chip supply web",
        caption="Fabless design with foundry dependency (curated seed).",
        focal_ticker=t,
        nodes=[
            ChainNode(id="tsmc", label="TSMC", role="supplier", tier=-1, region="Taiwan"),
            ChainNode(id="asml", label="ASML", role="supplier", tier=-2, region="Netherlands"),
            ChainNode(id="amd", label="AMD", role="focal", tier=0),
            ChainNode(id="hyperscalers", label="Cloud hyperscalers", role="customer", tier=1),
            ChainNode(id="pc_oems", label="PC OEMs", role="customer", tier=1),
        ],
        edges=[
            _edge("asml", "tsmc", "high"),
            _edge("tsmc", "amd", "high"),
            _edge("amd", "hyperscalers", "medium"),
            _edge("amd", "pc_oems", "medium"),
        ],
        concentration_risks=["TSMC foundry dependency for advanced nodes"],
    )


from src.utils.supply_chain.validate import slug_id


def _generic(t: str) -> SupplyChainGraphModel:
    fid = slug_id(t)
    return SupplyChainGraphModel(
        title=f"{t} supply skeleton",
        caption="Generic upstream/downstream scaffold — LLM map unavailable; refine manually.",
        focal_ticker=t,
        nodes=[
            ChainNode(id="raw_inputs", label="Raw materials", role="material", tier=-2),
            ChainNode(id="tier1_sup", label="Tier-1 suppliers", role="supplier", tier=-1),
            ChainNode(id=fid, label=t, role="focal", tier=0),
            ChainNode(id="tier1_cust", label="Key customers", role="customer", tier=1),
            ChainNode(id="distribution", label="Distribution", role="customer", tier=2),
        ],
        edges=[
            _edge("raw_inputs", "tier1_sup", "medium"),
            _edge("tier1_sup", fid, "medium"),
            _edge(fid, "tier1_cust", "medium"),
            _edge(fid, "distribution", "low"),
        ],
        concentration_risks=["Graph is a placeholder — verify suppliers from 10-K risk factors"],
    )


_SEED_BUILDERS = {
    "NVDA": _nvda,
    "AAPL": _aapl,
    "TSLA": _tsla,
    "AMD": _amd,
}
