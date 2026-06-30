import {
  createSchedule,
  SCHEDULE_TEMPLATES,
  type ScheduleCreatePayload,
} from "../../lib/schedule";

interface Props {
  tickers: string;
  enabledAgentKeys: string[];
  onCreated: () => void;
}

export function ScheduleTemplateCards({ tickers, enabledAgentKeys, onCreated }: Props) {
  const tickerList = tickers
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 8);

  const apply = async (template: (typeof SCHEDULE_TEMPLATES)[number]) => {
    const payload: ScheduleCreatePayload = {
      label: template.label,
      template_key: template.key,
      time_local: template.time_local,
      recurrence: template.recurrence,
      days_of_week: "days_of_week" in template ? [...template.days_of_week] : undefined,
      tickers: tickerList,
      enabled_agent_keys: enabledAgentKeys,
    };
    await createSchedule(payload);
    onCreated();
  };

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {SCHEDULE_TEMPLATES.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => void apply(t).catch(() => {})}
          className="rounded-sm border border-wire-900 bg-ink-950/80 px-3 py-2.5 text-left transition hover:border-brass/35 hover:bg-brass/5"
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brass">
            {t.label}
          </p>
          <p className="mt-1 font-mono text-[9px] leading-relaxed text-wire-500">
            {t.description}
          </p>
        </button>
      ))}
    </div>
  );
}
