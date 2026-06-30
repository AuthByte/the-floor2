import {
  formatHorizonMonths,
  formatPriceTarget,
  formatUpsidePct,
} from "../lib/outlookFormat";

export interface PriceTargetRow {
  agentName: string;
  agentKey?: string;
  referencePrice?: number | null;
  /** Alias for referencePrice (legacy call sites). */
  currentPrice?: number | null;
  priceTarget?: number | null;
  upsidePct?: number | null;
  timeHorizonMonths?: number | null;
}

export function hasPriceTargetData(rows: PriceTargetRow[]): boolean {
  return rows.some((r) => r.priceTarget != null && Number.isFinite(r.priceTarget));
}

function rowReference(row: PriceTargetRow): number | null | undefined {
  return row.referencePrice ?? row.currentPrice;
}

export interface PriceTargetTableProps {
  rows: PriceTargetRow[];
  /** floor = wire/brass desk panel; memo = Boss Memo paper palette */
  variant?: "floor" | "memo";
  showHorizon?: boolean;
}

function resolveUpside(row: PriceTargetRow): number | null {
  if (row.upsidePct != null && Number.isFinite(row.upsidePct)) return row.upsidePct;
  const ref = rowReference(row);
  const pt = row.priceTarget;
  if (ref == null || pt == null || !Number.isFinite(ref) || ref <= 0) return null;
  return Math.round(((pt - ref) / ref) * 1000) / 10;
}

const FLOOR = {
  border: "border-wire-800",
  head: "text-wire-500",
  cell: "text-wire-200",
  muted: "text-wire-600",
  rowBg: "bg-ink-900/50",
  bull: "text-phos",
  bear: "text-siren",
};

const MEMO = {
  border: "rgba(22,20,15,0.16)",
  head: "#807A6B",
  cell: "#16140F",
  muted: "#807A6B",
  rowBg: "#FAF7EF",
  bull: "#0E9F6E",
  bear: "#C8442C",
};

export function PriceTargetTable({
  rows,
  variant = "floor",
  showHorizon = false,
}: PriceTargetTableProps) {
  const withTargets = rows.filter((r) => r.priceTarget != null && Number.isFinite(r.priceTarget));
  if (withTargets.length === 0) return null;

  const pal = variant === "memo" ? MEMO : null;

  return (
    <div
      className={
        variant === "floor"
          ? `overflow-hidden rounded-md border ${FLOOR.border}`
          : "overflow-hidden rounded-[3px]"
      }
      style={
        variant === "memo"
          ? { border: `1px solid ${MEMO.border}`, background: MEMO.rowBg }
          : undefined
      }
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr
            className={
              variant === "floor"
                ? `border-b ${FLOOR.border} bg-ink-950/80`
                : undefined
            }
            style={
              variant === "memo"
                ? { borderBottom: `1px solid ${MEMO.border}` }
                : undefined
            }
          >
            {(["Agent", "Current", "1Y Target", "Upside"] as const).map((label) => (
              <th
                key={label}
                className={
                  variant === "floor"
                    ? `px-2.5 py-1.5 font-mono text-[8px] font-medium uppercase tracking-[0.2em] ${FLOOR.head}`
                    : "px-2 py-1 font-mono text-[8px] font-medium uppercase tracking-[0.18em]"
                }
                style={variant === "memo" ? { color: MEMO.head } : undefined}
              >
                {label}
              </th>
            ))}
            {showHorizon ? (
              <th
                className={
                  variant === "floor"
                    ? `px-2.5 py-1.5 font-mono text-[8px] font-medium uppercase tracking-[0.2em] ${FLOOR.head}`
                    : "px-2 py-1 font-mono text-[8px] font-medium uppercase tracking-[0.18em]"
                }
                style={variant === "memo" ? { color: MEMO.head } : undefined}
              >
                Horizon
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {withTargets.map((row) => {
            const upside = resolveUpside(row);
            const upsideColor =
              upside == null
                ? pal?.muted ?? FLOOR.muted
                : upside >= 0
                  ? pal?.bull ?? FLOOR.bull
                  : pal?.bear ?? FLOOR.bear;

            return (
              <tr
                key={row.agentName}
                className={
                  variant === "floor"
                    ? `border-b border-wire-800/60 last:border-0 ${FLOOR.rowBg}`
                    : undefined
                }
                style={
                  variant === "memo"
                    ? { borderBottom: `1px solid ${MEMO.border}` }
                    : undefined
                }
              >
                <td
                  className={
                    variant === "floor"
                      ? `px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.04em] ${FLOOR.cell}`
                      : "px-2 py-1 text-[10px] font-semibold tracking-[0.04em]"
                  }
                  style={variant === "memo" ? { color: MEMO.cell } : undefined}
                >
                  {row.agentName}
                </td>
                <td
                  className={
                    variant === "floor"
                      ? `px-2.5 py-1.5 font-mono text-[10px] tabular-nums ${FLOOR.cell}`
                      : "px-2 py-1 font-mono text-[10px] tabular-nums"
                  }
                  style={variant === "memo" ? { color: MEMO.cell } : undefined}
                >
                  {formatPriceTarget(rowReference(row))}
                </td>
                <td
                  className={
                    variant === "floor"
                      ? `px-2.5 py-1.5 font-mono text-[10px] tabular-nums ${FLOOR.cell}`
                      : "px-2 py-1 font-mono text-[10px] tabular-nums"
                  }
                  style={variant === "memo" ? { color: MEMO.cell } : undefined}
                >
                  {formatPriceTarget(row.priceTarget)}
                </td>
                <td
                  className="px-2.5 py-1.5 font-mono text-[10px] tabular-nums"
                  style={{ color: upsideColor }}
                >
                  {upside != null ? formatUpsidePct(upside) : "—"}
                </td>
                {showHorizon ? (
                  <td
                    className={
                      variant === "floor"
                        ? `px-2.5 py-1.5 font-mono text-[10px] ${FLOOR.muted}`
                        : "px-2 py-1 font-mono text-[10px]"
                    }
                    style={variant === "memo" ? { color: MEMO.muted } : undefined}
                  >
                    {formatHorizonMonths(row.timeHorizonMonths ?? 12)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
