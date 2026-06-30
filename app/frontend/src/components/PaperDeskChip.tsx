import type { PaperTradingSummary } from "../lib/types";

interface Props {
  summary: PaperTradingSummary | null;
  onClick: () => void;
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPnl(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${fmtUsd(v)}`;
}

export function PaperDeskChip({ summary, onClick }: Props) {
  const hasData = summary && (summary.equity != null || summary.day_pnl != null);

  if (!hasData) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="desk-toolbar-btn rounded border border-phos/35 bg-phos/5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-phos hover:bg-phos/15"
        title="Alpaca paper portfolio"
      >
        paper
      </button>
    );
  }

  const pnlPositive = (summary.day_pnl ?? 0) >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="desk-toolbar-btn flex items-center gap-2 rounded border border-phos/40 bg-phos/10 px-2.5 py-1.5 transition hover:bg-phos/20"
      title="Alpaca paper portfolio — click for details"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-phos/80">
        paper
      </span>
      <span className="font-mono text-[10px] tabular-nums text-wire-200">
        {fmtUsd(summary.equity)}
      </span>
      <span
        className={`font-mono text-[10px] tabular-nums ${
          pnlPositive ? "text-phos" : "text-siren"
        }`}
      >
        {fmtPnl(summary.day_pnl)}
      </span>
    </button>
  );
}
