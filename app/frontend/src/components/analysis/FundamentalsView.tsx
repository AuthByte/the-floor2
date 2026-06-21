import type { FundamentalsPayload, SignalBlock } from "../../lib/parseAgentAnalysis";
import { formatMoney, formatPct } from "../../lib/parseAgentAnalysis";

interface Props {
  data: FundamentalsPayload;
  ticker: string | null;
}

export function FundamentalsView({ data, ticker }: Props) {
  const sec = data.sec;
  const blocks = Object.entries(data.reasoning).filter(
    ([k]) => k !== "sec_earnings",
  ) as [string, SignalBlock | unknown][];

  const revenue = sec?.revenue ?? null;
  const revenuePrior = sec?.revenue_prior ?? null;
  const eps = sec?.eps ?? null;
  const epsPrior = sec?.eps_prior ?? null;
  const netIncome = sec?.net_income ?? null;
  const revYoy = sec?.revenue_yoy_pct ?? null;
  const epsYoy = sec?.eps_yoy_pct ?? null;

  return (
    <div className="space-y-4">
      {(data.signal || data.confidence != null) && (
        <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.2em]">
          {ticker ? <Badge label={ticker} /> : null}
          {data.signal ? (
            <Badge
              label={data.signal}
              accent={data.signal === "bullish"}
              warn={data.signal === "bearish"}
            />
          ) : null}
          {data.confidence != null ? (
            <Badge label={`${Math.round(data.confidence)}% conf`} />
          ) : null}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <BalanceSheetPanel
          revenue={revenue}
          revYoy={revYoy}
          eps={eps}
          epsYoy={epsYoy}
        />
        <IncomePanel revenue={revenue} eps={eps} revYoy={revYoy} epsYoy={epsYoy} />
      </div>

      {sec ? (
        <section className="border border-wire-800 bg-ink-900/80">
          <header className="border-b border-wire-800 px-3 py-2 text-[9px] uppercase tracking-[0.28em] text-phos/80">
            sec edgar · {sec.filing ?? "latest filing"}
          </header>
          <div className="space-y-2 px-3 py-2 text-[11px] leading-relaxed text-wire-200">
            {sec.headline ? (
              <p className="font-semibold text-wire-100">{sec.headline}</p>
            ) : null}
            {sec.summary ? <p className="text-wire-300">{sec.summary}</p> : null}
            {(revenuePrior != null || epsPrior != null || netIncome != null) ? (
              <div className="grid gap-2 border border-wire-800/80 bg-ink-950/60 p-2 sm:grid-cols-3">
                <MetricCell
                  label="Revenue prior"
                  value={formatMoney(revenuePrior)}
                />
                <MetricCell
                  label="EPS prior"
                  value={epsPrior != null ? `$${epsPrior.toFixed(2)}` : "—"}
                />
                <MetricCell
                  label="Net income"
                  value={formatMoney(netIncome)}
                />
              </div>
            ) : null}
            {sec.management_tone ? (
              <p>
                <span className="text-wire-600">tone: </span>
                {sec.management_tone}
              </p>
            ) : null}
            {sec.guidance ? (
              <p>
                <span className="text-wire-600">guidance: </span>
                {sec.guidance}
              </p>
            ) : null}
            {sec.key_risks ? (
              Array.isArray(sec.key_risks) ? (
                <div className="text-siren/90">
                  <div className="text-wire-600">risks:</div>
                  <ul className="list-disc space-y-1 pl-4">
                    {sec.key_risks.slice(0, 5).map((risk, idx) => (
                      <li key={`${risk}-${idx}`}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-siren/90">
                  <span className="text-wire-600">risks: </span>
                  {sec.key_risks}
                </p>
              )
            ) : null}
            {Array.isArray(sec.one_time_items) && sec.one_time_items.length > 0 ? (
              <div>
                <div className="text-wire-600">one-time items:</div>
                <ul className="list-disc space-y-1 pl-4 text-wire-300">
                  {sec.one_time_items.slice(0, 5).map((item, idx) => (
                    <li key={`${item}-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Array.isArray(sec.quarterly_history) && sec.quarterly_history.length > 0 ? (
              <div className="overflow-x-auto border border-wire-800/80 bg-ink-950/60">
                <table className="w-full min-w-[520px] text-left text-[10px]">
                  <thead className="bg-ink-900 text-wire-500">
                    <tr>
                      <th className="px-2 py-1">Quarter</th>
                      <th className="px-2 py-1">Form</th>
                      <th className="px-2 py-1">Revenue</th>
                      <th className="px-2 py-1">Net income</th>
                      <th className="px-2 py-1">EPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.quarterly_history.slice(0, 6).map((q, idx) => (
                      <tr key={`${q.period_end ?? "q"}-${idx}`} className="border-t border-wire-900">
                        <td className="px-2 py-1 text-wire-300">
                          {q.period_end ?? "—"} {q.fiscal_period ? `(${q.fiscal_period})` : ""}
                        </td>
                        <td className="px-2 py-1 text-wire-400">{q.form ?? "—"}</td>
                        <td className="px-2 py-1 text-wire-200">{formatMoney(q.revenue)}</td>
                        <td className="px-2 py-1 text-wire-200">{formatMoney(q.net_income)}</td>
                        <td className="px-2 py-1 text-wire-200">
                          {q.eps != null ? `$${q.eps.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {(sec.source || sec.filing_date || sec.filing_form) ? (
              <p className="text-[10px] uppercase tracking-[0.14em] text-wire-600">
                source: {sec.source ?? "sec_edgar"} ·
                {" "}
                {(sec.filing_form ?? "filing").toUpperCase()} {sec.filing_date ?? ""}
              </p>
            ) : null}
            {sec.filing_url ? (
              <a
                href={sec.filing_url}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[10px] uppercase tracking-[0.18em] text-phos underline"
              >
                open filing ↗
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {blocks.length > 0 ? (
        <section>
          <h4 className="mb-2 text-[9px] uppercase tracking-[0.28em] text-wire-600">
            signal breakdown
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {blocks.map(([key, val]) => {
              const block = val as SignalBlock;
              if (!block?.signal && !block?.details) return null;
              return (
                <div
                  key={key}
                  className="border border-wire-800/80 bg-ink-900/50 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase tracking-[0.16em] text-wire-500">
                      {key.replace(/_/g, " ")}
                    </span>
                    {block.signal ? (
                      <SignalDot signal={block.signal} />
                    ) : null}
                  </div>
                  {block.details ? (
                    <p className="mt-1 text-[10px] leading-snug text-wire-300">
                      {block.details}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-wire-600">{label}</div>
      <div className="text-[11px] text-wire-100">{value}</div>
    </div>
  );
}

function BalanceSheetPanel({
  revenue,
  revYoy,
  eps,
  epsYoy,
}: {
  revenue: number | null;
  revYoy: number | null;
  eps: number | null;
  epsYoy: number | null;
}) {
  const assets = [
    { label: "Revenue (TTM)", value: formatMoney(revenue), sub: formatPct(revYoy) },
    { label: "Earnings / share", value: eps != null ? `$${eps.toFixed(2)}` : "—", sub: formatPct(epsYoy) },
    { label: "Cash & equiv.", value: "—", sub: "from filing" },
  ];
  const liab = [
    { label: "Total debt", value: "—", sub: "see 10-K" },
    { label: "Shareholders' eq.", value: "—", sub: "implied" },
  ];

  return (
    <div className="border border-wire-800 bg-ink-900/70 font-mono text-[10px]">
      <div className="grid grid-cols-2 border-b border-wire-800 text-[8px] uppercase tracking-[0.22em] text-wire-600">
        <span className="px-2 py-1">assets</span>
        <span className="border-l border-wire-800 px-2 py-1">liabilities</span>
      </div>
      <div className="grid grid-cols-2">
        <ul className="space-y-2 border-r border-wire-800 p-2">
          {assets.map((row) => (
            <LedgerRow key={row.label} {...row} />
          ))}
        </ul>
        <ul className="space-y-2 p-2">
          {liab.map((row) => (
            <LedgerRow key={row.label} {...row} />
          ))}
        </ul>
      </div>
      <div className="border-t border-wire-800 px-2 py-1 text-[8px] text-wire-600">
        virtual balance sheet · sec xbrl
      </div>
    </div>
  );
}

function IncomePanel({
  revenue,
  eps,
  revYoy,
  epsYoy,
}: {
  revenue: number | null;
  eps: number | null;
  revYoy: number | null;
  epsYoy: number | null;
}) {
  const maxBar = Math.max(revenue ?? 0, (eps ?? 0) * 1e8, 1);
  const revW = revenue != null ? Math.min(100, (revenue / maxBar) * 100) : 0;
  const epsW = eps != null ? Math.min(100, ((eps * 1e8) / maxBar) * 100) : 0;

  return (
    <div className="border border-wire-800 bg-ink-900/70 p-2">
      <div className="mb-2 text-[8px] uppercase tracking-[0.22em] text-wire-600">
        income statement pulse
      </div>
      <BarRow label="Revenue" width={revW} value={formatMoney(revenue)} delta={formatPct(revYoy)} />
      <BarRow label="EPS" width={epsW} value={eps != null ? `$${eps.toFixed(2)}` : "—"} delta={formatPct(epsYoy)} />
    </div>
  );
}

function LedgerRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <li>
      <div className="flex justify-between gap-1 text-wire-500">
        <span>{label}</span>
        <span className="text-wire-200">{value}</span>
      </div>
      <div className="text-[9px] text-phos/70">{sub}</div>
    </li>
  );
}

function BarRow({
  label,
  width,
  value,
  delta,
}: {
  label: string;
  width: number;
  value: string;
  delta: string;
}) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-[9px] text-wire-500">
        <span>{label}</span>
        <span>
          {value} <span className="text-phos/80">{delta}</span>
        </span>
      </div>
      <div className="h-2 bg-wire-900">
        <div
          className="h-full bg-phos/60 transition-all duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function SignalDot({ signal }: { signal: string }) {
  const cls =
    signal === "bullish"
      ? "bg-phos text-ink-950"
      : signal === "bearish"
        ? "bg-siren text-ink-950"
        : "bg-wire-700 text-wire-200";
  return (
    <span className={`px-1 py-0.5 text-[8px] uppercase ${cls}`}>{signal}</span>
  );
}

function Badge({
  label,
  accent,
  warn,
}: {
  label: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={`border px-1.5 py-0.5 ${
        warn
          ? "border-siren/50 text-siren"
          : accent
            ? "border-phos/40 text-phos"
            : "border-wire-800 text-wire-500"
      }`}
    >
      {label}
    </span>
  );
}
