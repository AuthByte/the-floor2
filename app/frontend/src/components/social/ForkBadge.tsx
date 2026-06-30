interface Props {
  compact?: boolean;
}

export function ForkBadge({ compact }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded border border-phos/40 bg-phos/10 font-mono font-semibold uppercase tracking-[0.22em] text-phos ${
        compact ? "px-1.5 py-0.5 text-[7px]" : "px-2 py-0.5 text-[8px]"
      }`}
    >
      Fork
    </span>
  );
}
