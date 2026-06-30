export interface BacktestCurvePoint {
  date: string;
  portfolio_value: number;
  long_exposure?: number;
  short_exposure?: number;
  gross_exposure?: number;
  net_exposure?: number;
}

export interface BacktestBenchmarkPoint {
  date: string;
  value: number;
}

export interface BacktestPerformanceMetrics {
  sharpe_ratio?: number | null;
  sortino_ratio?: number | null;
  max_drawdown?: number | null;
  max_drawdown_date?: string | null;
  long_short_ratio?: number | null;
  gross_exposure?: number | null;
  net_exposure?: number | null;
}

export interface BacktestBenchmark {
  spy_return_pct?: number | null;
  portfolio_return_pct?: number | null;
  spy_curve?: BacktestBenchmarkPoint[];
}

export interface BacktestDayResult {
  date: string;
  portfolio_value: number;
  cash: number;
  decisions: Record<string, { action?: string; quantity?: number }>;
  executed_trades: Record<string, number>;
  analyst_signals: Record<string, Record<string, unknown>>;
  current_prices: Record<string, number>;
  portfolio_return?: number;
}

export interface BacktestCompletePayload {
  performance_metrics: BacktestPerformanceMetrics;
  final_portfolio: Record<string, unknown>;
  total_days: number;
  portfolio_curve: BacktestCurvePoint[];
  benchmark: BacktestBenchmark;
  daily_results?: BacktestDayResult[];
}

export interface DrawdownPoint {
  date: string;
  drawdown_pct: number;
}

export function defaultBacktestDates(): { startDate: string; endDate: string } {
  const end = new Date();
  end.setDate(end.getDate() - 5);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeDrawdownSeries(curve: BacktestCurvePoint[]): DrawdownPoint[] {
  if (!curve.length) return [];
  let peak = curve[0].portfolio_value;
  return curve.map((p) => {
    peak = Math.max(peak, p.portfolio_value);
    const dd = peak > 0 ? ((p.portfolio_value - peak) / peak) * 100 : 0;
    return { date: p.date, drawdown_pct: dd };
  });
}

export function formatBacktestPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export interface ChartSeries {
  dates: string[];
  portfolio: number[];
  spy: number[];
}

/** Align SPY benchmark to portfolio curve dates for overlay charts. */
export function mergeChartSeries(
  curve: BacktestCurvePoint[],
  spyCurve: BacktestBenchmarkPoint[] = [],
): ChartSeries {
  const spyByDate = new Map(spyCurve.map((p) => [p.date, p.value]));
  const dates = curve.map((p) => p.date);
  const portfolio = curve.map((p) => p.portfolio_value);
  const spy = dates.map((d) => spyByDate.get(d) ?? NaN);
  return { dates, portfolio, spy };
}

export function polylinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 4,
): string {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return "";
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const innerH = height - pad * 2;
  const innerW = width - pad * 2;
  return values
    .map((v, i) => {
      if (!Number.isFinite(v)) return null;
      const x = pad + (i / Math.max(values.length - 1, 1)) * innerW;
      const y = pad + innerH - ((v - min) / span) * innerH;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");
}
