import { useMemo, type ReactNode } from "react";

import type { AgentArtifact, RippleCascadeGraphData, SupplyChainGraphData } from "../../lib/parseAgentAnalysis";
import { formatMoney, formatPct } from "../../lib/parseAgentAnalysis";
import { SupplyChainGraph } from "./SupplyChainGraph";

const PHOS = "#2fd08a";
const SIREN = "#ff4d6d";
const BRASS = "#e3b24b";
const WIRE = "#6b7280";

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function arr<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

interface Props {
  artifact: AgentArtifact;
}

export function InteractiveArtifact({ artifact }: Props) {
  const kind = artifact.kind ?? "";
  switch (kind) {
    case "supply_chain_graph":
      return artifact.graph ? (
        <SupplyChainGraph graph={artifact.graph as SupplyChainGraphData} />
      ) : null;
    case "ripple_cascade":
      return artifact.graph ? (
        <RippleCascade graph={artifact.graph as RippleCascadeGraphData} />
      ) : null;
    case "price_target_fan":
      return <PriceTargetFan data={artifact.data} />;
    case "committee_dispersion":
      return <CommitteeDispersion data={artifact.data} />;
    case "risk_inventory_heatmap":
      return <RiskInventoryHeatmap data={artifact.data} />;
    case "scenario_tornado":
      return <ScenarioTornado data={artifact.data} />;
    case "moat_radar":
      return <MoatRadar data={artifact.data} />;
    case "opportunity_frontier":
      return <OpportunityFrontier data={artifact.data} />;
    case "dossier_board":
      return <DossierBoard data={artifact.data} />;
    case "dcf_sensitivity":
      return <DcfSensitivity data={artifact.data} />;
    case "valuation_football_field":
      return <ValuationFootballField data={artifact.data} />;
    case "reverse_dcf":
      return <ReverseDcf data={artifact.data} />;
    case "graham_gauge":
      return <GrahamGauge data={artifact.data} />;
    case "taleb_risk_profile":
      return <TalebRiskProfile data={artifact.data} />;
    case "taleb_convexity":
      return <TalebConvexity data={artifact.data} />;
    case "damodaran_story_bridge":
      return <DamodaranStoryBridge data={artifact.data} />;
    case "damodaran_risk_premium":
      return <DamodaranRiskPremium data={artifact.data} />;
    case "sentiment_price_overlay":
      return <SentimentPriceOverlay data={artifact.data} />;
    case "growth_acceleration":
      return <GrowthAcceleration data={artifact.data} />;
    case "burry_contrarian":
      return <BurryContrarian data={artifact.data} />;
    case "dalio_regime":
      return <DalioRegime data={artifact.data} />;
    default:
      return null;
  }
}

export function isInteractiveArtifact(art: AgentArtifact): boolean {
  if (art.url) return false;
  const k = art.kind ?? "";
  if ((k === "supply_chain_graph" || k === "ripple_cascade") && art.graph) return true;
  return [
    "price_target_fan",
    "committee_dispersion",
    "risk_inventory_heatmap",
    "scenario_tornado",
    "moat_radar",
    "opportunity_frontier",
    "dossier_board",
    "dcf_sensitivity",
    "valuation_football_field",
    "reverse_dcf",
    "graham_gauge",
    "taleb_risk_profile",
    "taleb_convexity",
    "damodaran_story_bridge",
    "damodaran_risk_premium",
    "sentiment_price_overlay",
    "growth_acceleration",
    "burry_contrarian",
    "dalio_regime",
  ].includes(k);
}

function RippleCascade({ graph }: { graph: RippleCascadeGraphData }) {
  const { nodes, edges, width, height } = useMemo(() => {
    const sorted = [...graph.nodes].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    const rowH = 52;
    const w = 320;
    const h = Math.max(200, sorted.length * rowH + 40);
    const laid = sorted.map((n, i) => ({
      ...n,
      x: 24 + (i % 2) * 8,
      y: 20 + i * rowH,
    }));
    const map = new Map(laid.map((n) => [n.id, n]));
    return { nodes: laid, edges: graph.edges, width: w, height: h, nodeMap: map };
  }, [graph]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-h-[200px] w-full">
      {edges.map((e, i) => {
        const a = nodeMap.get(e.source);
        const b = nodeMap.get(e.target);
        if (!a || !b) return null;
        return (
          <line
            key={i}
            x1={a.x + 120}
            y1={a.y + 18}
            x2={b.x + 120}
            y2={b.y + 18}
            stroke={BRASS}
            strokeWidth={1.5}
            strokeOpacity={0.6}
            markerEnd="url(#ripple-arrow)"
          />
        );
      })}
      <defs>
        <marker id="ripple-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={BRASS} />
        </marker>
      </defs>
      {nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`}>
          <rect width={240} height={36} rx={2} fill="rgb(12 14 18 / 0.9)" stroke="rgb(55 65 81)" />
          <text x={8} y={14} fill={n.role === "focal" ? BRASS : PHOS} fontSize={9} fontFamily="monospace">
            {n.role === "focal" ? "FOCAL" : `STEP ${n.step ?? "?"}`}
          </text>
          <text x={8} y={28} fill="#e5e7eb" fontSize={10} fontFamily="sans-serif">
            {n.label.length > 34 ? `${n.label.slice(0, 31)}…` : n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PriceTargetFan({ data }: { data?: Record<string, unknown> }) {
  const ref = num(data?.reference_price, 0);
  const targets = arr<{ agent: string; price: number; horizon_months?: number; signal: string }>(
    data?.targets,
  );
  if (!targets.length) return <Empty label="No price targets published" />;

  const prices = targets.map((t) => t.price);
  const minP = Math.min(ref || Math.min(...prices), ...prices) * 0.92;
  const maxP = Math.max(...prices, ref) * 1.08;
  const span = maxP - minP || 1;
  const w = 360;
  const h = 40 + targets.length * 28;

  const x = (p: number) => 48 + ((p - minP) / span) * (w - 72);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {ref > 0 ? (
        <>
          <line x1={x(ref)} y1={8} x2={x(ref)} y2={h - 8} stroke={WIRE} strokeDasharray="4 3" />
          <text x={x(ref)} y={14} textAnchor="middle" fill={WIRE} fontSize={8} fontFamily="monospace">
            REF {formatMoney(ref)}
          </text>
        </>
      ) : null}
      {targets.map((t, i) => {
        const y = 32 + i * 28;
        const color = t.signal === "bullish" ? PHOS : t.signal === "bearish" ? SIREN : WIRE;
        return (
          <g key={`${t.agent}-${i}`}>
            <text x={4} y={y + 4} fill="#9ca3af" fontSize={8} fontFamily="monospace">
              {t.agent.length > 14 ? `${t.agent.slice(0, 12)}…` : t.agent}
            </text>
            <line x1={x(minP)} y1={y} x2={x(t.price)} y2={y} stroke={color} strokeWidth={3} strokeOpacity={0.35} />
            <circle cx={x(t.price)} cy={y} r={5} fill={color} />
            <text x={x(t.price) + 8} y={y + 4} fill={color} fontSize={9} fontFamily="monospace">
              {formatMoney(t.price)}
              {t.horizon_months != null ? ` · ${t.horizon_months}mo` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CommitteeDispersion({ data }: { data?: Record<string, unknown> }) {
  const bullish = num(data?.bullish);
  const bearish = num(data?.bearish);
  const neutral = num(data?.neutral);
  const total = bullish + bearish + neutral || 1;
  const spread = num(data?.confidence_spread);
  const opinions = arr<{ agent: string; signal: string; confidence: number }>(data?.opinions);

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-sm border border-wire-800">
        <div style={{ width: `${(bullish / total) * 100}%`, background: PHOS }} title={`Bull ${bullish}`} />
        <div style={{ width: `${(neutral / total) * 100}%`, background: WIRE }} title={`Neutral ${neutral}`} />
        <div style={{ width: `${(bearish / total) * 100}%`, background: SIREN }} title={`Bear ${bearish}`} />
      </div>
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-wire-500">
        <span className="text-phos">{bullish} bull</span>
        <span>{neutral} neutral</span>
        <span className="text-siren">{bearish} bear</span>
        <span>spread {spread.toFixed(0)}</span>
      </div>
      <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
        {opinions.map((o, i) => (
          <div
            key={`${o.agent}-${i}`}
            className="flex items-center justify-between border border-wire-800/80 bg-ink-950/60 px-2 py-1 text-[10px]"
          >
            <span className="truncate text-wire-300">{o.agent}</span>
            <span
              className={
                o.signal === "bullish" ? "text-phos" : o.signal === "bearish" ? "text-siren" : "text-wire-500"
              }
            >
              {o.confidence}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskInventoryHeatmap({ data }: { data?: Record<string, unknown> }) {
  const cells = arr<{ category: string; severity: number; count: number; risks: string[] }>(data?.cells);
  if (!cells.length) return <Empty label="No risks catalogued" />;

  const maxSev = Math.max(...cells.map((c) => c.severity), 1);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {cells.map((c) => {
        const intensity = c.severity / maxSev;
        const bg = `rgba(255, 77, 109, ${0.12 + intensity * 0.45})`;
        return (
          <div
            key={c.category}
            className="rounded border border-wire-800/80 px-2.5 py-2"
            style={{ background: bg }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-wire-200">
                {c.category.replace(/_/g, " ")}
              </span>
              <span className="font-mono text-[10px] text-siren">{c.severity.toFixed(1)}</span>
            </div>
            <div className="mt-1 text-[9px] text-wire-500">{c.count} risk{c.count === 1 ? "" : "s"}</div>
            <ul className="mt-1.5 space-y-0.5 text-[9px] leading-snug text-wire-400">
              {c.risks.slice(0, 2).map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ScenarioTornado({ data }: { data?: Record<string, unknown> }) {
  const drivers = arr<{ label: string; downside_pct: number; upside_pct: number; probability_pct: number }>(
    data?.drivers,
  );
  if (!drivers.length) return <Empty label="No scenarios modeled" />;

  const maxAbs = Math.max(...drivers.flatMap((d) => [Math.abs(d.downside_pct), Math.abs(d.upside_pct)]), 1);
  const w = 360;
  const h = 24 + drivers.length * 32;
  const mid = w / 2;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={mid} y1={8} x2={mid} y2={h - 4} stroke={WIRE} strokeOpacity={0.4} />
      {drivers.map((d, i) => {
        const y = 20 + i * 32;
        const downW = (Math.abs(d.downside_pct) / maxAbs) * (mid - 48);
        const upW = (Math.abs(d.upside_pct) / maxAbs) * (mid - 48);
        return (
          <g key={`${d.label}-${i}`}>
            <text x={4} y={y + 4} fill="#9ca3af" fontSize={8} fontFamily="monospace">
              {d.label.length > 22 ? `${d.label.slice(0, 20)}…` : d.label}
            </text>
            <rect x={mid - downW} y={y - 6} width={downW} height={10} fill={SIREN} fillOpacity={0.75} />
            <rect x={mid} y={y - 6} width={upW} height={10} fill={PHOS} fillOpacity={0.75} />
            <text x={mid - downW - 4} y={y + 3} textAnchor="end" fill={SIREN} fontSize={8}>
              {formatPct(d.downside_pct)}
            </text>
            <text x={mid + upW + 4} y={y + 3} fill={PHOS} fontSize={8}>
              +{formatPct(d.upside_pct)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MoatRadar({ data }: { data?: Record<string, unknown> }) {
  const axes = arr<string>(data?.axes);
  const values = arr<number>(data?.values);
  if (!axes.length || values.length !== axes.length) return <Empty label="Moat scores unavailable" />;

  const cx = 120;
  const cy = 110;
  const r = 72;
  const n = axes.length;
  const points = values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const rad = (Math.min(10, Math.max(0, v)) / 10) * r;
      return `${cx + Math.cos(angle) * rad},${cy + Math.sin(angle) * rad}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 240 220" className="mx-auto w-full max-w-[280px]">
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <polygon
          key={s}
          points={axes
            .map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              return `${cx + Math.cos(angle) * r * s},${cy + Math.sin(angle) * r * s}`;
            })
            .join(" ")}
          fill="none"
          stroke={WIRE}
          strokeOpacity={0.35}
        />
      ))}
      <polygon points={points} fill={`${BRASS}33`} stroke={BRASS} strokeWidth={1.5} />
      {axes.map((label, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = cx + Math.cos(angle) * (r + 16);
        const ly = cy + Math.sin(angle) * (r + 16);
        return (
          <text
            key={label}
            x={lx}
            y={ly}
            textAnchor="middle"
            fill="#9ca3af"
            fontSize={8}
            fontFamily="monospace"
          >
            {label}
          </text>
        );
      })}
      <text x={cx} y={cy} textAnchor="middle" fill={BRASS} fontSize={14} fontFamily="monospace">
        {num(data?.composite).toFixed(1)}
      </text>
    </svg>
  );
}

function OpportunityFrontier({ data }: { data?: Record<string, unknown> }) {
  const points = arr<{ id: string; label: string; x: number; y: number; highlight?: boolean }>(data?.points);
  if (!points.length) return <Empty label="No frontier points" />;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - 2;
  const maxX = Math.max(...xs) + 2;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  const w = 320;
  const h = 200;
  const px = (x: number) => 40 + ((x - minX) / (maxX - minX || 1)) * (w - 64);
  const py = (y: number) => h - 28 - ((y - minY) / (maxY - minY || 1)) * (h - 48);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <text x={w / 2} y={h - 6} textAnchor="middle" fill={WIRE} fontSize={8}>
        {str(data?.x_label, "Expected return (%)")}
      </text>
      {points.map((p) => (
        <g key={p.id}>
          <circle
            cx={px(p.x)}
            cy={py(p.y)}
            r={p.highlight ? 7 : 5}
            fill={p.highlight ? BRASS : PHOS}
            fillOpacity={p.highlight ? 0.9 : 0.55}
          />
          <text x={px(p.x) + 10} y={py(p.y) + 3} fill="#d1d5db" fontSize={8}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DossierBoard({ data }: { data?: Record<string, unknown> }) {
  const facts = arr<{ id: string; label: string; value: string | number; kind?: string }>(data?.facts);
  const claims = arr<{ id: string; agent: string; signal: string; text: string; confidence?: number }>(
    data?.claims,
  );
  const disputes = arr<{ id: string; kind?: string; summary?: string }>(data?.disputes);

  return (
    <div className="relative min-h-[220px] rounded border border-dashed border-brass/25 bg-ink-950/50 p-3">
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[repeating-linear-gradient(-12deg,transparent,transparent_18px,rgba(227,178,75,0.5)_18px,rgba(227,178,75,0.5)_19px)]" />
      <div className="grid gap-3 lg:grid-cols-3">
        <BoardColumn title="Facts" tone="wire">
          {facts.slice(0, 6).map((f) => (
            <Pin key={f.id} label={f.label} body={String(f.value)} />
          ))}
        </BoardColumn>
        <BoardColumn title="Claims" tone="brass">
          {claims.slice(0, 5).map((c) => (
            <Pin
              key={c.id}
              label={c.agent}
              body={c.text.length > 90 ? `${c.text.slice(0, 87)}…` : c.text}
              tag={c.signal}
            />
          ))}
        </BoardColumn>
        <BoardColumn title="Disputes" tone="siren">
          {disputes.length === 0 ? (
            <p className="text-[9px] text-wire-600">No active disputes</p>
          ) : (
            disputes.map((d) => (
              <Pin key={d.id} label={d.kind ?? "dispute"} body={d.summary ?? "—"} />
            ))
          )}
        </BoardColumn>
      </div>
    </div>
  );
}

function DcfSensitivity({ data }: { data?: Record<string, unknown> }) {
  const wSteps = arr<number>(data?.wacc_steps);
  const gSteps = arr<number>(data?.growth_steps);
  const cells = arr<{ wacc_pct: number; growth_pct: number; gap_pct: number | null }>(data?.cells);
  if (!cells.length || !wSteps.length || !gSteps.length) return <Empty label="DCF grid unavailable" />;

  const gaps = cells.map((c) => c.gap_pct ?? 0);
  const maxAbs = Math.max(...gaps.map(Math.abs), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[9px] font-mono">
        <thead>
          <tr>
            <th className="p-1 text-wire-500">WACC \\ g</th>
            {gSteps.map((g) => (
              <th key={g} className="p-1 text-wire-400">{g}%</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wSteps.map((w) => (
            <tr key={w}>
              <td className="p-1 text-wire-500">{w}%</td>
              {gSteps.map((g) => {
                const cell = cells.find((c) => c.wacc_pct === w && c.growth_pct === g);
                const gap = cell?.gap_pct ?? 0;
                const t = Math.min(1, Math.abs(gap) / maxAbs);
                const bg =
                  gap >= 0
                    ? `rgba(47, 208, 138, ${0.1 + t * 0.45})`
                    : `rgba(255, 77, 109, ${0.1 + t * 0.45})`;
                return (
                  <td key={`${w}-${g}`} className="p-1 text-center" style={{ background: bg }}>
                    {cell?.gap_pct != null ? formatPct(cell.gap_pct) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValuationFootballField({ data }: { data?: Record<string, unknown> }) {
  const bars = arr<{ id: string; label: string; value: number; gap_pct: number }>(data?.bars);
  const mcap = num(data?.market_cap);
  if (!bars.length || !mcap) return <Empty label="No valuation range" />;

  const vals = [...bars.map((b) => b.value), mcap];
  const minV = Math.min(...vals) * 0.92;
  const maxV = Math.max(...vals) * 1.08;
  const w = 340;
  const h = 28 + bars.length * 26;
  const x = (v: number) => 48 + ((v - minV) / (maxV - minV || 1)) * (w - 72);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={x(mcap)} y1={8} x2={x(mcap)} y2={h - 4} stroke={BRASS} strokeDasharray="3 3" strokeOpacity={0.7} />
      <text x={x(mcap)} y={8} textAnchor="middle" fill={BRASS} fontSize={7}>Mkt cap</text>
      {bars.map((b, i) => {
        const y = 22 + i * 26;
        const x0 = x(Math.min(b.value, mcap));
        const x1 = x(Math.max(b.value, mcap));
        return (
          <g key={b.id}>
            <text x={4} y={y + 4} fill="#9ca3af" fontSize={8}>{b.label}</text>
            <rect x={x0} y={y - 5} width={Math.max(2, x1 - x0)} height={10} fill={PHOS} fillOpacity={0.55} />
            <text x={x1 + 4} y={y + 4} fill="#d1d5db" fontSize={8}>{formatPct(b.gap_pct)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ReverseDcf({ data }: { data?: Record<string, unknown> }) {
  const implied = num(data?.implied_growth_pct);
  const wacc = num(data?.wacc_pct);
  if (!implied && !wacc) return <Empty label="Reverse DCF unavailable" />;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Implied growth" value={`${implied.toFixed(1)}%`} tone="brass" />
      <Stat label="WACC used" value={`${wacc.toFixed(1)}%`} />
      <Stat label="Market cap" value={formatMoney(num(data?.market_cap))} />
    </div>
  );
}

function GrahamGauge({ data }: { data?: Record<string, unknown> }) {
  const price = num(data?.price);
  const ncav = num(data?.ncav_per_share);
  const graham = data?.graham_number != null ? num(data.graham_number) : null;
  if (!price) return <Empty label="Graham screen unavailable" />;

  const w = 300;
  const h = 120;
  const maxV = Math.max(price, ncav, graham ?? 0) * 1.15;
  const bar = (label: string, val: number | null, color: string) => {
    if (val == null || val <= 0) return null;
    const bw = (val / maxV) * (w - 80);
    return (
      <g>
        <text x={4} y={0} fill="#9ca3af" fontSize={8}>{label}</text>
        <rect x={72} y={-8} width={bw} height={10} fill={color} fillOpacity={0.75} />
        <text x={72 + bw + 4} y={0} fill="#d1d5db" fontSize={8}>{formatMoney(val)}</text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <g transform="translate(0,24)">{bar("Price", price, WIRE)}</g>
      <g transform="translate(0,52)">{bar("NCAV/sh", ncav, PHOS)}</g>
      <g transform="translate(0,80)">{bar("Graham #", graham, BRASS)}</g>
      {data?.net_net_hit ? (
        <text x={4} y={h - 6} fill={PHOS} fontSize={8}>Net-net: NCAV &gt; market cap</text>
      ) : null}
    </svg>
  );
}

function TalebRiskProfile({ data }: { data?: Record<string, unknown> }) {
  const points = arr<{ label: string; score: number }>(data?.points);
  if (!points.length) return <Empty label="Risk profile unavailable" />;
  const radar = { axes: points.map((p) => p.label), values: points.map((p) => p.score) };
  return <MoatRadar data={{ ...radar, composite: points.reduce((s, p) => s + p.score, 0) / points.length }} />;
}

function TalebConvexity({ data }: { data?: Record<string, unknown> }) {
  const down = num(data?.downside_pct, -6);
  const up = num(data?.upside_pct, 8);
  const w = 280;
  const h = 140;
  const mid = w / 2;
  const baseY = h - 30;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mx-auto w-full max-w-[300px]">
      <line x1={mid} y1={20} x2={mid} y2={baseY} stroke={WIRE} strokeOpacity={0.4} />
      <polyline
        points={`${mid - 80},${baseY} ${mid - 20},${baseY + down * 2} ${mid + 60},${baseY - up * 2} ${mid + 120},${baseY - up * 3}`}
        fill="none"
        stroke={BRASS}
        strokeWidth={2}
      />
      <text x={mid - 70} y={baseY + 14} fill={SIREN} fontSize={8}>{formatPct(down)}</text>
      <text x={mid + 90} y={baseY - up * 3 - 4} fill={PHOS} fontSize={8}>+{formatPct(up)}</text>
    </svg>
  );
}

function DamodaranStoryBridge({ data }: { data?: Record<string, unknown> }) {
  const nodes = arr<{ id: string; label: string; value: string }>(data?.nodes);
  if (!nodes.length) return <Empty label="Story bridge unavailable" />;

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {nodes.map((n, i) => (
        <div key={n.id} className="flex min-w-[88px] flex-1 items-center gap-1">
          <div className="flex-1 rounded border border-brass/25 bg-ink-950/60 px-2 py-1.5">
            <div className="font-mono text-[8px] uppercase tracking-wider text-brass/80">{n.label}</div>
            <div className="mt-0.5 text-[9px] leading-snug text-wire-300">{n.value}</div>
          </div>
          {i < nodes.length - 1 ? <span className="text-wire-600">→</span> : null}
        </div>
      ))}
    </div>
  );
}

function DamodaranRiskPremium({ data }: { data?: Record<string, unknown> }) {
  const hist = num(data?.historical_erp_pct, 5);
  const implied = num(data?.implied_erp_pct);
  const w = 280;
  const h = 80;
  const scale = (v: number) => 40 + (v / Math.max(hist, implied, 8)) * 180;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <text x={4} y={24} fill="#9ca3af" fontSize={8}>Historical ERP</text>
      <rect x={scale(hist) - 40} y={14} width={80} height={12} fill={WIRE} fillOpacity={0.5} />
      <text x={scale(hist)} y={48} textAnchor="middle" fill={WIRE} fontSize={9}>{hist.toFixed(1)}%</text>
      <text x={4} y={64} fill="#9ca3af" fontSize={8}>Implied ERP (β={num(data?.beta).toFixed(2)})</text>
      <rect x={scale(implied) - 40} y={54} width={80} height={12} fill={BRASS} fillOpacity={0.75} />
      <text x={scale(implied)} y={76} textAnchor="middle" fill={BRASS} fontSize={9}>{implied.toFixed(1)}%</text>
    </svg>
  );
}

function SentimentPriceOverlay({ data }: { data?: Record<string, unknown> }) {
  const prices = arr<{ date: string; close: number }>(data?.prices);
  const sentiment = arr<{ period: string; score: number; volume: number }>(data?.sentiment);
  if (!prices.length) return <Empty label="Price/sentiment unavailable" />;

  const closes = prices.map((p) => p.close);
  const minP = Math.min(...closes);
  const maxP = Math.max(...closes);
  const w = 340;
  const h = 160;
  const px = (i: number) => 32 + (i / Math.max(prices.length - 1, 1)) * (w - 48);
  const py = (c: number) => h - 36 - ((c - minP) / (maxP - minP || 1)) * (h - 56);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <polyline
        points={prices.map((p, i) => `${px(i)},${py(p.close)}`).join(" ")}
        fill="none"
        stroke={WIRE}
        strokeWidth={1.5}
      />
      {sentiment.map((s, i) => {
        const x = 32 + ((i + 1) / (sentiment.length + 1)) * (w - 48);
        const y = s.score > 0 ? 24 : s.score < 0 ? 44 : 34;
        const color = s.score > 0 ? PHOS : s.score < 0 ? SIREN : WIRE;
        return (
          <g key={s.period}>
            <circle cx={x} cy={y} r={4 + Math.min(4, s.volume / 3)} fill={color} fillOpacity={0.8} />
            <text x={x} y={y - 8} textAnchor="middle" fill={color} fontSize={7}>{s.period}</text>
          </g>
        );
      })}
      <text x={w / 2} y={h - 6} textAnchor="middle" fill={WIRE} fontSize={8}>Price (recent)</text>
    </svg>
  );
}

function GrowthAcceleration({ data }: { data?: Record<string, unknown> }) {
  const periods = arr<string>(data?.periods);
  const growth = arr<number | null>(data?.revenue_growth_pct);
  const accel = arr<number | null>(data?.acceleration_pct);
  if (!periods.length) return <Empty label="Growth series unavailable" />;

  const vals = growth.filter((g): g is number => g != null);
  const minG = Math.min(...vals, 0);
  const maxG = Math.max(...vals, 1);
  const w = 320;
  const h = 120;
  const mid = h / 2;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={28} y1={mid} x2={w - 8} y2={mid} stroke={WIRE} strokeOpacity={0.35} />
      {periods.map((p, i) => {
        const g = growth[i];
        if (g == null) return null;
        const x = 36 + (i / Math.max(periods.length - 1, 1)) * (w - 52);
        const bh = ((g - minG) / (maxG - minG || 1)) * 40;
        const a = accel[i];
        return (
          <g key={p}>
            <rect
              x={x - 8}
              y={g >= 0 ? mid - bh : mid}
              width={16}
              height={Math.abs(bh)}
              fill={g >= 0 ? PHOS : SIREN}
              fillOpacity={0.7}
            />
            {a != null ? (
              <text x={x} y={g >= 0 ? mid - bh - 4 : mid + Math.abs(bh) + 10} textAnchor="middle" fill={BRASS} fontSize={7}>
                Δ{a > 0 ? "+" : ""}{a.toFixed(0)}
              </text>
            ) : null}
            <text x={x} y={h - 6} textAnchor="middle" fill={WIRE} fontSize={7}>{p}</text>
          </g>
        );
      })}
    </svg>
  );
}

function BurryContrarian({ data }: { data?: Record<string, unknown> }) {
  const price = num(data?.price_change_pct);
  const value = num(data?.value_score_pct);
  const div = num(data?.divergence);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="Price Δ (1y)" value={formatPct(price)} tone={price < 0 ? "siren" : "phos"} />
        <Stat label="Value score" value={`${value.toFixed(0)}%`} />
        <Stat label="Divergence" value={formatPct(div)} tone={div > 15 ? "phos" : undefined} />
      </div>
      <svg viewBox="0 0 280 60" className="w-full">
        <line x1={40} y1={30} x2={260} y2={30} stroke={WIRE} strokeOpacity={0.4} />
        <circle cx={40 + (value / 100) * 220} cy={18} r={6} fill={PHOS} />
        <text x={40} y={14} fill="#9ca3af" fontSize={8}>Value</text>
        <circle cx={40 + ((price + 50) / 100) * 220} cy={42} r={6} fill={SIREN} />
        <text x={40} y={56} fill="#9ca3af" fontSize={8}>Price</text>
      </svg>
    </div>
  );
}

function DalioRegime({ data }: { data?: Record<string, unknown> }) {
  const growth = num(data?.growth_pct, 2);
  const inflation = num(data?.inflation_pct, 2.5);
  const w = 240;
  const h = 200;
  const cx = 120;
  const cy = 100;
  const dotX = cx + Math.max(-70, Math.min(70, (growth - 2) * 18));
  const dotY = cy - Math.max(-70, Math.min(70, (inflation - 2.5) * 18));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mx-auto w-full max-w-[260px]">
      <line x1={cx} y1={20} x2={cx} y2={h - 20} stroke={WIRE} strokeOpacity={0.35} />
      <line x1={20} y1={cy} x2={w - 20} y2={cy} stroke={WIRE} strokeOpacity={0.35} />
      <text x={w - 24} y={cy - 6} fill="#9ca3af" fontSize={7}>growth →</text>
      <text x={cx + 6} y={28} fill="#9ca3af" fontSize={7}>↑ inflation</text>
      <text x={28} y={36} fill={WIRE} fontSize={7}>stagflation</text>
      <text x={w - 72} y={36} fill={WIRE} fontSize={7}>reflation</text>
      <text x={28} y={h - 28} fill={WIRE} fontSize={7}>deflation</text>
      <text x={w - 68} y={h - 28} fill={WIRE} fontSize={7}>goldilocks</text>
      <circle cx={dotX} cy={dotY} r={8} fill={BRASS} fillOpacity={0.9} />
      <text x={cx} y={h - 6} textAnchor="middle" fill={BRASS} fontSize={8}>
        {str(data?.quadrant, "regime")} · resilience {num(data?.resilience).toFixed(1)}
      </text>
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "brass" | "phos" | "siren" }) {
  const color = tone === "brass" ? BRASS : tone === "siren" ? SIREN : tone === "phos" ? PHOS : "#d1d5db";
  return (
    <div className="rounded border border-wire-800/80 bg-ink-950/50 px-2 py-1.5">
      <div className="font-mono text-[8px] uppercase tracking-wider text-wire-500">{label}</div>
      <div className="mt-0.5 font-mono text-[12px]" style={{ color }}>{value}</div>
    </div>
  );
}

function BoardColumn({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "wire" | "brass" | "siren";
  children: ReactNode;
}) {
  const color = tone === "brass" ? BRASS : tone === "siren" ? SIREN : WIRE;
  return (
    <div>
      <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.28em]" style={{ color }}>
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Pin({ label, body, tag }: { label: string; body: string; tag?: string }) {
  return (
    <div
      className="rotate-[0.6deg] border border-wire-800/90 bg-ink-900/90 px-2 py-1.5 shadow-sm"
      style={{ boxShadow: "2px 3px 0 rgb(0 0 0 / 0.35)" }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[8px] uppercase tracking-wider text-brass/90">{label}</span>
        {tag ? (
          <span className="text-[7px] uppercase text-wire-500">{tag}</span>
        ) : null}
      </div>
      <p className="mt-1 text-[9px] leading-snug text-wire-300">{body}</p>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="py-6 text-center font-mono text-[9px] uppercase tracking-[0.24em] text-wire-600">
      {label}
    </p>
  );
}
